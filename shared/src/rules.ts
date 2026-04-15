import {
  DEFAULT_TURN_TIME_LIMIT_MS,
  PIECES_PER_PLAYER,
  getBoardConfigForMode,
  getPlayerColorsForMode,
} from "./constants";
import { BASE_POSITION, type GameMode, type GameStateSnapshot, type MoveOption, type MoveResult, type PieceState, type PlayerColor, type PlayerState } from "./types";

export function createPieces(color: PlayerColor): PieceState[] {
  return Array.from({ length: PIECES_PER_PLAYER }, (_, index) => ({
    id: `${color}-${index}`,
    color,
    index,
    position: BASE_POSITION,
  }));
}

export function createInitialSnapshot(roomId: string, strikeRequired = false, gameMode: GameMode = "multiplayer"): GameStateSnapshot {
  return {
    roomId,
    hostId: "",
    gameMode,
    status: "lobby",
    players: [],
    currentPlayerIndex: 0,
    diceValue: 0,
    diceRolled: false,
    rollAttempts: 0,
    legalMoves: [],
    winnerColor: "",
    lastEvent: "Lobby erstellt.",
    turnStartedAt: 0,
    turnDeadlineAt: 0,
    settings: { strikeRequired, chatFilterEnabled: true, turnTimeLimitMs: DEFAULT_TURN_TIME_LIMIT_MS },
    chat: [],
    updatedAt: Date.now(),
  };
}

export function cloneState(state: GameStateSnapshot): GameStateSnapshot {
  return JSON.parse(JSON.stringify(state)) as GameStateSnapshot;
}

export function getAvailableColors(players: PlayerState[], mode: GameMode = "party"): PlayerColor[] {
  const usedColors = new Set(players.map((player) => player.color));
  return getPlayerColorsForMode(mode).filter((color) => !usedColors.has(color));
}

export function sortPlayersClockwise(players: PlayerState[], mode: GameMode = "party"): PlayerState[] {
  const colors = getBoardConfigForMode(mode).clockwiseColors;
  return [...players].sort(
    (a, b) => colors.indexOf(a.color) - colors.indexOf(b.color),
  );
}

export function getActivePlayer(state: GameStateSnapshot): PlayerState | undefined {
  return state.players[state.currentPlayerIndex];
}

export function getPlayerById(state: GameStateSnapshot, playerId: string): PlayerState | undefined {
  return state.players.find((player) => player.id === playerId);
}

export function getPlayerByColor(state: GameStateSnapshot, color: PlayerColor): PlayerState | undefined {
  return state.players.find((player) => player.color === color);
}

export function isTrackPosition(position: number, mode: GameMode = "party"): boolean {
  return position >= 0 && position < getBoardConfigForMode(mode).trackLength;
}

export function isHomePosition(position: number, mode: GameMode = "party"): boolean {
  const board = getBoardConfigForMode(mode);
  return position >= board.trackLength && position <= board.finalPosition;
}

export function getAbsoluteTrackIndex(color: PlayerColor, position: number, mode: GameMode = "party"): number | null {
  const board = getBoardConfigForMode(mode);
  if (!isTrackPosition(position, mode)) {
    return null;
  }

  return (board.startIndex[color] + position) % board.trackLength;
}

export function isPlayerFinished(player: PlayerState, mode: GameMode = "party"): boolean {
  return player.pieces.every((piece) => isHomePosition(piece.position, mode));
}

export function hasTrackPiece(player: PlayerState, mode: GameMode = "party"): boolean {
  return player.pieces.some((piece) => isTrackPosition(piece.position, mode));
}

export function hasBasePiece(player: PlayerState): boolean {
  return player.pieces.some((piece) => piece.position === BASE_POSITION);
}

export function areHomePiecesAdvanced(player: PlayerState, mode: GameMode = "party"): boolean {
  const board = getBoardConfigForMode(mode);
  const homeSlots = player.pieces
    .filter((piece) => isHomePosition(piece.position, mode))
    .map((piece) => piece.position - board.trackLength)
    .sort((a, b) => a - b);

  if (homeSlots.length === 0) {
    return true;
  }

  const firstExpectedSlot = board.homeLength - homeSlots.length;
  return homeSlots.every((slot, index) => slot === firstExpectedSlot + index);
}

export function canUseThreeRollAttempts(player: PlayerState, mode: GameMode = "party"): boolean {
  return !hasTrackPiece(player, mode) && hasBasePiece(player) && areHomePiecesAdvanced(player, mode);
}

export function shouldKeepRollingAfterMiss(state: GameStateSnapshot): boolean {
  const player = getActivePlayer(state);
  return Boolean(player && canUseThreeRollAttempts(player, state.gameMode) && state.rollAttempts < 3);
}

export function getLegalMoves(state: GameStateSnapshot): MoveOption[] {
  const player = getActivePlayer(state);
  if (!player || state.status !== "playing" || !state.diceRolled || state.diceValue < 1) {
    return [];
  }

  const allMoves = player.pieces
    .map((piece) => buildMoveForPiece(state, player, piece))
    .filter((move): move is MoveOption => Boolean(move));

  const basePieceCount = player.pieces.filter((piece) => piece.position === BASE_POSITION).length;
  const startPiece = player.pieces.find((piece) => piece.position === 0);
  const startMove = startPiece ? allMoves.find((move) => move.pieceId === startPiece.id) : undefined;

  let candidates = allMoves;

  if (basePieceCount > 0 && startMove) {
    candidates = [startMove];
  }

  if (state.settings.strikeRequired) {
    const captureMoves = candidates.filter((move) => move.captures.length > 0);
    if (captureMoves.length > 0) {
      candidates = captureMoves;
    }
  }

  return candidates.sort((a, b) => {
    if (a.captures.length !== b.captures.length) {
      return b.captures.length - a.captures.length;
    }

    if (a.from !== b.from) {
      return b.from - a.from;
    }

    return a.pieceId.localeCompare(b.pieceId);
  });
}

export function applyMove(state: GameStateSnapshot, pieceId: string): MoveResult {
  const legalMoves = getLegalMoves(state);
  const selectedMove = legalMoves.find((move) => move.pieceId === pieceId);

  if (!selectedMove) {
    return {
      state,
      error: "Dieser Zug ist nach den aktuellen Regeln nicht erlaubt.",
    };
  }

  const nextState = cloneState(state);
  const activePlayer = getActivePlayer(nextState);

  if (!activePlayer) {
    return {
      state,
      error: "Kein aktiver Spieler gefunden.",
    };
  }

  const movingPiece = activePlayer.pieces.find((piece) => piece.id === pieceId);
  if (!movingPiece) {
    return {
      state,
      error: "Die Figur wurde nicht gefunden.",
    };
  }

  movingPiece.position = selectedMove.to;

  if (selectedMove.captures.length > 0) {
    const capturedIds = new Set(selectedMove.captures);
    for (const player of nextState.players) {
      if (player.color === activePlayer.color) {
        continue;
      }

      for (const piece of player.pieces) {
        if (capturedIds.has(piece.id)) {
          piece.position = BASE_POSITION;
        }
      }
    }
  }

  nextState.legalMoves = [];
  nextState.updatedAt = Date.now();

  if (isPlayerFinished(activePlayer, nextState.gameMode)) {
    nextState.status = "finished";
    nextState.winnerColor = activePlayer.color;
    nextState.lastEvent = `${activePlayer.name} hat alle Figuren ins Ziel gebracht.`;
  }

  return { state: nextState, move: selectedMove };
}

export function advanceToNextPlayer(state: GameStateSnapshot): GameStateSnapshot {
  const nextState = cloneState(state);
  if (nextState.players.length === 0) {
    return nextState;
  }

  for (let offset = 1; offset <= nextState.players.length; offset += 1) {
    const nextIndex = (nextState.currentPlayerIndex + offset) % nextState.players.length;
    const nextPlayer = nextState.players[nextIndex];
    if (nextPlayer.isBot || nextPlayer.connected) {
      nextState.currentPlayerIndex = nextIndex;
      break;
    }
  }

  nextState.diceValue = 0;
  nextState.diceRolled = false;
  nextState.rollAttempts = 0;
  nextState.legalMoves = [];
  nextState.turnStartedAt = 0;
  nextState.turnDeadlineAt = 0;
  nextState.updatedAt = Date.now();
  return nextState;
}

export function resetForRematch(state: GameStateSnapshot): GameStateSnapshot {
  const nextState = cloneState(state);
  nextState.status = "lobby";
  nextState.players = sortPlayersClockwise(nextState.players, nextState.gameMode).map((player) => ({
    ...player,
    ready: player.isBot,
    customColor: player.customColor,
    pieces: createPieces(player.color),
  }));
  nextState.currentPlayerIndex = 0;
  nextState.diceValue = 0;
  nextState.diceRolled = false;
  nextState.rollAttempts = 0;
  nextState.legalMoves = [];
  nextState.winnerColor = "";
  nextState.lastEvent = "Revanche vorbereitet.";
  nextState.turnStartedAt = 0;
  nextState.turnDeadlineAt = 0;
  nextState.updatedAt = Date.now();
  return nextState;
}

function buildMoveForPiece(
  state: GameStateSnapshot,
  player: PlayerState,
  piece: PieceState,
): MoveOption | null {
  const dice = state.diceValue;
  let targetPosition: number;

  if (piece.position === BASE_POSITION) {
    if (dice !== 6) {
      return null;
    }

    targetPosition = 0;
  } else {
    targetPosition = piece.position + dice;
  }

  if (targetPosition > getBoardConfigForMode(state.gameMode).finalPosition) {
    return null;
  }

  if (isOwnDestinationOccupied(player, piece.id, targetPosition, state.gameMode)) {
    return null;
  }

  return {
    pieceId: piece.id,
    from: piece.position,
    to: targetPosition,
    captures: getCapturedPieceIds(state, player.color, targetPosition),
  };
}

function isOwnDestinationOccupied(
  player: PlayerState,
  movingPieceId: string,
  targetPosition: number,
  mode: GameMode,
): boolean {
  return player.pieces.some((piece) => {
    if (piece.id === movingPieceId) {
      return false;
    }

    if (isHomePosition(targetPosition, mode)) {
      return piece.position === targetPosition;
    }

    if (isTrackPosition(targetPosition, mode)) {
      return piece.position === targetPosition;
    }

    return false;
  });
}

function getCapturedPieceIds(
  state: GameStateSnapshot,
  activeColor: PlayerColor,
  targetPosition: number,
): string[] {
  const targetTrackIndex = getAbsoluteTrackIndex(activeColor, targetPosition, state.gameMode);
  if (targetTrackIndex === null) {
    return [];
  }

  const capturedIds: string[] = [];
  for (const player of state.players) {
    if (player.color === activeColor) {
      continue;
    }

    for (const piece of player.pieces) {
      const pieceTrackIndex = getAbsoluteTrackIndex(player.color, piece.position, state.gameMode);
      if (pieceTrackIndex === targetTrackIndex) {
        capturedIds.push(piece.id);
      }
    }
  }

  return capturedIds;
}
