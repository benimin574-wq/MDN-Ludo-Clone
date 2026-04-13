import { CLOCKWISE_COLORS, FINAL_POSITION, HOME_LENGTH, PIECES_PER_PLAYER, PLAYER_COLORS, START_INDEX, TRACK_LENGTH, } from "./constants";
import { BASE_POSITION } from "./types";
export function createPieces(color) {
    return Array.from({ length: PIECES_PER_PLAYER }, (_, index) => ({
        id: `${color}-${index}`,
        color,
        index,
        position: BASE_POSITION,
    }));
}
export function createInitialSnapshot(roomId, strikeRequired = false) {
    return {
        roomId,
        hostId: "",
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
        settings: { strikeRequired, chatFilterEnabled: true },
        chat: [],
        updatedAt: Date.now(),
    };
}
export function cloneState(state) {
    return JSON.parse(JSON.stringify(state));
}
export function getAvailableColors(players) {
    const usedColors = new Set(players.map((player) => player.color));
    return PLAYER_COLORS.filter((color) => !usedColors.has(color));
}
export function sortPlayersClockwise(players) {
    return [...players].sort((a, b) => CLOCKWISE_COLORS.indexOf(a.color) - CLOCKWISE_COLORS.indexOf(b.color));
}
export function getActivePlayer(state) {
    return state.players[state.currentPlayerIndex];
}
export function getPlayerById(state, playerId) {
    return state.players.find((player) => player.id === playerId);
}
export function getPlayerByColor(state, color) {
    return state.players.find((player) => player.color === color);
}
export function isTrackPosition(position) {
    return position >= 0 && position < TRACK_LENGTH;
}
export function isHomePosition(position) {
    return position >= TRACK_LENGTH && position <= FINAL_POSITION;
}
export function getAbsoluteTrackIndex(color, position) {
    if (!isTrackPosition(position)) {
        return null;
    }
    return (START_INDEX[color] + position) % TRACK_LENGTH;
}
export function isPlayerFinished(player) {
    return player.pieces.every((piece) => isHomePosition(piece.position));
}
export function hasTrackPiece(player) {
    return player.pieces.some((piece) => isTrackPosition(piece.position));
}
export function hasBasePiece(player) {
    return player.pieces.some((piece) => piece.position === BASE_POSITION);
}
export function areHomePiecesAdvanced(player) {
    const homeSlots = player.pieces
        .filter((piece) => isHomePosition(piece.position))
        .map((piece) => piece.position - TRACK_LENGTH)
        .sort((a, b) => a - b);
    if (homeSlots.length === 0) {
        return true;
    }
    const firstExpectedSlot = HOME_LENGTH - homeSlots.length;
    return homeSlots.every((slot, index) => slot === firstExpectedSlot + index);
}
export function canUseThreeRollAttempts(player) {
    return !hasTrackPiece(player) && hasBasePiece(player) && areHomePiecesAdvanced(player);
}
export function shouldKeepRollingAfterMiss(state) {
    const player = getActivePlayer(state);
    return Boolean(player && canUseThreeRollAttempts(player) && state.rollAttempts < 3);
}
export function getLegalMoves(state) {
    const player = getActivePlayer(state);
    if (!player || state.status !== "playing" || !state.diceRolled || state.diceValue < 1) {
        return [];
    }
    const allMoves = player.pieces
        .map((piece) => buildMoveForPiece(state, player, piece))
        .filter((move) => Boolean(move));
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
export function applyMove(state, pieceId) {
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
    if (isPlayerFinished(activePlayer)) {
        nextState.status = "finished";
        nextState.winnerColor = activePlayer.color;
        nextState.lastEvent = `${activePlayer.name} hat alle Figuren ins Ziel gebracht.`;
    }
    return { state: nextState, move: selectedMove };
}
export function advanceToNextPlayer(state) {
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
export function resetForRematch(state) {
    const nextState = cloneState(state);
    nextState.status = "lobby";
    nextState.players = sortPlayersClockwise(nextState.players).map((player) => ({
        ...player,
        ready: player.isBot,
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
function buildMoveForPiece(state, player, piece) {
    const dice = state.diceValue;
    let targetPosition;
    if (piece.position === BASE_POSITION) {
        if (dice !== 6) {
            return null;
        }
        targetPosition = 0;
    }
    else {
        targetPosition = piece.position + dice;
    }
    if (targetPosition > FINAL_POSITION) {
        return null;
    }
    if (isOwnDestinationOccupied(player, piece.id, targetPosition)) {
        return null;
    }
    return {
        pieceId: piece.id,
        from: piece.position,
        to: targetPosition,
        captures: getCapturedPieceIds(state, player.color, targetPosition),
    };
}
function isOwnDestinationOccupied(player, movingPieceId, targetPosition) {
    return player.pieces.some((piece) => {
        if (piece.id === movingPieceId) {
            return false;
        }
        if (isHomePosition(targetPosition)) {
            return piece.position === targetPosition;
        }
        if (isTrackPosition(targetPosition)) {
            return piece.position === targetPosition;
        }
        return false;
    });
}
function getCapturedPieceIds(state, activeColor, targetPosition) {
    const targetTrackIndex = getAbsoluteTrackIndex(activeColor, targetPosition);
    if (targetTrackIndex === null) {
        return [];
    }
    const capturedIds = [];
    for (const player of state.players) {
        if (player.color === activeColor) {
            continue;
        }
        for (const piece of player.pieces) {
            const pieceTrackIndex = getAbsoluteTrackIndex(player.color, piece.position);
            if (pieceTrackIndex === targetTrackIndex) {
                capturedIds.push(piece.id);
            }
        }
    }
    return capturedIds;
}
