import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, FormEvent, MutableRefObject } from "react";
import { Client, type Room } from "@colyseus/sdk";
import {
  COLOR_META,
  DEFAULT_TURN_TIME_LIMIT_MS,
  MAX_TURN_TIME_LIMIT_MS,
  MIN_TURN_TIME_LIMIT_MS,
} from "../../shared/src/constants";
import type { ChatMessage, GameStateSnapshot, PlayerColor, PlayerState } from "../../shared/src/types";
import { boardAsset, musicAssets, pieceAssets, pieceSvgSources, soundAssets } from "./assets";
import { Board, type CaptureMarker, type PieceMoveAnimation } from "./Board";

const DEFAULT_NAME = "Spieler";
const LAST_ROOM_KEY = "mensch:last-room";
const THEME_STORAGE_KEY = "mensch:theme";
const PLAYER_PREFS_STORAGE_KEY = "mensch:player-prefs:v2";
const RANDOM_NAME_PREFIXES = [
  "LouiBär",
  "FreddyFazbear",
  "KeksKaiser",
  "WürfelWilly",
  "TurboTina",
  "PöppelPaul",
  "MemeMaja",
  "RundenRudi",
  "LudoLena",
  "KäseKönig",
  "KaroKalle",
  "MashaToll",
  "DummerMaher",
  "KalteHaut",
];
const RANDOM_NAME_SUFFIXES = ["69", "83", "17", "404", "7", "21", "99", "11", "42", "58", "2077"];
const DICE_VALUES = [1, 2, 3, 4, 5, 6] as const;
const DICE_PIPS: Record<number, number[]> = {
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
};
const popupPieceAssetCache = new Map<string, string>();

interface SavedRoomSession {
  roomId: string;
  reconnectToken: string;
}

type ThemeMode = "light" | "dark";
type ClickSoundPreset = "classic" | "soft" | "arcade" | "wood";
type UiSoundName = "confirm" | "error" | "toggle" | "start" | "roll" | "move" | "capture" | "win" | "lose" | "turn" | "step";

interface PlayerPreferences {
  dragToMove: boolean;
  musicEnabled: boolean;
  musicVolume: number;
  musicTrackIndex: number;
  clickSoundPreset: ClickSoundPreset;
  clickVolume: number;
}

interface DiceRollStats {
  counts: Record<number, number>;
  total: number;
}

const DEFAULT_PLAYER_PREFERENCES: PlayerPreferences = {
  dragToMove: false,
  musicEnabled: false,
  musicVolume: 0.32,
  musicTrackIndex: 0,
  clickSoundPreset: "arcade",
  clickVolume: 0.42,
};

export function App() {
  const clientRef = useRef<Client | null>(null);
  const moveTimeoutRef = useRef<number | null>(null);
  const moveAnimationTimeoutRef = useRef<number | null>(null);
  const stepSoundTimeoutsRef = useRef<number[]>([]);
  const captureMarkerTimeoutsRef = useRef<number[]>([]);
  const [room, setRoom] = useState<Room | null>(null);
  const [state, setState] = useState<GameStateSnapshot | null>(null);
  const [playerName, setPlayerName] = useState(() => createRandomPlayerName());
  const [selectedColor, setSelectedColor] = useState<PlayerColor>("blue");
  const [selectedCustomColor, setSelectedCustomColor] = useState(COLOR_META.blue.hex);
  const [joinCode, setJoinCode] = useState("");
  const [botCount] = useState(0);
  const [strikeRequired, setStrikeRequired] = useState(false);
  const [turnTimeSeconds, setTurnTimeSeconds] = useState(DEFAULT_TURN_TIME_LIMIT_MS / 1000);
  const [selectedPieceId, setSelectedPieceId] = useState("");
  const [chatText, setChatText] = useState("");
  const [chatReportTarget, setChatReportTarget] = useState<ChatMessage | null>(null);
  const [chatReportWord, setChatReportWord] = useState("");
  const [rulesOpen, setRulesOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [toastTone, setToastTone] = useState<"error" | "success">("error");
  const [busy, setBusy] = useState(false);
  const [savedRoom, setSavedRoom] = useState<SavedRoomSession | null>(() => getSavedRoomSession());
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => getSavedThemeMode());
  const [playerPreferences, setPlayerPreferences] = useState<PlayerPreferences>(() => getSavedPlayerPreferences());
  const [now, setNow] = useState(() => Date.now());
  const [moveAnimation, setMoveAnimation] = useState<PieceMoveAnimation | null>(null);
  const [captureMarkers, setCaptureMarkers] = useState<CaptureMarker[]>([]);
  const [diceRollStats, setDiceRollStats] = useState<DiceRollStats>(() => createEmptyDiceRollStats());
  const previousStateRef = useRef<GameStateSnapshot | null>(null);

  const me = useMemo(
    () => state?.players.find((player) => player.id === room?.sessionId),
    [room?.sessionId, state],
  );
  const activePlayer = state ? state.players[state.currentPlayerIndex] : undefined;
  const isMyTurn = Boolean(state && me && activePlayer?.id === me.id && state.status === "playing");
  const isHost = Boolean(state && me && state.hostId === me.id);
  const canRoll = Boolean(isMyTurn && state && !state.diceRolled);
  const startBlocker = state ? getStartBlocker(state) : "";
  const playSound = (sound: UiSoundName) => playUiSound(sound, playerPreferences);
  const toggleTheme = () => {
    setThemeMode((current) => (current === "dark" ? "light" : "dark"));
  };

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    localStorage.setItem(THEME_STORAGE_KEY, themeMode);
  }, [themeMode]);

  useEffect(() => {
    setSelectedCustomColor(COLOR_META[selectedColor].hex);
  }, [selectedColor]);

  useEffect(() => {
    if (!state) {
      previousStateRef.current = null;
      return;
    }

    const previousState = previousStateRef.current;
    const confirmedMoveAnimation = previousState ? getConfirmedMoveAnimation(previousState, state) : null;
    const confirmedCaptureMarkers = previousState ? getConfirmedCaptureMarkers(previousState, state) : [];
    const confirmedRoll = previousState ? getConfirmedDiceRoll(previousState, state) : null;
    if (confirmedMoveAnimation) {
      startConfirmedMoveAnimation(confirmedMoveAnimation, playerPreferences);
    }
    if (confirmedCaptureMarkers.length > 0) {
      showCaptureMarkers(confirmedCaptureMarkers);
    }
    if (confirmedRoll && confirmedRoll.playerId === room?.sessionId) {
      const rolledValue = confirmedRoll.value;
      setDiceRollStats((current) => addDiceRoll(current, rolledValue));
    }

    playConfirmedStateSounds(previousState, state, room?.sessionId || "", playerPreferences);
    previousStateRef.current = state;
  }, [playerPreferences, room?.sessionId, state]);

  useEffect(() => {
    localStorage.setItem(PLAYER_PREFS_STORAGE_KEY, JSON.stringify(playerPreferences));
  }, [playerPreferences]);

  useEffect(() => {
    if (!state || state.status !== "playing") {
      return;
    }

    const intervalId = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(intervalId);
  }, [state?.status]);

  useEffect(() => {
    setNow(Date.now());
  }, [state?.turnDeadlineAt, state?.turnStartedAt]);

  useEffect(() => {
    return () => {
      if (moveTimeoutRef.current) {
        window.clearTimeout(moveTimeoutRef.current);
      }
      clearMoveAnimationTimers();
      clearCaptureMarkerTimers();
    };
  }, []);

  useEffect(() => {
    if (!errorMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => setErrorMessage(""), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [errorMessage]);

  useEffect(() => {
    if (!state || !selectedPieceId) {
      return;
    }

    if (!state.legalMoves.some((move) => move.pieceId === selectedPieceId)) {
      setSelectedPieceId("");
    }
  }, [selectedPieceId, state]);

  useEffect(() => {
    if (state && !state.settings.chatFilterEnabled) {
      closeChatReport();
    }
  }, [state?.settings.chatFilterEnabled]);

  async function createRoom() {
    setBusy(true);
    setErrorMessage("");
    try {
      const joinedRoom = await getClient(clientRef).create("mensch", {
        name: playerName,
        color: selectedColor,
        customColor: selectedCustomColor,
        botCount,
        strikeRequired,
        turnTimeLimitMs: secondsToMs(turnTimeSeconds),
      });
      attachRoom(joinedRoom);
      playSound("confirm");
    } catch (error) {
      setToastTone("error");
      setErrorMessage(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function joinRoomByCode(codeOverride?: string) {
    const code = (codeOverride || joinCode).trim();
    if (!code) {
      setToastTone("error");
      setErrorMessage("Bitte einen Raumcode eingeben.");
      return;
    }

    setBusy(true);
    setErrorMessage("");
    try {
      const joinedRoom = await getClient(clientRef).joinById(code, {
        name: playerName,
        color: selectedColor,
        customColor: selectedCustomColor,
        reconnectToken: getReconnectToken(code),
      });
      attachRoom(joinedRoom);
      playSound("confirm");
    } catch (error) {
      const message = getErrorMessage(error);
      if (codeOverride && shouldForgetSavedRoom(message)) {
        clearRoomSession(code);
        setSavedRoom(getSavedRoomSession());
      }
      setToastTone("error");
      setErrorMessage(message);
    } finally {
      setBusy(false);
    }
  }

  function attachRoom(joinedRoom: Room) {
    room?.leave();
    setRoom(joinedRoom);
    setJoinCode(joinedRoom.roomId);
    setSelectedPieceId("");
    setChatReportTarget(null);
    setChatReportWord("");
    setDiceRollStats(createEmptyDiceRollStats());
    setState(normalizeState(joinedRoom.state));

    joinedRoom.onStateChange((nextState) => {
      setState(normalizeState(nextState));
    });
    joinedRoom.onMessage("sessionInfo", (message: SavedRoomSession) => {
      if (message.roomId && message.reconnectToken) {
        saveRoomSession(message);
        setSavedRoom(message);
      }
    });
    joinedRoom.onMessage("errorMessage", (message: { message?: string }) => {
      setToastTone("error");
      setErrorMessage(message.message || "Aktion nicht möglich.");
      playSound("error");
    });
    joinedRoom.onMessage("reportAccepted", (message: { message?: string }) => {
      setToastTone("success");
      setErrorMessage(message.message || "Report wurde angenommen.");
      playSound("confirm");
    });
    joinedRoom.onMessage("kicked", (message: { message?: string }) => {
      clearRoomSession(joinedRoom.roomId);
      setSavedRoom(getSavedRoomSession());
      setToastTone("error");
      setErrorMessage(message.message || "Du wurdest aus dem Raum entfernt.");
      playSound("error");
    });
    joinedRoom.onLeave(() => {
      clearMoveAnimationTimers();
      clearCaptureMarkerTimers();
      setRoom(null);
      setState(null);
      setMoveAnimation(null);
      setCaptureMarkers([]);
      setJoinCode("");
      setSelectedPieceId("");
      setChatReportTarget(null);
      setChatReportWord("");
      setDiceRollStats(createEmptyDiceRollStats());
    });
  }

  function sendReady() {
    if (!room || !me) {
      return;
    }

    room.send("toggleReady", { ready: !me.ready });
    playSound("toggle");
  }

  function sendChatFilter(enabled: boolean) {
    if (!enabled) {
      closeChatReport();
    }
    room?.send("setChatFilter", { enabled });
  }

  function sendTurnTimeLimit(seconds: number) {
    const nextSeconds = clampTurnTimeSeconds(seconds);
    setTurnTimeSeconds(nextSeconds);
    room?.send("setTurnTimeLimit", { turnTimeLimitMs: secondsToMs(nextSeconds) });
  }

  function sendCustomColor(customColor: string) {
    setSelectedCustomColor(customColor);
    room?.send("setCustomColor", { customColor });
  }

  function addBot() {
    room?.send("addBot");
    playSound("toggle");
  }

  function startGame() {
    room?.send("startGame");
  }

  function kickPlayer(playerId: string) {
    room?.send("kickPlayer", { playerId });
  }

  function rollDice() {
    if (!room || !canRoll) {
      return;
    }

    room.send("rollDice");
  }

  function movePiece(pieceId: string) {
    const move = state?.legalMoves.find((entry) => entry.pieceId === pieceId);
    if (!room || !move || !isMyTurn) {
      return;
    }

    setSelectedPieceId(pieceId);

    if (moveTimeoutRef.current) {
      window.clearTimeout(moveTimeoutRef.current);
    }

    moveTimeoutRef.current = window.setTimeout(() => {
      room.send("movePiece", { pieceId });
      setSelectedPieceId("");
      moveTimeoutRef.current = null;
    }, 220);
  }

  function startConfirmedMoveAnimation(animation: PieceMoveAnimation, preferences: PlayerPreferences) {
    clearMoveAnimationTimers();
    setMoveAnimation(animation);
    scheduleStepSounds(animation, preferences);
    moveAnimationTimeoutRef.current = window.setTimeout(() => {
      setMoveAnimation(null);
      moveAnimationTimeoutRef.current = null;
    }, animation.durationMs + 90);
  }

  function scheduleStepSounds(animation: PieceMoveAnimation, preferences: PlayerPreferences) {
    const steps = getMoveStepCount(animation.from, animation.to);
    if (steps <= 0) {
      return;
    }

    const stepDelay = animation.durationMs / Math.max(1, steps);
    for (let index = 0; index < steps; index += 1) {
      const timeoutId = window.setTimeout(() => {
        playUiSound("step", preferences, 0.56);
      }, Math.round(index * stepDelay + 40));
      stepSoundTimeoutsRef.current.push(timeoutId);
    }
  }

  function clearMoveAnimationTimers() {
    if (moveAnimationTimeoutRef.current) {
      window.clearTimeout(moveAnimationTimeoutRef.current);
      moveAnimationTimeoutRef.current = null;
    }

    for (const timeoutId of stepSoundTimeoutsRef.current) {
      window.clearTimeout(timeoutId);
    }
    stepSoundTimeoutsRef.current = [];
  }

  function showCaptureMarkers(markers: CaptureMarker[]) {
    setCaptureMarkers((current) => [...current, ...markers]);
    for (const marker of markers) {
      const timeoutId = window.setTimeout(() => {
        setCaptureMarkers((current) => current.filter((entry) => entry.id !== marker.id));
      }, marker.durationMs);
      captureMarkerTimeoutsRef.current.push(timeoutId);
    }
  }

  function clearCaptureMarkerTimers() {
    for (const timeoutId of captureMarkerTimeoutsRef.current) {
      window.clearTimeout(timeoutId);
    }
    captureMarkerTimeoutsRef.current = [];
    setCaptureMarkers([]);
  }

  function sendChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = chatText.trim();
    if (!room || !text) {
      return;
    }

    room.send("sendChat", { text });
    setChatText("");
  }

  function openChatReport(message: ChatMessage) {
    if (message.color === "system" || !state?.settings.chatFilterEnabled) {
      return;
    }

    setChatReportTarget(message);
    setChatReportWord("");
  }

  function closeChatReport() {
    setChatReportTarget(null);
    setChatReportWord("");
    setDiceRollStats(createEmptyDiceRollStats());
  }

  function submitChatReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const word = chatReportWord.trim();
    if (!room || !chatReportTarget || !word) {
      return;
    }

    room.send("reportChatWord", {
      messageId: chatReportTarget.id,
      word,
    });
    closeChatReport();
  }

  function requestRematch() {
    room?.send("requestRematch");
    setSelectedPieceId("");
  }

  function leaveRoom() {
    room?.leave();
    clearMoveAnimationTimers();
    clearCaptureMarkerTimers();
    setRoom(null);
    setState(null);
    setMoveAnimation(null);
    setCaptureMarkers([]);
    setJoinCode("");
    setSelectedPieceId("");
    setChatReportTarget(null);
    setChatReportWord("");
  }

  if (!room || !state) {
    return (
      <main className="app-shell entry-shell">
        <section className="entry-panel entry-panel--game">
          <div className="entry-content">
          <div className="entry-head">
          <div>
            <p className="eyebrow">Classic Multiplayer</p>
            <h1>Mensch ärgere dich nicht</h1>
            <p className="lede">Raum erstellen, Code teilen, losspielen.</p>
          </div>
          <ThemeToggle themeMode={themeMode} onToggle={toggleTheme} />
          </div>

          <div className="form-grid form-grid--entry">
            <label>
              Name
              <div className="name-random-row">
                <input
                  value={playerName}
                  maxLength={24}
                  onChange={(event) => setPlayerName(event.target.value)}
                  placeholder="Dein Name"
                />
                <button
                  type="button"
                  className="name-random-button"
                  onClick={() => setPlayerName(createRandomPlayerName())}
                  aria-label="Zufallsnamen wuerfeln"
                  title="Zufallsnamen wuerfeln"
                >
                  <span className="mini-dice" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                    <span />
                    <span />
                  </span>
                </button>
              </div>
            </label>
          </div>

          <div className="entry-actions">
            <button className="entry-primary" disabled={busy} onClick={createRoom}>
              Spiel erstellen
            </button>
            <button className="button-secondary" onClick={() => setRulesOpen(true)}>
              Regeln anzeigen
            </button>
          </div>

          <div className="entry-join">
            <span>Raum beitreten</span>
            <div className="join-row">
              <input
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value)}
                placeholder="Raumcode"
                aria-label="Raumcode"
              />
              <button className="button-secondary" disabled={busy} onClick={() => joinRoomByCode()}>
                Beitreten
              </button>
            </div>
          </div>

          {savedRoom ? (
            <button className="button-secondary entry-resume" disabled={busy} onClick={() => joinRoomByCode(savedRoom.roomId)}>
              Letzten Raum wieder betreten: {savedRoom.roomId}
            </button>
          ) : null}
          </div>

          <div className="entry-visual" aria-hidden="true">
            <img src={boardAsset} alt="" />
            <div className="entry-piece-cloud">
              <img src={pieceAssets.red} alt="" />
              <img src={pieceAssets.blue} alt="" />
              <img src={pieceAssets.green} alt="" />
              <img src={pieceAssets.yellow} alt="" />
            </div>
          </div>
        </section>

        <AudioPlayer
          preferences={playerPreferences}
          onPreferencesChange={setPlayerPreferences}
        />
        {errorMessage ? <div className={`toast toast--${toastTone}`}>{errorMessage}</div> : null}
        {rulesOpen ? <RulesDialog onClose={() => setRulesOpen(false)} /> : null}
      </main>
    );
  }

  if (state.status === "lobby") {
    return (
      <main className="app-shell app-shell--lobby">
        <LobbyStage
          state={state}
          meId={room.sessionId}
          isHost={isHost}
          startBlocker={startBlocker}
          chatText={chatText}
          onReady={sendReady}
          onAddBot={addBot}
          onStartGame={startGame}
          onKickPlayer={kickPlayer}
          onChatFilter={sendChatFilter}
          onTurnTimeLimit={sendTurnTimeLimit}
          onCustomColor={sendCustomColor}
          onChatText={setChatText}
          onSendChat={sendChat}
          onReportChatMessage={openChatReport}
          themeMode={themeMode}
          onToggleTheme={toggleTheme}
          onRules={() => setRulesOpen(true)}
          onLeave={leaveRoom}
        />
        <AudioPlayer
          preferences={playerPreferences}
          onPreferencesChange={setPlayerPreferences}
        />
        {errorMessage ? <div className={`toast toast--${toastTone}`}>{errorMessage}</div> : null}
        {rulesOpen ? <RulesDialog onClose={() => setRulesOpen(false)} /> : null}
        {chatReportTarget && state.settings.chatFilterEnabled ? (
          <ChatReportDialog
            message={chatReportTarget}
            word={chatReportWord}
            onWordChange={setChatReportWord}
            onSubmit={submitChatReport}
            onClose={closeChatReport}
          />
        ) : null}
      </main>
    );
  }

  return (
    <main className="app-shell">
      <TurnTimerHud state={state} now={now} />
      <section className="top-bar">
        <div>
          <p className="eyebrow">Partie läuft</p>
          <h1>Mensch ärgere dich nicht</h1>
        </div>
        <div className="top-actions">
          <RoomCodeBadge roomId={state.roomId} />
          <ThemeToggle themeMode={themeMode} onToggle={toggleTheme} />
          <button className="button-secondary" onClick={() => setRulesOpen(true)}>
            Regeln
          </button>
          <button className="button-secondary" onClick={leaveRoom}>
            Verlassen
          </button>
        </div>
      </section>

      <section className="game-layout">
        <aside className="players-rail">
          <PlayersPanel state={state} meId={room.sessionId} hostId={state.hostId} />
        </aside>

        <div className="playfield">
          <Board
            state={state}
            selectedPieceId={selectedPieceId}
            onSelectPiece={movePiece}
            dragToMove={playerPreferences.dragToMove}
            moveAnimation={moveAnimation}
            captureMarkers={captureMarkers}
          />
          <TurnReminderPopup
            state={state}
            meId={room.sessionId}
            canRoll={canRoll}
          />
          <WinnerOverlay state={state} meId={room.sessionId} onRematch={requestRematch} />
        </div>

        <aside className="side-panel">
          <TurnBanner
            state={state}
            meId={room.sessionId}
            canRoll={canRoll}
            dragToMove={playerPreferences.dragToMove}
          />
          <TurnPanel
            state={state}
            meId={room.sessionId}
            canRoll={canRoll}
            dragToMove={playerPreferences.dragToMove}
            onRoll={rollDice}
            onRematch={requestRematch}
          />
          <ChatPanel
            state={state}
            chatText={chatText}
            onChatText={setChatText}
            onSendChat={sendChat}
            onReportMessage={openChatReport}
          />
        </aside>
      </section>

      <GameSettingsDock
        preferences={playerPreferences}
        onPreferencesChange={setPlayerPreferences}
        diceRollStats={diceRollStats}
      />
      <AudioPlayer
        preferences={playerPreferences}
        onPreferencesChange={setPlayerPreferences}
      />
      {errorMessage ? <div className={`toast toast--${toastTone}`}>{errorMessage}</div> : null}
      {rulesOpen ? <RulesDialog onClose={() => setRulesOpen(false)} /> : null}
      {chatReportTarget && state.settings.chatFilterEnabled ? (
        <ChatReportDialog
          message={chatReportTarget}
          word={chatReportWord}
          onWordChange={setChatReportWord}
          onSubmit={submitChatReport}
          onClose={closeChatReport}
        />
      ) : null}
    </main>
  );
}

interface LobbyStageProps {
  state: GameStateSnapshot;
  meId: string;
  isHost: boolean;
  startBlocker: string;
  chatText: string;
  onReady: () => void;
  onAddBot: () => void;
  onStartGame: () => void;
  onKickPlayer: (playerId: string) => void;
  onChatFilter: (enabled: boolean) => void;
  onTurnTimeLimit: (seconds: number) => void;
  onCustomColor: (customColor: string) => void;
  onChatText: (value: string) => void;
  onSendChat: (event: FormEvent<HTMLFormElement>) => void;
  onReportChatMessage: (message: ChatMessage) => void;
  themeMode: ThemeMode;
  onToggleTheme: () => void;
  onRules: () => void;
  onLeave: () => void;
}

function LobbyStage({
  state,
  meId,
  isHost,
  startBlocker,
  chatText,
  onReady,
  onAddBot,
  onStartGame,
  onKickPlayer,
  onChatFilter,
  onTurnTimeLimit,
  onCustomColor,
  onChatText,
  onSendChat,
  onReportChatMessage,
  themeMode,
  onToggleTheme,
  onRules,
  onLeave,
}: LobbyStageProps) {
  const me = state.players.find((player) => player.id === meId);
  const host = state.players.find((player) => player.id === state.hostId);
  const canAddBot = isHost && state.players.length < 4;
  const activePlayerCount = state.players.filter((player) => player.connected || player.isBot).length;

  return (
    <section className="lobby-stage">
      <div className="lobby-board-backdrop">
        <Board state={state} selectedPieceId="" onSelectPiece={() => undefined} disabled />
      </div>
      <div className="lobby-overlay">
        <section className="lobby-window">
          <div className="lobby-main">
            <div className="lobby-head">
              <div>
                <p className="eyebrow">Lobby</p>
                <h1>Warten auf Spieler</h1>
              </div>
              <div className="room-code-box">
                <span>Code</span>
                <strong>{state.roomId}</strong>
              </div>
            </div>
            <ThemeToggle themeMode={themeMode} onToggle={onToggleTheme} />

            <p className="status-line">
              Host: {host?.name || "wartet"} {isHost ? "· du hast die Admin-Rechte" : ""}
            </p>

            <div className="lobby-status-strip">
              <span>
                <strong>{activePlayerCount}/4</strong>
                Plätze
              </span>
              <span>
                <strong>{Math.round(state.settings.turnTimeLimitMs / 1000)}s</strong>
                Zugzeit
              </span>
              <span>
                <strong>{me?.ready ? "Bereit" : "Offen"}</strong>
                Dein Status
              </span>
            </div>

            <div className="lobby-settings">
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={state.settings.chatFilterEnabled}
                  disabled={!isHost}
                  onChange={(event) => onChatFilter(event.target.checked)}
                />
                Chat-Filter
              </label>
              <label>
                Zugzeit
                <select
                  value={Math.round(state.settings.turnTimeLimitMs / 1000)}
                  disabled={!isHost}
                  onChange={(event) => onTurnTimeLimit(Number(event.target.value))}
                >
                  <option value={10}>10 Sekunden</option>
                  <option value={20}>20 Sekunden</option>
                  <option value={30}>30 Sekunden</option>
                  <option value={45}>45 Sekunden</option>
                  <option value={60}>60 Sekunden</option>
                  <option value={90}>90 Sekunden</option>
                  <option value={120}>120 Sekunden</option>
                </select>
              </label>
              {me ? (
                <label>
                  Eigene Farbe
                  <input
                    type="color"
                    value={getPlayerVisualColor(me)}
                    onChange={(event) => onCustomColor(event.target.value)}
                  />
                </label>
              ) : null}
            </div>

            <PlayersPanel
              state={state}
              meId={meId}
              hostId={state.hostId}
              isHost={isHost}
              onKick={onKickPlayer}
            />

            <div className="lobby-actions">
              <button onClick={onReady}>{me?.ready ? "Bereit zurücknehmen" : "Bereit"}</button>
              <button className="button-secondary" disabled={!canAddBot} onClick={onAddBot}>
                Computer hinzufügen
              </button>
              <button disabled={!isHost || Boolean(startBlocker)} onClick={onStartGame}>
                Spiel starten
              </button>
              <button className="button-secondary" onClick={onRules}>
                Regeln
              </button>
              <button className="button-secondary" onClick={onLeave}>
                Verlassen
              </button>
            </div>

            <p className="status-line">{startBlocker || state.lastEvent}</p>
          </div>

          <ChatPanel
            state={state}
            chatText={chatText}
            onChatText={onChatText}
            onSendChat={onSendChat}
            onReportMessage={onReportChatMessage}
          />
        </section>
      </div>
    </section>
  );
}

interface TurnPanelProps {
  state: GameStateSnapshot;
  meId: string;
  canRoll: boolean;
  dragToMove: boolean;
  onRoll: () => void;
  onRematch: () => void;
}

function TurnPanel({ state, meId, canRoll, dragToMove, onRoll, onRematch }: TurnPanelProps) {
  const activePlayer = state.players[state.currentPlayerIndex];
  const isMyTurn = activePlayer?.id === meId;
  const winner = state.winnerColor ? state.players.find((player) => player.color === state.winnerColor) : undefined;
  const turnStyle = activePlayer
    ? {
        "--turn-color": getPlayerVisualColor(activePlayer),
        "--turn-soft": getPlayerSoftColor(activePlayer),
      } as CSSProperties
    : undefined;
  const moveHint = dragToMove
    ? "Figur auf das markierte Feld ziehen."
    : "Figur anklicken. Der Zug wird direkt ausgeführt.";
  const sixMoveHint = dragToMove
    ? "Sechs gewürfelt: Ziehe eine markierte Figur auf ihr Ziel."
    : "Sechs gewürfelt: Wähle eine markierte Figur.";

  if (state.status === "finished") {
    return (
      <section className="panel-block">
        <p className="eyebrow">Gewonnen</p>
        <h2>{winner?.name || "Ein Spieler"}</h2>
        <p className="status-line">{state.lastEvent}</p>
        <button onClick={onRematch}>Revanche</button>
      </section>
    );
  }

  return (
    <section className="panel-block turn-panel" style={turnStyle}>
      <p className="eyebrow">Am Zug</p>
      <h2>{activePlayer?.name || "Warten"}</h2>
      <div className="dice-row">
        <DiceFace value={state.diceValue} active={state.diceRolled} />
        <div className="dice-actions">
          <button disabled={!canRoll} onClick={onRoll}>
            {canRoll ? "Jetzt würfeln" : "Warten"}
          </button>
          <span>{state.diceRolled ? `Gewürfelt: ${state.diceValue}` : "Würfel bereit"}</span>
        </div>
      </div>
      <p className="status-line">{state.lastEvent}</p>
      {isMyTurn && state.legalMoves.length > 0 ? (
        <div className="move-box">
          <p>{state.diceValue === 6 ? sixMoveHint : moveHint}</p>
        </div>
      ) : null}
      {activePlayer?.isBot ? <p className="status-line">Der Computer denkt.</p> : null}
    </section>
  );
}

function DiceFace({ value, active }: { value: number; active: boolean }) {
  const [displayValue, setDisplayValue] = useState(value);
  const [rolling, setRolling] = useState(false);
  const previousValueRef = useRef(value);

  useEffect(() => {
    if (!active || !value) {
      setRolling(false);
      setDisplayValue(value);
      previousValueRef.current = value;
      return;
    }

    if (previousValueRef.current === value) {
      setDisplayValue(value);
      return;
    }

    previousValueRef.current = value;
    setRolling(true);

    const frames = [1, 5, 2, 6, 3, 4, value];
    let frameIndex = 0;
    const intervalId = window.setInterval(() => {
      setDisplayValue(frames[frameIndex % frames.length]);
      frameIndex += 1;
    }, 55);
    const timeoutId = window.setTimeout(() => {
      window.clearInterval(intervalId);
      setDisplayValue(value);
      setRolling(false);
    }, 440);

    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
    };
  }, [active, value]);

  const shownValue = rolling ? displayValue : value;
  const pips = DICE_PIPS[shownValue] || [];

  return (
    <div className={`dice-face ${active ? "dice-face--active" : ""}`} aria-label={value ? `Würfel ${value}` : "Nicht gewürfelt"}>
      {shownValue ? (
        Array.from({ length: 9 }, (_, index) => {
          const position = index + 1;
          return <span key={position} className={pips.includes(position) ? "dice-pip dice-pip--visible" : "dice-pip"} />;
        })
      ) : (
        <span className="dice-placeholder">?</span>
      )}
    </div>
  );
}

function TurnBanner({
  state,
  meId,
  canRoll,
  dragToMove,
}: {
  state: GameStateSnapshot;
  meId: string;
  canRoll: boolean;
  dragToMove: boolean;
}) {
  const activePlayer = state.players[state.currentPlayerIndex];
  if (state.status !== "playing" || activePlayer?.id !== meId) {
    return null;
  }
  const actionText = canRoll ? "Jetzt würfeln" : dragToMove ? "Figur ziehen" : "Figur anklicken";
  const style = {
    "--turn-color": getPlayerVisualColor(activePlayer),
    "--turn-soft": getPlayerSoftColor(activePlayer),
  } as CSSProperties;

  return (
    <div className="turn-banner" style={style}>
      <strong>Du bist am Zug</strong>
      <span>{actionText}</span>
    </div>
  );
}

function TurnReminderPopup({
  state,
  meId,
  canRoll,
}: {
  state: GameStateSnapshot;
  meId: string;
  canRoll: boolean;
}) {
  const activePlayer = state.players[state.currentPlayerIndex];
  const activePlayerId = activePlayer?.id || "";
  const isMyTurn = state.status === "playing" && activePlayer?.id === meId;
  const previousActivePlayerIdRef = useRef("");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const activePlayerChanged = previousActivePlayerIdRef.current !== activePlayerId;
    previousActivePlayerIdRef.current = activePlayerId;

    if (!isMyTurn || state.diceRolled || !canRoll) {
      setVisible(false);
      return;
    }

    if (!activePlayerChanged) {
      return;
    }

    setVisible(true);
    const timeoutId = window.setTimeout(() => setVisible(false), 1750);
    return () => window.clearTimeout(timeoutId);
  }, [activePlayerId, canRoll, isMyTurn, state.diceRolled]);

  if (!isMyTurn || !visible || !activePlayer || !canRoll) {
    return null;
  }

  const turnColor = getPlayerVisualColor(activePlayer);
  const turnSoft = getPlayerSoftColor(activePlayer);
  const actionText = "Würfel jetzt.";
  const style = {
    "--turn-color": turnColor,
    "--turn-soft": turnSoft,
  } as CSSProperties;

  return (
    <div className="turn-reminder" style={style} role="status" aria-live="assertive">
      <button
        className="turn-reminder__close"
        onClick={() => setVisible(false)}
        aria-label="Zug-Erinnerung schließen"
      >
        ×
      </button>
      <div className="turn-reminder__art" aria-hidden="true">
        <img src={getPieceAssetForPlayer(activePlayer)} alt="" />
      </div>
      <div>
        <p className="eyebrow">Du bist am Zug</p>
        <h2 style={{ color: turnColor }}>{activePlayer.name}</h2>
        <p>{actionText}</p>
      </div>
    </div>
  );
}

function TurnTimerHud({ state, now }: { state: GameStateSnapshot; now: number }) {
  const activePlayer = state.players[state.currentPlayerIndex];
  if (
    state.status !== "playing" ||
    !activePlayer ||
    !state.turnStartedAt ||
    !state.turnDeadlineAt
  ) {
    return null;
  }

  const duration = Math.max(1, state.turnDeadlineAt - state.turnStartedAt);
  const elapsed = Math.min(duration, Math.max(0, now - state.turnStartedAt));
  const remainingMs = Math.max(0, state.turnDeadlineAt - now);
  const progress = elapsed / duration;
  const seconds = Math.ceil(remainingMs / 1000);
  const turnColor = getPlayerVisualColor(activePlayer);
  const turnSoft = getPlayerSoftColor(activePlayer);
  const style = {
    "--turn-color": turnColor,
    "--turn-soft": turnSoft,
  } as CSSProperties;

  return (
    <div className="turn-timer-bar" style={style} aria-label={`Zugzeit ${seconds} Sekunden`}>
      <div className="turn-timer-bar__fill" style={{ width: `${progress * 100}%` }} />
      <span>
        {activePlayer.name} · {seconds}s
      </span>
    </div>
  );
}

function GameSettingsDock({
  preferences,
  onPreferencesChange,
  diceRollStats,
}: {
  preferences: PlayerPreferences;
  onPreferencesChange: (preferences: PlayerPreferences) => void;
  diceRollStats: DiceRollStats;
}) {
  const [open, setOpen] = useState(false);
  const diceOdds = useMemo(() => getPersonalDiceOdds(diceRollStats), [diceRollStats]);
  const updatePreference = (patch: Partial<PlayerPreferences>) => {
    onPreferencesChange({ ...preferences, ...patch });
  };

  return (
    <div className="settings-dock">
      <button
        className="settings-dock__button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-label="Spieler-Einstellungen"
      >
        ⚙
      </button>
      {open ? (
        <section className="settings-dock__panel" aria-label="Spieler-Einstellungen">
          <div>
            <p className="eyebrow">Würfel-Chancen</p>
            <p className="dice-odds-note">
              {diceRollStats.total > 0
                ? `Deine bisherigen Würfe: ${diceRollStats.total}`
                : "Noch keine eigenen Würfe in diesem Raum."}
            </p>
            <div className="dice-odds-grid">
                {diceOdds.map((entry) => (
                  <span key={entry.value}>
                    <strong>{entry.value}</strong>
                    {entry.chance}
                    <small>{entry.percent}</small>
                  </span>
                ))}
            </div>
          </div>

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={preferences.dragToMove}
              onChange={(event) => updatePreference({ dragToMove: event.target.checked })}
            />
            Figuren per Drag & Drop ziehen
          </label>
        </section>
      ) : null}
    </div>
  );
}

function AudioPlayer({
  preferences,
  onPreferencesChange,
}: {
  preferences: PlayerPreferences;
  onPreferencesChange: (preferences: PlayerPreferences) => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const currentTrack = musicAssets[getTrackIndex(preferences.musicTrackIndex)];
  const updatePreference = (patch: Partial<PlayerPreferences>) => {
    onPreferencesChange({ ...preferences, ...patch });
  };
  const playCurrentTrack = () => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    void audio.play().catch(() => {
      updatePreference({ musicEnabled: false });
    });
  };
  const changeTrack = (direction: 1 | -1) => {
    updatePreference({
      musicEnabled: true,
      musicTrackIndex: wrapTrackIndex(preferences.musicTrackIndex + direction),
    });
  };
  const toggleMusic = () => {
    const audio = audioRef.current;
    if (!audio) {
      updatePreference({ musicEnabled: !preferences.musicEnabled });
      return;
    }

    if (preferences.musicEnabled) {
      audio.pause();
      updatePreference({ musicEnabled: false });
    } else {
      updatePreference({ musicEnabled: true });
      void audio.play().catch(() => updatePreference({ musicEnabled: false }));
    }
  };
  const testClickSound = () => playUiSound("confirm", preferences);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    audio.volume = clampVolume(preferences.musicVolume);
  }, [preferences.musicVolume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    audio.volume = clampVolume(preferences.musicVolume);
    audio.load();
    setProgress(0);
    if (preferences.musicEnabled) {
      playCurrentTrack();
    }
  }, [preferences.musicTrackIndex]);

  useEffect(() => {
    if (!preferences.musicEnabled) {
      audioRef.current?.pause();
      return;
    }

    playCurrentTrack();
  }, [preferences.musicEnabled]);

  const durationText = formatDuration(duration);
  const progressText = formatDuration(progress);
  const progressPercent = duration > 0 ? Math.min(100, (progress / duration) * 100) : 0;

  return (
    <div className="audio-shell">
      <audio
        ref={audioRef}
        src={currentTrack.src}
        preload="metadata"
        onTimeUpdate={(event) => setProgress(event.currentTarget.currentTime)}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
        onEnded={() => changeTrack(1)}
      />
      <button
        type="button"
        className={`audio-toggle ${preferences.musicEnabled ? "audio-toggle--active" : ""}`}
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-label="Radio öffnen"
      >
        <span />
      </button>
      {open ? (
        <section className="audio-player" aria-label="Audio Player">
          <div className={`audio-player__cover ${preferences.musicEnabled ? "audio-player__cover--active" : ""}`}>
            <span />
          </div>
          <div className="audio-player__main">
            <div className="audio-player__topline">
              <div className="audio-player__track">
                <p className="eyebrow">Radio</p>
                <strong>{currentTrack.title}</strong>
                <span>{currentTrack.artist}</span>
              </div>
              <div className="audio-player__controls">
                <button type="button" onClick={() => changeTrack(-1)} aria-label="Vorheriger Track">
                  Zurück
                </button>
                <button type="button" className="audio-player__play" onClick={toggleMusic}>
                  {preferences.musicEnabled ? "Pause" : "Play"}
                </button>
                <button type="button" onClick={() => changeTrack(1)} aria-label="Nächster Track">
                  Skip
                </button>
              </div>
            </div>

            <div className="audio-progress" aria-label={`${progressText} von ${durationText}`}>
              <span style={{ width: `${progressPercent}%` }} />
            </div>

            <div className="audio-player__bottom">
              <label className="audio-volume">
                Musik
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={preferences.musicVolume}
                  onChange={(event) => updatePreference({ musicVolume: Number(event.target.value) })}
                />
                <span>{Math.round(preferences.musicVolume * 100)}%</span>
              </label>
              <label className="audio-select">
                Klick
                <select
                  value={preferences.clickSoundPreset}
                  onChange={(event) => {
                    const clickSoundPreset = event.target.value as ClickSoundPreset;
                    const nextPreferences = { ...preferences, clickSoundPreset };
                    onPreferencesChange(nextPreferences);
                    playUiSound("toggle", nextPreferences);
                  }}
                >
                  <option value="arcade">Arcade</option>
                  <option value="wood">Holz</option>
                  <option value="soft">Leise</option>
                  <option value="classic">Classic</option>
                </select>
              </label>
              <label className="audio-volume">
                SFX
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={preferences.clickVolume}
                  onChange={(event) => updatePreference({ clickVolume: Number(event.target.value) })}
                />
                <span>{Math.round(preferences.clickVolume * 100)}%</span>
              </label>
              <button type="button" className="audio-player__test" onClick={testClickSound}>
                Test
              </button>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function WinnerOverlay({
  state,
  meId,
  onRematch,
}: {
  state: GameStateSnapshot;
  meId: string;
  onRematch: () => void;
}) {
  if (state.status !== "finished") {
    return null;
  }

  const winner = state.players.find((player) => player.color === state.winnerColor);
  const isWinner = winner?.id === meId;
  const headline = isWinner ? "Gratulation, du hast gewonnen" : `${winner?.name || "Ein Spieler"} hat gewonnen`;
  const text = isWinner
    ? "Alle vier Figuren sind im Ziel. Der Pokal gehört dir."
    : `${winner?.name || "Ein Spieler"} hat alle vier Figuren ins Ziel gebracht.`;

  return (
    <div className="winner-overlay" role="status" aria-live="assertive">
      <div className="winner-overlay__content">
        <TrophyIcon />
        <p className="eyebrow">Spiel beendet</p>
        <h2>{headline}</h2>
        <p>{text}</p>
        <button className="winner-rematch-button" onClick={onRematch}>
          Revanche
        </button>
      </div>
    </div>
  );
}

function TrophyIcon() {
  return (
    <svg className="trophy-icon" viewBox="0 0 120 120" role="img" aria-label="Pokal">
      <path className="trophy-cup" d="M36 18h48v18c0 19-9 33-24 37C45 69 36 55 36 36V18Z" />
      <path className="trophy-side" d="M36 28H18v7c0 16 10 27 25 28-4-6-7-13-7-23V28Z" />
      <path className="trophy-side" d="M84 28h18v7c0 16-10 27-25 28 4-6 7-13 7-23V28Z" />
      <path className="trophy-stem" d="M54 72h12v18H54z" />
      <path className="trophy-base" d="M40 90h40l8 14H32l8-14Z" />
      <path className="trophy-shine" d="M50 27h8v29h-8z" />
    </svg>
  );
}

function RoomCodeBadge({ roomId }: { roomId: string }) {
  return (
    <div className="room-code-chip" aria-label={`Raumcode ${roomId}`}>
      <span>Raumcode</span>
      <strong>{roomId}</strong>
    </div>
  );
}

function ThemeToggle({ themeMode, onToggle }: { themeMode: ThemeMode; onToggle: () => void }) {
  return (
    <button className="theme-toggle button-secondary" onClick={onToggle} type="button">
      {themeMode === "dark" ? "Light Mode" : "Dark Mode"}
    </button>
  );
}

interface PlayersPanelProps {
  state: GameStateSnapshot;
  meId: string;
  hostId: string;
  isHost?: boolean;
  onKick?: (playerId: string) => void;
}

function PlayersPanel({ state, meId, hostId, isHost = false, onKick }: PlayersPanelProps) {
  return (
    <section className="panel-block players-panel">
      <p className="eyebrow">Spieler</p>
      <ul className="player-list">
        {state.players.map((player, index) => {
          const active = index === state.currentPlayerIndex && state.status === "playing";
          const canKick = Boolean(isHost && state.status === "lobby" && onKick && player.id !== meId && player.id !== hostId);

          return (
            <li key={player.id} className={active ? "player-row player-row--active" : "player-row"}>
              <span className="color-dot" style={{ background: getPlayerVisualColor(player) }} />
              <span>
                {player.name}
                {player.id === meId ? " (du)" : ""}
                {player.id === hostId ? " · Host" : ""}
              </span>
              <small>{getPlayerStatus(player.ready, player.connected, player.isBot, active)}</small>
              {canKick ? (
                <button className="tiny-button" onClick={() => onKick?.(player.id)}>
                  Kick
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

interface ChatPanelProps {
  state: GameStateSnapshot;
  chatText: string;
  onChatText: (value: string) => void;
  onSendChat: (event: FormEvent<HTMLFormElement>) => void;
  onReportMessage: (message: ChatMessage) => void;
}

function ChatPanel({ state, chatText, onChatText, onSendChat, onReportMessage }: ChatPanelProps) {
  const chatLogRef = useRef<HTMLDivElement | null>(null);
  const canReportMessages = state.settings.chatFilterEnabled;

  useEffect(() => {
    const chatLog = chatLogRef.current;
    if (!chatLog) {
      return;
    }

    chatLog.scrollTo({
      top: chatLog.scrollHeight,
      behavior: "smooth",
    });
  }, [state.chat.length]);

  return (
    <section className="panel-block chat-panel">
      <p className="eyebrow">Chat {state.settings.chatFilterEnabled ? "· Filter aktiv" : ""}</p>
      <div className="chat-log" aria-live="polite" ref={chatLogRef}>
        {state.chat.length === 0 ? <p className="empty-chat">Noch keine Nachrichten.</p> : null}
        {state.chat.map((message) => {
          if (message.color === "system") {
            return (
              <p key={message.id} className="chat-message chat-message--system">
                <strong>{message.playerName}:</strong> {message.text}
              </p>
            );
          }

          if (!canReportMessages) {
            return (
              <p key={message.id} className="chat-message chat-message--plain">
                <strong>{message.playerName}:</strong> {message.text}
              </p>
            );
          }

          return (
            <button
              key={message.id}
              type="button"
              className="chat-message chat-message--reportable"
              onClick={() => onReportMessage(message)}
              title="Nachricht melden"
            >
              <span>
                <strong>{message.playerName}:</strong> {message.text}
              </span>
              <small>Melden</small>
            </button>
          );
        })}
      </div>
      <form className="chat-form" onSubmit={onSendChat}>
        <input
          value={chatText}
          maxLength={240}
          onChange={(event) => onChatText(event.target.value)}
          placeholder="Nachricht"
        />
        <button>Senden</button>
      </form>
    </section>
  );
}

interface ChatReportDialogProps {
  message: ChatMessage;
  word: string;
  onWordChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}

function ChatReportDialog({ message, word, onWordChange, onSubmit, onClose }: ChatReportDialogProps) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Nachricht melden">
      <section className="rules-dialog report-dialog">
        <div className="dialog-head">
          <div>
            <p className="eyebrow">Chat-Report</p>
            <h2>Begriff melden</h2>
          </div>
          <button className="button-secondary" onClick={onClose}>
            Schließen
          </button>
        </div>

        <blockquote className="reported-message">
          <strong>{message.playerName}:</strong> {message.text}
        </blockquote>

        <form className="report-form" onSubmit={onSubmit}>
          <label>
            Welches Wort soll ab jetzt gefiltert werden?
            <input
              value={word}
              maxLength={40}
              autoFocus
              onChange={(event) => onWordChange(event.target.value)}
              placeholder="Wort oder kurze Phrase"
            />
          </label>
          <div className="button-row">
            <button disabled={!word.trim()}>Zur Filterliste hinzufügen</button>
            <button type="button" className="button-secondary" onClick={onClose}>
              Abbrechen
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function RulesDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Spielregeln">
      <section className="rules-dialog">
        <div className="dialog-head">
          <div>
            <p className="eyebrow">Classic</p>
            <h2>Regeln</h2>
          </div>
          <button className="button-secondary" onClick={onClose}>
            Schließen
          </button>
        </div>
        <ul className="rules-list">
          <li>Alle Spieler ziehen reihum im Uhrzeigersinn.</li>
          <li>Eine Sechs erlaubt das Raussetzen aus dem Start oder einen anderen gültigen Zug.</li>
          <li>Steht eine eigene Figur auf dem Anfangsfeld und weitere Figuren sind noch im Start, muss sie so bald wie möglich weiterziehen.</li>
          <li>Eigene und fremde Figuren dürfen übersprungen werden.</li>
          <li>Auf eigenen Figuren darf nicht gelandet werden.</li>
          <li>Eine gegnerische Figur auf dem Zielfeld wird geschlagen. Mit aktivem Schlagzwang muss ein Schlagzug genommen werden.</li>
          <li>Zielfelder brauchen die genaue Augenzahl. Wer alle vier Figuren im Ziel hat, gewinnt.</li>
          <li>Wer keine Figur auf der Laufbahn hat, darf bei passenden Zielfeldern bis zu drei Mal auf eine Sechs würfeln.</li>
          <li>Nach jeder Sechs gibt es einen weiteren Wurf, auch wenn kein Zug möglich war.</li>
        </ul>
      </section>
    </div>
  );
}

function normalizeState(rawState: unknown): GameStateSnapshot {
  const value = typeof (rawState as { toJSON?: () => unknown })?.toJSON === "function"
    ? (rawState as { toJSON: () => unknown }).toJSON()
    : rawState;
  const snapshot = value as GameStateSnapshot;

  return {
    roomId: snapshot.roomId || "",
    hostId: snapshot.hostId || "",
    status: snapshot.status || "lobby",
    players: (snapshot.players || []).map((player) => ({
      ...player,
      customColor: normalizeHexColor(player.customColor, COLOR_META[player.color].hex),
      pieces: player.pieces || [],
    })),
    currentPlayerIndex: snapshot.currentPlayerIndex || 0,
    diceValue: snapshot.diceValue || 0,
    diceRolled: Boolean(snapshot.diceRolled),
    rollAttempts: snapshot.rollAttempts || 0,
    legalMoves: snapshot.legalMoves || [],
    winnerColor: snapshot.winnerColor || "",
    lastEvent: snapshot.lastEvent || "",
    turnStartedAt: snapshot.turnStartedAt || 0,
    turnDeadlineAt: snapshot.turnDeadlineAt || 0,
    settings: {
      strikeRequired: Boolean(snapshot.settings?.strikeRequired),
      chatFilterEnabled: snapshot.settings?.chatFilterEnabled ?? true,
      turnTimeLimitMs: clampTurnTimeLimitMs(snapshot.settings?.turnTimeLimitMs),
    },
    chat: snapshot.chat || [],
    updatedAt: snapshot.updatedAt || Date.now(),
  };
}

function playConfirmedStateSounds(
  previous: GameStateSnapshot | null,
  current: GameStateSnapshot,
  meId: string,
  preferences: PlayerPreferences,
): void {
  if (!previous) {
    return;
  }

  if (previous.status !== "playing" && current.status === "playing") {
    playUiSound("start", preferences);
    return;
  }

  if (previous.status !== "finished" && current.status === "finished") {
    const winner = current.players.find((player) => player.color === current.winnerColor);
    playUiSound(winner?.id === meId ? "win" : "lose", preferences);
    return;
  }

  if (previous.diceValue !== current.diceValue && current.diceValue > 0) {
    playUiSound("roll", preferences);
  }

  const movedPieces = getChangedPieces(previous, current);
  if (movedPieces.length > 0) {
    const captured = movedPieces.some((piece) => piece.previousPosition !== -1 && piece.nextPosition === -1);
    if (captured) {
      playUiSound("capture", preferences);
    }
  }

  if (
    previous.status === "playing" &&
    current.status === "playing" &&
    previous.currentPlayerIndex !== current.currentPlayerIndex &&
    current.players[current.currentPlayerIndex]?.id === meId
  ) {
    playUiSound("turn", preferences);
  }
}

function getChangedPieces(previous: GameStateSnapshot, current: GameStateSnapshot) {
  const previousPositions = new Map<string, number>();
  for (const player of previous.players) {
    for (const piece of player.pieces) {
      previousPositions.set(piece.id, piece.position);
    }
  }

  return current.players.flatMap((player) =>
    player.pieces.flatMap((piece) => {
      const previousPosition = previousPositions.get(piece.id);
      if (previousPosition === undefined || previousPosition === piece.position) {
        return [];
      }

      return [{ pieceId: piece.id, previousPosition, nextPosition: piece.position }];
    }),
  );
}

function getConfirmedMoveAnimation(previous: GameStateSnapshot, current: GameStateSnapshot): PieceMoveAnimation | null {
  if (previous.status !== "playing" || current.status !== "playing") {
    return null;
  }

  const changedPieces = getChangedPieces(previous, current);
  const movingPiece = changedPieces.find((piece) => piece.nextPosition !== -1);
  if (!movingPiece || movingPiece.previousPosition === -1) {
    return null;
  }

  const stepCount = getMoveStepCount(movingPiece.previousPosition, movingPiece.nextPosition);
  if (stepCount <= 0) {
    return null;
  }

  return {
    pieceId: movingPiece.pieceId,
    from: movingPiece.previousPosition,
    to: movingPiece.nextPosition,
    startedAt: Date.now(),
    durationMs: Math.min(1450, Math.max(320, stepCount * 170)),
  };
}

function getConfirmedCaptureMarkers(previous: GameStateSnapshot, current: GameStateSnapshot): CaptureMarker[] {
  if (previous.status !== "playing" || (current.status !== "playing" && current.status !== "finished")) {
    return [];
  }

  const currentPieces = new Map<string, { color: PlayerColor; index: number }>();
  for (const player of current.players) {
    for (const piece of player.pieces) {
      currentPieces.set(piece.id, { color: piece.color, index: piece.index });
    }
  }

  const startedAt = Date.now();
  return getChangedPieces(previous, current).flatMap((piece) => {
    if (piece.previousPosition === -1 || piece.nextPosition !== -1) {
      return [];
    }

    const currentPiece = currentPieces.get(piece.pieceId);
    if (!currentPiece) {
      return [];
    }

    return [{
      id: `${piece.pieceId}-${startedAt}`,
      pieceId: piece.pieceId,
      color: currentPiece.color,
      index: currentPiece.index,
      position: piece.previousPosition,
      startedAt,
      durationMs: 1150,
    }];
  });
}

function getConfirmedDiceRoll(previous: GameStateSnapshot, current: GameStateSnapshot): { playerId: string; value: number } | null {
  if (previous.status !== "playing" || current.status !== "playing" || current.diceValue < 1 || current.diceValue > 6) {
    return null;
  }

  const previousActivePlayer = previous.players[previous.currentPlayerIndex];
  const currentActivePlayer = current.players[current.currentPlayerIndex];
  const activePlayerChanged = previous.currentPlayerIndex !== current.currentPlayerIndex;
  const rollAttemptChanged = previous.rollAttempts !== current.rollAttempts;
  const diceRollStarted = !previous.diceRolled && current.diceRolled;
  const diceValueChanged = previous.diceValue !== current.diceValue;
  const turnAdvancedAfterMiss = activePlayerChanged && !current.diceRolled && current.rollAttempts === 0;
  const isConfirmedRoll = diceRollStarted || rollAttemptChanged || diceValueChanged || turnAdvancedAfterMiss;

  if (!isConfirmedRoll) {
    return null;
  }

  const playerId = turnAdvancedAfterMiss ? previousActivePlayer?.id : currentActivePlayer?.id;
  return playerId ? { playerId, value: current.diceValue } : null;
}

function getMoveStepCount(from: number, to: number): number {
  if (from === to) {
    return 0;
  }

  if (from === -1) {
    return 0;
  }

  return Math.max(1, Math.abs(to - from));
}

function createRandomPlayerName(): string {
  const prefix = RANDOM_NAME_PREFIXES[Math.floor(Math.random() * RANDOM_NAME_PREFIXES.length)] || DEFAULT_NAME;
  const suffix = RANDOM_NAME_SUFFIXES[Math.floor(Math.random() * RANDOM_NAME_SUFFIXES.length)] || "42";
  return `${prefix}${suffix}`.slice(0, 24);
}

function createEmptyDiceRollStats(): DiceRollStats {
  return {
    counts: Object.fromEntries(DICE_VALUES.map((value) => [value, 0])),
    total: 0,
  };
}

function addDiceRoll(stats: DiceRollStats, value: number): DiceRollStats {
  if (!DICE_VALUES.includes(value as typeof DICE_VALUES[number])) {
    return stats;
  }

  return {
    counts: {
      ...stats.counts,
      [value]: (stats.counts[value] || 0) + 1,
    },
    total: stats.total + 1,
  };
}

function getPersonalDiceOdds(stats: DiceRollStats) {
  return DICE_VALUES.map((value) => {
    const count = stats.counts[value] || 0;
    if (stats.total <= 0) {
      return {
        value,
        chance: "1/6",
        percent: "16,67%",
      };
    }

    return {
      value,
      chance: `${count}/${stats.total}`,
      percent: `${formatPercent((count / stats.total) * 100)}%`,
    };
  });
}

function formatPercent(value: number): string {
  return value.toLocaleString("de-DE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
}

function getPlayerVisualColor(player: PlayerState): string {
  return normalizeHexColor(player.customColor, COLOR_META[player.color].hex);
}

function getPlayerSoftColor(player: PlayerState): string {
  return mixHex(getPlayerVisualColor(player), "#ffffff", 0.78);
}

function getPieceAssetForPlayer(player: PlayerState): string {
  const baseHex = COLOR_META[player.color].hex.toLowerCase();
  const targetHex = getPlayerVisualColor(player).toLowerCase();
  if (targetHex === baseHex) {
    return pieceAssets[player.color];
  }

  const cacheKey = `${player.color}:${targetHex}`;
  const cached = popupPieceAssetCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const tintedSvg = tintPieceSvg(pieceSvgSources[player.color], targetHex);
  const dataUri = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(tintedSvg)}`;
  popupPieceAssetCache.set(cacheKey, dataUri);
  return dataUri;
}

function tintPieceSvg(svgSource: string, targetHex: string): string {
  return svgSource.replace(/fill="(#[0-9a-f]{6})"/gi, (match, fillColor: string) => {
    const source = hexToRgb(fillColor);
    const max = Math.max(source.r, source.g, source.b);
    const min = Math.min(source.r, source.g, source.b);
    const lightness = (max + min) / 510;
    const saturation = max === 0 ? 0 : (max - min) / max;

    if (lightness > 0.84 && saturation < 0.18) {
      return match;
    }

    const shadedHex = lightness < 0.5
      ? mixHex(targetHex, "#050505", (0.5 - lightness) * 0.85)
      : mixHex(targetHex, "#ffffff", (lightness - 0.5) * 0.7);

    return `fill="${shadedHex}"`;
  });
}

function normalizeHexColor(value: unknown, fallback: string): string {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : fallback;
}

function mixHex(hex: string, targetHex: string, targetWeight: number): string {
  const source = hexToRgb(hex);
  const target = hexToRgb(targetHex);
  const weight = Math.min(1, Math.max(0, targetWeight));
  return rgbToHex({
    r: Math.round(source.r * (1 - weight) + target.r * weight),
    g: Math.round(source.g * (1 - weight) + target.g * weight),
    b: Math.round(source.b * (1 - weight) + target.b * weight),
  });
}

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }: { r: number; g: number; b: number }): string {
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

function clampTurnTimeLimitMs(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_TURN_TIME_LIMIT_MS;
  }

  return Math.min(MAX_TURN_TIME_LIMIT_MS, Math.max(MIN_TURN_TIME_LIMIT_MS, Math.round(parsed)));
}

function clampTurnTimeSeconds(value: unknown): number {
  return Math.round(clampTurnTimeLimitMs(Number(value) * 1000) / 1000);
}

function secondsToMs(value: unknown): number {
  return clampTurnTimeSeconds(value) * 1000;
}

function getClient(clientRef: MutableRefObject<Client | null>): Client {
  if (!clientRef.current) {
    clientRef.current = new Client(getServerUrl());
  }

  return clientRef.current;
}

function getServerUrl(): string {
  const configuredUrl = import.meta.env.VITE_COLYSEUS_URL as string | undefined;
  if (configuredUrl) {
    return configuredUrl;
  }

  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const localHosts = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);
  if (localHosts.has(window.location.hostname)) {
    return `${protocol}://${window.location.hostname}:2567`;
  }

  return `${protocol}://${window.location.host}`;
}

function getStartBlocker(state: GameStateSnapshot): string {
  const activePlayers = state.players.filter((player) => player.connected || player.isBot);
  const disconnectedPlayers = state.players.filter((player) => !player.connected && !player.isBot);
  const waitingPlayers = state.players.filter((player) => player.connected && !player.isBot && !player.ready);

  if (activePlayers.length < 2) {
    return "Mindestens zwei Spieler oder Computer werden benötigt.";
  }

  if (disconnectedPlayers.length > 0) {
    return "Warte auf disconnected Spieler oder entferne sie als Host.";
  }

  if (waitingPlayers.length > 0) {
    return "Noch nicht alle Spieler sind bereit.";
  }

  return "";
}

function getPlayerStatus(ready: boolean, connected: boolean, isBot: boolean, active: boolean): string {
  if (active) {
    return "am Zug";
  }
  if (isBot) {
    return "Computer";
  }
  if (!connected) {
    return "offline";
  }
  return ready ? "bereit" : "wartet";
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Verbindung fehlgeschlagen.";
}

function shouldForgetSavedRoom(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("gespeicherte") || normalized.includes("not found") || normalized.includes("nicht gefunden");
}

function getSavedThemeMode(): ThemeMode {
  return localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
}

function getSavedPlayerPreferences(): PlayerPreferences {
  try {
    const raw = localStorage.getItem(PLAYER_PREFS_STORAGE_KEY);
    if (!raw) {
      return DEFAULT_PLAYER_PREFERENCES;
    }

    const parsed = JSON.parse(raw) as Partial<PlayerPreferences>;
    const parsedTrack = Number(parsed.musicTrackIndex ?? DEFAULT_PLAYER_PREFERENCES.musicTrackIndex);
    return {
      ...DEFAULT_PLAYER_PREFERENCES,
      dragToMove: Boolean(parsed.dragToMove),
      musicEnabled: false,
      musicVolume: clampVolume(parsed.musicVolume, DEFAULT_PLAYER_PREFERENCES.musicVolume),
      musicTrackIndex: wrapTrackIndex(Number.isFinite(parsedTrack) ? parsedTrack : 0),
      clickSoundPreset: isClickSoundPreset(parsed.clickSoundPreset)
        ? parsed.clickSoundPreset
        : DEFAULT_PLAYER_PREFERENCES.clickSoundPreset,
      clickVolume: clampVolume(parsed.clickVolume, DEFAULT_PLAYER_PREFERENCES.clickVolume),
    };
  } catch {
    return DEFAULT_PLAYER_PREFERENCES;
  }
}

function getRoomStorageKey(roomId: string): string {
  return `mensch:room:${roomId}`;
}

function getReconnectToken(roomId: string): string {
  return localStorage.getItem(getRoomStorageKey(roomId)) || "";
}

function getSavedRoomSession(): SavedRoomSession | null {
  try {
    const raw = localStorage.getItem(LAST_ROOM_KEY);
    return raw ? JSON.parse(raw) as SavedRoomSession : null;
  } catch {
    return null;
  }
}

function saveRoomSession(session: SavedRoomSession): void {
  localStorage.setItem(getRoomStorageKey(session.roomId), session.reconnectToken);
  localStorage.setItem(LAST_ROOM_KEY, JSON.stringify(session));
}

function clearRoomSession(roomId: string): void {
  localStorage.removeItem(getRoomStorageKey(roomId));
  const saved = getSavedRoomSession();
  if (saved?.roomId === roomId) {
    localStorage.removeItem(LAST_ROOM_KEY);
  }
}

function playUiSound(sound: UiSoundName, preferences: PlayerPreferences, volumeScale = 1): void {
  const volume = clampVolume(preferences.clickVolume) * Math.min(1, Math.max(0, volumeScale));
  if (volume <= 0) {
    return;
  }

  const audio = new Audio(getSoundAsset(sound, preferences.clickSoundPreset));
  audio.volume = volume;
  audio.playbackRate = getSoundPlaybackRate(sound, preferences.clickSoundPreset);
  void audio.play();
}

function getClickPresetLabel(preset: ClickSoundPreset): string {
  const labels: Record<ClickSoundPreset, string> = {
    arcade: "Arcade",
    wood: "Holz",
    soft: "Leise",
    classic: "Classic",
  };

  return labels[preset] || labels.arcade;
}

function getSoundAsset(sound: UiSoundName, preset: ClickSoundPreset): string {
  if (sound === "start") {
    return soundAssets.gameStart;
  }
  if (sound === "win") {
    return soundAssets.victory;
  }
  if (sound === "lose") {
    return soundAssets.mouseClose;
  }
  if (sound === "capture") {
    return preset === "wood" ? soundAssets.mouseClose : soundAssets.selectClick;
  }
  if (sound === "error") {
    return soundAssets.mouseClose;
  }
  if (sound === "roll") {
    return preset === "soft" ? soundAssets.coolClick : soundAssets.modernSelect;
  }
  if (sound === "move") {
    return preset === "wood" ? soundAssets.selectClick : soundAssets.coolClick;
  }
  if (sound === "step") {
    return preset === "wood" ? soundAssets.selectClick : soundAssets.coolClick;
  }
  if (sound === "turn") {
    return soundAssets.selectClick;
  }

  const presetAssets: Record<ClickSoundPreset, string> = {
    arcade: soundAssets.modernSelect,
    wood: soundAssets.selectClick,
    soft: soundAssets.coolClick,
    classic: soundAssets.mouseClose,
  };

  return presetAssets[preset] || presetAssets.arcade;
}

function getSoundPlaybackRate(sound: UiSoundName, preset: ClickSoundPreset): number {
  const baseRates: Record<ClickSoundPreset, number> = {
    arcade: 1.12,
    wood: 0.82,
    soft: 0.92,
    classic: 1,
  };
  const soundRates: Partial<Record<UiSoundName, number>> = {
    error: 0.72,
    roll: 1.18,
    capture: 0.88,
    step: 1.34,
    turn: 1.05,
    lose: 0.78,
    win: 1,
    start: 1,
  };

  return (soundRates[sound] || 1) * (baseRates[preset] || 1);
}

function isClickSoundPreset(value: unknown): value is ClickSoundPreset {
  return value === "classic" || value === "soft" || value === "arcade" || value === "wood";
}

function getTrackIndex(index: number): number {
  return wrapTrackIndex(index);
}

function wrapTrackIndex(index: number): number {
  return ((Math.round(index) % musicAssets.length) + musicAssets.length) % musicAssets.length;
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "0:00";
  }

  const wholeSeconds = Math.floor(seconds);
  const minutes = Math.floor(wholeSeconds / 60);
  const remainingSeconds = wholeSeconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function clampVolume(value: unknown, fallback = 0): number {
  const volume = Number(value);
  if (!Number.isFinite(volume)) {
    return fallback;
  }

  return Math.min(1, Math.max(0, volume));
}
