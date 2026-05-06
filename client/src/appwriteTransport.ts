import { Client as AppwriteSdkClient, Databases, Permission, Role } from "appwrite";
import { filterChatText } from "../../shared/src/chatFilter";
import {
  COLOR_META,
  DEFAULT_TURN_TIME_LIMIT_MS,
  MAX_TURN_TIME_LIMIT_MS,
  MIN_TURN_TIME_LIMIT_MS,
  PLAYER_COLORS,
  getDefaultBotCountForMode,
  getMaxPlayersForMode,
} from "../../shared/src/constants";
import {
  advanceToNextPlayer,
  applyMove,
  createInitialSnapshot,
  createPieces,
  getActivePlayer,
  getAvailableColors,
  getLegalMoves,
  resetForRematch,
  shouldKeepRollingAfterMiss,
  sortPlayersClockwise,
} from "../../shared/src/rules";
import type { ChatMessage, GameMode, GameStateSnapshot, PlayerColor, PlayerState } from "../../shared/src/types";

export interface SavedRoomSession {
  roomId: string;
  reconnectToken: string;
}

export interface CreateRoomOptions {
  name?: string;
  color?: PlayerColor;
  customColor?: string;
  botCount?: number;
  gameMode?: GameMode;
  strikeRequired?: boolean;
  turnTimeLimitMs?: number;
}

export interface JoinRoomOptions {
  name?: string;
  color?: PlayerColor;
  customColor?: string;
  reconnectToken?: string;
}

type MessageCallback = (message: unknown) => void;
type StateCallback = (state: GameStateSnapshot) => void;
type LeaveCallback = () => void;
type MutationResult = { state: GameStateSnapshot; messages?: Array<{ type: string; payload: unknown }> };

interface RoomDocument {
  $id: string;
  stateJson: string;
  updatedAt: number;
  version?: number;
}

const APPWRITE_ENDPOINT = import.meta.env.VITE_APPWRITE_ENDPOINT || "https://fra.cloud.appwrite.io/v1";
const APPWRITE_PROJECT_ID = import.meta.env.VITE_APPWRITE_PROJECT_ID || "69fb49590031e1a0072f";
const APPWRITE_DATABASE_ID = import.meta.env.VITE_APPWRITE_DATABASE_ID || "ludo";
const APPWRITE_ROOMS_COLLECTION_ID = import.meta.env.VITE_APPWRITE_ROOMS_COLLECTION_ID || "rooms";
const ADMIN_CHAT_TRIGGER = "ADMIN!";
const ADMIN_CENSORED_MESSAGE = "***";

export class AppwriteGameClient {
  private readonly sdk = new AppwriteSdkClient()
    .setEndpoint(APPWRITE_ENDPOINT)
    .setProject(APPWRITE_PROJECT_ID);
  private readonly databases = new Databases(this.sdk);

  async create(_roomName: string, options: CreateRoomOptions): Promise<AppwriteRoom> {
    const roomId = createRoomCode();
    const sessionId = getOrCreateSessionId();
    const gameMode = normalizeGameMode(options.gameMode);
    const color = getAvailableColors([], gameMode).includes(options.color as PlayerColor)
      ? options.color as PlayerColor
      : getAvailableColors([], gameMode)[0] || "blue";
    const playerName = cleanPlayerName(options.name) || "Spieler 1";
    const snapshot = createInitialSnapshot(roomId, Boolean(options.strikeRequired), gameMode);
    snapshot.settings.turnTimeLimitMs = clampTurnTimeLimit(options.turnTimeLimitMs);
    snapshot.hostId = sessionId;
    snapshot.players.push({
      id: sessionId,
      name: playerName,
      color,
      customColor: cleanCustomColor(options.customColor, COLOR_META[color].hex),
      ready: false,
      connected: true,
      isBot: false,
      pieces: createPieces(color),
    });

    const configuredBotCount = options.botCount === undefined
      ? getDefaultBotCountForMode(gameMode)
      : Number(options.botCount || 0);
    addBotsToSnapshot(snapshot, Math.max(0, Math.min(getMaxPlayersForMode(gameMode) - 1, configuredBotCount)));
    snapshot.players = sortPlayersClockwise(snapshot.players, gameMode);
    snapshot.lastEvent = `${playerName} ist beigetreten.`;
    addSystemMessage(snapshot, `${playerName} ist dem Spiel beigetreten.`);
    snapshot.updatedAt = Date.now();

    await this.databases.createDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_ROOMS_COLLECTION_ID,
      roomId,
      {
        stateJson: JSON.stringify(snapshot),
        updatedAt: snapshot.updatedAt,
        version: 1,
      },
      [
        Permission.read(Role.any()),
        Permission.update(Role.any()),
        Permission.delete(Role.any()),
      ],
    );

    const room = new AppwriteRoom(this.sdk, this.databases, roomId, sessionId, createSeatToken(color), snapshot);
    room.emitSessionInfo();
    return room;
  }

  async joinById(roomId: string, options: JoinRoomOptions): Promise<AppwriteRoom> {
    const normalizedRoomId = roomId.trim().toUpperCase();
    const sessionId = getOrCreateSessionId();
    const reconnectToken = String(options.reconnectToken || "").trim();
    const document = await this.getRoomDocument(normalizedRoomId);
    const current = parseState(document);
    const result = joinSnapshot(current, sessionId, reconnectToken, options);
    const player = result.players.find((entry) => entry.id === sessionId);
    const token = reconnectToken || createSeatToken(player?.color || "blue");
    await this.databases.updateDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_ROOMS_COLLECTION_ID,
      normalizedRoomId,
      {
        stateJson: JSON.stringify(result),
        updatedAt: result.updatedAt,
        version: Number(document.version || 0) + 1,
      },
    );

    const room = new AppwriteRoom(this.sdk, this.databases, normalizedRoomId, sessionId, token, result);
    room.emitSessionInfo();
    return room;
  }

  private async getRoomDocument(roomId: string): Promise<RoomDocument> {
    return await this.databases.getDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_ROOMS_COLLECTION_ID,
      roomId,
    ) as unknown as RoomDocument;
  }
}

export class AppwriteRoom {
  readonly roomId: string;
  readonly sessionId: string;
  state: GameStateSnapshot;
  private readonly stateCallbacks = new Set<StateCallback>();
  private readonly messageCallbacks = new Map<string, Set<MessageCallback>>();
  private readonly leaveCallbacks = new Set<LeaveCallback>();
  private readonly unsubscribe: () => void;
  private closed = false;

  constructor(
    sdk: AppwriteSdkClient,
    private readonly databases: Databases,
    roomId: string,
    sessionId: string,
    private readonly reconnectToken: string,
    initialState: GameStateSnapshot,
  ) {
    this.roomId = roomId;
    this.sessionId = sessionId;
    this.state = initialState;
    this.unsubscribe = sdk.subscribe(
      `databases.${APPWRITE_DATABASE_ID}.collections.${APPWRITE_ROOMS_COLLECTION_ID}.documents.${roomId}`,
      (event) => {
        const document = event.payload as unknown as RoomDocument;
        if (document?.stateJson) {
          this.applyState(parseState(document));
        }
      },
    );
  }

  onStateChange(callback: StateCallback): void {
    this.stateCallbacks.add(callback);
  }

  onMessage(type: string, callback: MessageCallback): void {
    const callbacks = this.messageCallbacks.get(type) || new Set<MessageCallback>();
    callbacks.add(callback);
    this.messageCallbacks.set(type, callbacks);
  }

  onLeave(callback: LeaveCallback): void {
    this.leaveCallbacks.add(callback);
  }

  async send(type: string, payload: Record<string, unknown> = {}): Promise<void> {
    if (this.closed) {
      return;
    }

    try {
      const result = await this.mutate((state) => this.reduce(type, payload, state));
      for (const message of result.messages || []) {
        this.emitMessage(message.type, message.payload);
      }
    } catch (error) {
      this.emitMessage("errorMessage", { message: getErrorMessage(error) });
    }
  }

  leave(): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.unsubscribe();
    void this.markDisconnected();
    for (const callback of this.leaveCallbacks) {
      callback();
    }
  }

  emitSessionInfo(): void {
    window.setTimeout(() => {
      this.emitMessage("sessionInfo", {
        roomId: this.roomId,
        reconnectToken: this.reconnectToken,
      });
    }, 100);
  }

  async playHostAutomation(): Promise<void> {
    const activePlayer = getActivePlayer(this.state);
    if (!activePlayer || this.state.hostId !== this.sessionId || !activePlayer.isBot) {
      return;
    }

    await this.send("__botStep", {});
  }

  private async mutate(reducer: (state: GameStateSnapshot) => MutationResult): Promise<MutationResult> {
    const document = await this.getDocument();
    const state = parseState(document);
    const result = reducer(state);
    result.state.updatedAt = Date.now();
    await this.databases.updateDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_ROOMS_COLLECTION_ID,
      this.roomId,
      {
        stateJson: JSON.stringify(result.state),
        updatedAt: result.state.updatedAt,
        version: Number(document.version || 0) + 1,
      },
    );
    this.applyState(result.state);
    return result;
  }

  private async getDocument(): Promise<RoomDocument> {
    return await this.databases.getDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_ROOMS_COLLECTION_ID,
      this.roomId,
    ) as unknown as RoomDocument;
  }

  private applyState(state: GameStateSnapshot): void {
    this.state = state;
    for (const callback of this.stateCallbacks) {
      callback(state);
    }
  }

  private emitMessage(type: string, payload: unknown): void {
    for (const callback of this.messageCallbacks.get(type) || []) {
      callback(payload);
    }
  }

  private reduce(type: string, payload: Record<string, unknown>, state: GameStateSnapshot): MutationResult {
    switch (type) {
      case "toggleReady":
        return { state: setReady(state, this.sessionId, Boolean(payload.ready)) };
      case "setChatFilter":
        return { state: hostOnly(state, this.sessionId, (next) => setChatFilter(next, Boolean(payload.enabled))) };
      case "setTurnTimeLimit":
        return { state: hostOnly(state, this.sessionId, (next) => setTurnTimeLimit(next, payload.turnTimeLimitMs)) };
      case "setCustomColor":
        return { state: setCustomColor(state, this.sessionId, payload.customColor) };
      case "addBot":
        return { state: hostOnly(state, this.sessionId, addBot) };
      case "startGame":
        return { state: hostOnly(state, this.sessionId, startGame) };
      case "kickPlayer":
        return { state: hostOnly(state, this.sessionId, (next) => kickPlayer(next, this.sessionId, String(payload.playerId || ""))) };
      case "rollDice":
        return { state: rollForPlayer(state, this.sessionId) };
      case "movePiece":
        return { state: moveForPlayer(state, this.sessionId, String(payload.pieceId || "")) };
      case "sendChat":
        return sendChat(state, this.sessionId, String(payload.text || ""));
      case "reportChatWord":
        return reportChatWord(state, this.sessionId);
      case "requestRematch":
        return { state: requestRematch(state, this.sessionId) };
      case "__botStep":
        return { state: playBotStep(state) };
      case "adminSkipTurn":
        return { state: adminSkipTurn(state, this.sessionId), messages: adminAccepted("Zug übersprungen.") };
      case "adminGiveTurn":
        return { state: adminGiveTurn(state, this.sessionId, String(payload.playerId || "")), messages: adminAccepted("Zug vergeben.") };
      case "adminResetPlayerPieces":
        return { state: adminResetPlayerPieces(state, this.sessionId, String(payload.playerId || "")), messages: adminAccepted("Spieler zurückgesetzt.") };
      case "adminKickPlayer":
        return { state: adminKickPlayer(state, this.sessionId, String(payload.playerId || "")), messages: adminAccepted("Spieler entfernt.") };
      case "adminSetDiceBias":
      case "adminForceDice":
      case "adminBanPlayerIp":
        return { state, messages: adminAccepted("Diese Admin-Aktion ist in der Appwrite-Version nicht verfügbar.") };
      default:
        return { state };
    }
  }

  private async markDisconnected(): Promise<void> {
    try {
      await this.mutate((state) => {
        const player = state.players.find((entry) => entry.id === this.sessionId);
        if (!player || player.isBot) {
          return { state };
        }

        player.connected = false;
        player.ready = false;
        state.lastEvent = `${player.name} ist offline.`;
        addSystemMessage(state, state.lastEvent);
        return { state };
      });
    } catch {
      // Leaving the page should never block local UI cleanup.
    }
  }
}

function joinSnapshot(state: GameStateSnapshot, sessionId: string, token: string, options: JoinRoomOptions): GameStateSnapshot {
  const existing = findReconnectPlayer(state, token);
  if (existing) {
    existing.id = sessionId;
    existing.connected = true;
    if (state.status === "lobby") {
      existing.ready = false;
    }
    if (!state.hostId) {
      state.hostId = sessionId;
    }
    state.lastEvent = `${existing.name} ist wieder beigetreten.`;
    addSystemMessage(state, state.lastEvent);
    state.updatedAt = Date.now();
    return state;
  }

  if (state.status !== "lobby") {
    throw new Error("Dieses Spiel läuft bereits.");
  }

  if (state.players.length >= getMaxPlayersForMode(state.gameMode)) {
    throw new Error("Der Raum ist voll.");
  }

  const availableColors = getAvailableColors(state.players, state.gameMode);
  const requestedColor = isPlayerColorForMode(options.color, state.gameMode) ? options.color : undefined;
  const color = requestedColor && availableColors.includes(requestedColor) ? requestedColor : availableColors[0];
  if (!color) {
    throw new Error("Keine Farbe mehr frei.");
  }

  const playerName = cleanPlayerName(options.name) || `Spieler ${state.players.length + 1}`;
  state.players.push({
    id: sessionId,
    name: playerName,
    color,
    customColor: cleanCustomColor(options.customColor, COLOR_META[color].hex),
    ready: false,
    connected: true,
    isBot: false,
    pieces: createPieces(color),
  });
  state.players = sortPlayersClockwise(state.players, state.gameMode);
  state.lastEvent = `${playerName} ist beigetreten.`;
  addSystemMessage(state, `${playerName} ist dem Spiel beigetreten.`);
  state.updatedAt = Date.now();
  return state;
}

function setReady(state: GameStateSnapshot, playerId: string, ready: boolean): GameStateSnapshot {
  assertLobby(state, "Bereit kann nur in der Lobby gesetzt werden.");
  const player = getHumanPlayer(state, playerId);
  player.ready = ready;
  state.lastEvent = `${player.name} ist ${ready ? "bereit" : "nicht bereit"}.`;
  return state;
}

function setChatFilter(state: GameStateSnapshot, enabled: boolean): GameStateSnapshot {
  assertLobby(state, "Der Chat-Filter kann nur in der Lobby geändert werden.");
  state.settings.chatFilterEnabled = enabled;
  state.lastEvent = `Chat-Filter ist ${enabled ? "aktiv" : "inaktiv"}.`;
  addSystemMessage(state, state.lastEvent);
  return state;
}

function setTurnTimeLimit(state: GameStateSnapshot, value: unknown): GameStateSnapshot {
  assertLobby(state, "Die Zugzeit kann nur in der Lobby geändert werden.");
  state.settings.turnTimeLimitMs = clampTurnTimeLimit(value);
  state.lastEvent = `Zugzeit auf ${Math.round(state.settings.turnTimeLimitMs / 1000)} Sekunden gesetzt.`;
  addSystemMessage(state, state.lastEvent);
  return state;
}

function setCustomColor(state: GameStateSnapshot, playerId: string, value: unknown): GameStateSnapshot {
  assertLobby(state, "Die Spielerfarbe kann nur in der Lobby geändert werden.");
  const player = getHumanPlayer(state, playerId);
  player.customColor = cleanCustomColor(value, COLOR_META[player.color].hex);
  player.ready = false;
  state.lastEvent = `${player.name} hat die Spielerfarbe angepasst.`;
  return state;
}

function addBot(state: GameStateSnapshot): GameStateSnapshot {
  assertLobby(state, "Bots können nur in der Lobby hinzugefügt werden.");
  if (!addBotsToSnapshot(state, 1)) {
    throw new Error("Keine Farbe mehr frei.");
  }
  state.players = sortPlayersClockwise(state.players, state.gameMode);
  state.lastEvent = "Ein Computerspieler wurde hinzugefügt.";
  addSystemMessage(state, state.lastEvent);
  return state;
}

function startGame(state: GameStateSnapshot): GameStateSnapshot {
  assertLobby(state, "Das Spiel läuft bereits.");
  const blocker = getStartBlocker(state);
  if (blocker) {
    throw new Error(blocker);
  }

  state.players = sortPlayersClockwise(state.players, state.gameMode).map((player) => ({
    ...player,
    customColor: cleanCustomColor(player.customColor, COLOR_META[player.color].hex),
    pieces: createPieces(player.color),
  }));
  state.status = "playing";
  state.currentPlayerIndex = Math.max(0, state.players.findIndex((player) => player.connected || player.isBot));
  state.diceValue = 0;
  state.diceRolled = false;
  state.rollAttempts = 0;
  state.legalMoves = [];
  state.winnerColor = "";
  state.lastEvent = `${getActivePlayer(state)?.name || "Ein Spieler"} beginnt.`;
  addSystemMessage(state, "Das Spiel startet.");
  startTurnWindow(state);
  return state;
}

function kickPlayer(state: GameStateSnapshot, hostId: string, targetPlayerId: string): GameStateSnapshot {
  assertLobby(state, "Spieler können nur in der Lobby entfernt werden.");
  const target = state.players.find((player) => player.id === targetPlayerId);
  if (!target) {
    throw new Error("Spieler nicht gefunden.");
  }
  if (target.id === state.hostId || target.id === hostId) {
    throw new Error("Der Host kann nicht entfernt werden.");
  }
  state.players = sortPlayersClockwise(state.players.filter((player) => player.id !== target.id), state.gameMode);
  state.currentPlayerIndex = 0;
  state.lastEvent = `${target.name} wurde vom Host entfernt.`;
  addSystemMessage(state, state.lastEvent);
  return state;
}

function rollForPlayer(state: GameStateSnapshot, playerId: string): GameStateSnapshot {
  const activePlayer = getActivePlayer(state);
  if (!activePlayer || activePlayer.id !== playerId || activePlayer.isBot) {
    throw new Error("Du bist gerade nicht am Zug.");
  }
  return rollForActivePlayer(state);
}

function rollForActivePlayer(state: GameStateSnapshot): GameStateSnapshot {
  const activePlayer = getActivePlayer(state);
  if (!activePlayer || state.status !== "playing") {
    return state;
  }
  if (state.diceRolled) {
    return state;
  }

  const dice = rollDiceValue();
  state.diceValue = dice;
  state.diceRolled = true;
  state.rollAttempts += 1;
  state.legalMoves = getLegalMoves(state);

  if (state.legalMoves.length === 0) {
    if (dice === 6) {
      state.diceRolled = false;
      state.rollAttempts = 0;
      state.lastEvent = `${activePlayer.name} würfelt eine 6, kann nicht ziehen und darf nochmal würfeln.`;
    } else if (shouldKeepRollingAfterMiss(state)) {
      state.diceRolled = false;
      state.lastEvent = `${activePlayer.name} braucht eine 6. Versuch ${state.rollAttempts}/3.`;
    } else {
      const event = `${activePlayer.name} würfelt ${dice}; kein Zug möglich.`;
      state = advanceToNextPlayer(state);
      state.diceValue = dice;
      state.diceRolled = false;
      state.rollAttempts = 0;
      state.legalMoves = [];
      state.lastEvent = `${event} ${getActivePlayer(state)?.name || "Niemand"} ist dran.`;
    }
  } else {
    state.lastEvent = `${activePlayer.name} würfelt ${dice}.`;
  }

  keepOrStartTurnWindow(state, activePlayer.id);
  return state;
}

function moveForPlayer(state: GameStateSnapshot, playerId: string, pieceId: string): GameStateSnapshot {
  const activePlayer = getActivePlayer(state);
  if (!activePlayer || activePlayer.id !== playerId || activePlayer.isBot) {
    throw new Error("Du bist gerade nicht am Zug.");
  }
  return moveActivePiece(state, pieceId);
}

function moveActivePiece(state: GameStateSnapshot, pieceId: string): GameStateSnapshot {
  const activePlayer = getActivePlayer(state);
  const beforeDiceValue = state.diceValue;
  const result = applyMove(state, pieceId);
  if (result.error || !result.move || !activePlayer) {
    throw new Error(result.error || "Zug nicht möglich.");
  }

  state = result.state;
  const captureText = result.move.captures.length > 0 ? " und schlägt eine Figur" : "";
  if (state.status === "finished") {
    state.lastEvent = `${activePlayer.name} zieht${captureText} und gewinnt.`;
    addSystemMessage(state, state.lastEvent);
    clearTurnWindow(state);
    return state;
  }

  if (beforeDiceValue === 6) {
    state.diceValue = 0;
    state.diceRolled = false;
    state.rollAttempts = 0;
    state.legalMoves = [];
    state.lastEvent = `${activePlayer.name} zieht${captureText} und darf nochmal würfeln.`;
  } else {
    const event = `${activePlayer.name} zieht${captureText}.`;
    state = advanceToNextPlayer(state);
    state.lastEvent = `${event} ${getActivePlayer(state)?.name || "Niemand"} ist dran.`;
  }

  keepOrStartTurnWindow(state, activePlayer.id);
  return state;
}

function sendChat(state: GameStateSnapshot, playerId: string, rawText: string): MutationResult {
  const player = state.players.find((entry) => entry.id === playerId);
  const text = rawText.trim().replace(/\s+/g, " ").slice(0, 240);
  if (!player || !text) {
    return { state };
  }

  if (text.trim().toUpperCase() === ADMIN_CHAT_TRIGGER) {
    state.chat.push({
      id: createId("chat"),
      playerName: player.name,
      color: player.color,
      text: ADMIN_CENSORED_MESSAGE,
      createdAt: Date.now(),
    });
    trimChat(state);
    return {
      state,
      messages: [{ type: "adminUnlocked", payload: { message: "Admin-Menü freigeschaltet." } }],
    };
  }

  state.chat.push({
    id: createId("chat"),
    playerName: player.name,
    color: player.color,
    text: state.settings.chatFilterEnabled ? filterChatText(text) : text,
    createdAt: Date.now(),
  });
  trimChat(state);
  return { state };
}

function reportChatWord(state: GameStateSnapshot, _playerId: string): MutationResult {
  addSystemMessage(state, "Report angenommen. Der Appwrite-Chat nutzt den Basisfilter.");
  return {
    state,
    messages: [{ type: "reportAccepted", payload: { message: "Report angenommen." } }],
  };
}

function requestRematch(state: GameStateSnapshot, playerId: string): GameStateSnapshot {
  const player = state.players.find((entry) => entry.id === playerId);
  if (!player) {
    throw new Error("Spieler nicht gefunden.");
  }
  const rematch = resetForRematch(state);
  clearTurnWindow(rematch);
  addSystemMessage(rematch, `${player.name} hat eine Revanche gestartet.`);
  return rematch;
}

function playBotStep(state: GameStateSnapshot): GameStateSnapshot {
  const activePlayer = getActivePlayer(state);
  if (state.status !== "playing" || !activePlayer?.isBot) {
    return state;
  }
  if (!state.diceRolled) {
    return rollForActivePlayer(state);
  }
  const move = chooseBotMove(state);
  return move ? moveActivePiece(state, move.pieceId) : state;
}

function adminSkipTurn(state: GameStateSnapshot, adminId: string): GameStateSnapshot {
  assertAdmin(state, adminId);
  const active = getActivePlayer(state);
  if (!active || state.status !== "playing") {
    throw new Error("Es läuft gerade kein Zug.");
  }
  const skippedName = active.name;
  state = advanceToNextPlayer(state);
  startTurnWindow(state);
  state.lastEvent = `${skippedName} wurde vom Admin übersprungen. ${getActivePlayer(state)?.name || "Niemand"} ist dran.`;
  addSystemMessage(state, state.lastEvent);
  return state;
}

function adminGiveTurn(state: GameStateSnapshot, adminId: string, targetPlayerId: string): GameStateSnapshot {
  assertAdmin(state, adminId);
  const targetIndex = state.players.findIndex((player) => player.id === targetPlayerId);
  if (state.status !== "playing" || targetIndex < 0) {
    throw new Error("Der Zug kann nur in einer laufenden Partie vergeben werden.");
  }
  state.currentPlayerIndex = targetIndex;
  state.diceValue = 0;
  state.diceRolled = false;
  state.rollAttempts = 0;
  state.legalMoves = [];
  startTurnWindow(state);
  state.lastEvent = `${state.players[targetIndex]?.name || "Ein Spieler"} ist durch den Admin am Zug.`;
  addSystemMessage(state, state.lastEvent);
  return state;
}

function adminResetPlayerPieces(state: GameStateSnapshot, adminId: string, targetPlayerId: string): GameStateSnapshot {
  assertAdmin(state, adminId);
  const target = state.players.find((player) => player.id === targetPlayerId);
  if (!target) {
    throw new Error("Spieler nicht gefunden.");
  }
  target.pieces = createPieces(target.color);
  state.winnerColor = state.winnerColor === target.color ? "" : state.winnerColor;
  if (state.status === "finished") {
    state.status = "playing";
    startTurnWindow(state);
  }
  state.lastEvent = `${target.name} wurde vom Admin zurückgesetzt.`;
  addSystemMessage(state, state.lastEvent);
  return state;
}

function adminKickPlayer(state: GameStateSnapshot, adminId: string, targetPlayerId: string): GameStateSnapshot {
  assertAdmin(state, adminId);
  const target = state.players.find((player) => player.id === targetPlayerId);
  if (!target) {
    throw new Error("Spieler nicht gefunden.");
  }
  if (target.id === adminId) {
    throw new Error("Du kannst dich nicht selbst entfernen.");
  }
  target.connected = false;
  target.ready = false;
  state.lastEvent = `${target.name} wurde vom Admin entfernt.`;
  addSystemMessage(state, state.lastEvent);
  return state;
}

function hostOnly(state: GameStateSnapshot, playerId: string, reducer: (state: GameStateSnapshot) => GameStateSnapshot): GameStateSnapshot {
  if (state.hostId !== playerId) {
    throw new Error("Nur der Host kann diese Aktion ausführen.");
  }
  return reducer(state);
}

function assertAdmin(state: GameStateSnapshot, adminId: string): void {
  const player = state.players.find((entry) => entry.id === adminId);
  if (!player) {
    throw new Error("Spieler nicht gefunden.");
  }
}

function getHumanPlayer(state: GameStateSnapshot, playerId: string): PlayerState {
  const player = state.players.find((entry) => entry.id === playerId && !entry.isBot);
  if (!player) {
    throw new Error("Spieler nicht gefunden.");
  }
  return player;
}

function assertLobby(state: GameStateSnapshot, message: string): void {
  if (state.status !== "lobby") {
    throw new Error(message);
  }
}

function addBotsToSnapshot(snapshot: GameStateSnapshot, amount: number): boolean {
  let added = 0;
  for (let index = 0; index < amount; index += 1) {
    const color = getAvailableColors(snapshot.players, snapshot.gameMode)[0];
    if (!color) {
      break;
    }

    snapshot.players.push({
      id: `bot-${color}`,
      name: `${COLOR_META[color].label}-Computer`,
      color,
      customColor: COLOR_META[color].hex,
      ready: true,
      connected: true,
      isBot: true,
      pieces: createPieces(color),
    });
    added += 1;
  }

  return added > 0;
}

function startTurnWindow(snapshot: GameStateSnapshot): void {
  if (snapshot.status !== "playing") {
    clearTurnWindow(snapshot);
    return;
  }
  const now = Date.now();
  snapshot.settings.turnTimeLimitMs = clampTurnTimeLimit(snapshot.settings.turnTimeLimitMs);
  snapshot.turnStartedAt = now;
  snapshot.turnDeadlineAt = now + snapshot.settings.turnTimeLimitMs;
}

function keepOrStartTurnWindow(snapshot: GameStateSnapshot, previousPlayerId: string): void {
  const activePlayer = getActivePlayer(snapshot);
  if (!activePlayer || activePlayer.id !== previousPlayerId || !snapshot.turnStartedAt || !snapshot.turnDeadlineAt) {
    startTurnWindow(snapshot);
  }
}

function clearTurnWindow(snapshot: GameStateSnapshot): void {
  snapshot.turnStartedAt = 0;
  snapshot.turnDeadlineAt = 0;
}

function getStartBlocker(snapshot: GameStateSnapshot): string {
  const activePlayers = snapshot.players.filter((player) => player.connected || player.isBot);
  const disconnectedPlayers = snapshot.players.filter((player) => !player.connected && !player.isBot);
  const waitingPlayers = snapshot.players.filter((player) => player.connected && !player.isBot && !player.ready);
  if (activePlayers.length < 2) {
    return "Mindestens zwei Spieler oder Computer werden benötigt.";
  }
  if (disconnectedPlayers.length > 0) {
    return "Es gibt disconnected Spieler. Warte auf Rejoin oder entferne sie als Host.";
  }
  if (waitingPlayers.length > 0) {
    return "Noch nicht alle Spieler sind bereit.";
  }
  return "";
}

function chooseBotMove(snapshot: GameStateSnapshot) {
  return [...snapshot.legalMoves].sort((a, b) => {
    if (a.captures.length !== b.captures.length) {
      return b.captures.length - a.captures.length;
    }
    if (a.from !== b.from) {
      return b.from - a.from;
    }
    return a.pieceId.localeCompare(b.pieceId);
  })[0];
}

function findReconnectPlayer(state: GameStateSnapshot, token: string): PlayerState | undefined {
  if (!token) {
    return undefined;
  }
  const color = token.split("-")[1];
  return state.players.find((player) => !player.isBot && player.color === color);
}

function addSystemMessage(snapshot: GameStateSnapshot, text: string): void {
  snapshot.chat.push({
    id: createId("system"),
    playerName: "System",
    color: "system",
    text,
    createdAt: Date.now(),
  });
  trimChat(snapshot);
}

function trimChat(snapshot: GameStateSnapshot): void {
  if (snapshot.chat.length > 80) {
    snapshot.chat = snapshot.chat.slice(snapshot.chat.length - 80);
  }
}

function parseState(document: RoomDocument): GameStateSnapshot {
  return JSON.parse(document.stateJson) as GameStateSnapshot;
}

function cleanPlayerName(value?: string): string {
  const name = String(value || "").trim().replace(/\s+/g, " ").slice(0, 24);
  return filterChatText(name) === name ? name : "";
}

function cleanCustomColor(value: unknown, fallback: string): string {
  const color = String(value || "").trim().toLowerCase();
  return Object.values(COLOR_META).some((entry) => entry.hex.toLowerCase() === color) ? color : fallback;
}

function clampTurnTimeLimit(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_TURN_TIME_LIMIT_MS;
  }
  return Math.min(MAX_TURN_TIME_LIMIT_MS, Math.max(MIN_TURN_TIME_LIMIT_MS, Math.round(parsed)));
}

function isPlayerColorForMode(value: unknown, mode: GameMode): value is PlayerColor {
  return PLAYER_COLORS.includes(value as PlayerColor) && getAvailableColors([], mode).includes(value as PlayerColor);
}

function normalizeGameMode(value: unknown): GameMode {
  return value === "singleplayer" || value === "party" ? value : "multiplayer";
}

function rollDiceValue(): number {
  return Math.floor(Math.random() * 6) + 1;
}

function getOrCreateSessionId(): string {
  const key = "mensch:appwrite-session-id";
  const existing = localStorage.getItem(key);
  if (existing) {
    return existing;
  }
  const next = createId("player");
  localStorage.setItem(key, next);
  return next;
}

function createRoomCode(): string {
  return `M${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function createSeatToken(color: PlayerColor): string {
  return `seat-${color}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function adminAccepted(message: string): Array<{ type: string; payload: unknown }> {
  return [{ type: "adminActionAccepted", payload: { message } }];
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Aktion nicht möglich.";
}
