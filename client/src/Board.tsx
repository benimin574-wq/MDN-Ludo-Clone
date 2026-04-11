import type { CSSProperties } from "react";
import { BASE_COORDS, COLOR_META, HOME_COORDS, START_INDEX, TRACK_COORDS, TRACK_LENGTH } from "../../shared/src/constants";
import { getAbsoluteTrackIndex, isHomePosition, isTrackPosition } from "../../shared/src/rules";
import { BASE_POSITION, type GameStateSnapshot, type PieceState, type PlayerColor } from "../../shared/src/types";
import { boardAsset, pieceAssets } from "./assets";

interface BoardProps {
  state: GameStateSnapshot;
  selectedPieceId: string;
  onSelectPiece: (pieceId: string) => void;
  disabled?: boolean;
}

const BOARD_SIZE = 1100;
const GRID_OFFSET = 100;
const CELL_SIZE = 90;
const TOKEN_SIZE = 70;

export function Board({ state, selectedPieceId, onSelectPiece, disabled = false }: BoardProps) {
  const legalPieceIds = new Set(disabled ? [] : state.legalMoves.map((move) => move.pieceId));
  const legalDestinations = disabled ? [] : state.legalMoves.map((move) => getPointForMove(state, move.to));
  const occupiedCounts = new Map<string, number>();
  const pieces = state.players.flatMap((player) => player.pieces);

  return (
    <div
      className={`board-shell ${disabled ? "board-shell--disabled" : ""}`}
      style={{ "--board-art": `url("${boardAsset}")` } as CSSProperties}
    >
      <svg className="game-board" viewBox={`0 0 ${BOARD_SIZE} ${BOARD_SIZE}`} role="img" aria-label="Spielbrett">
        <rect className="board-bg" x="20" y="20" width="1060" height="1060" rx="8" />
        {Object.keys(BASE_COORDS).map((color) => (
          <BaseYard key={color} color={color as PlayerColor} />
        ))}
        {TRACK_COORDS.map((point, index) => {
          const startColor = getStartColor(index);
          return (
            <circle
              key={`${point.x}-${point.y}`}
              className={`track-cell ${startColor ? "start-cell" : ""}`}
              cx={toSvgCoord(point.x)}
              cy={toSvgCoord(point.y)}
              r="32"
              fill={startColor ? COLOR_META[startColor].soft : "#f8faf9"}
              stroke={startColor ? COLOR_META[startColor].hex : "#2b2b2b"}
            />
          );
        })}
        {Object.entries(HOME_COORDS).map(([color, points]) =>
          points.map((point, index) => (
            <circle
              key={`${color}-${index}`}
              className="home-cell"
              cx={toSvgCoord(point.x)}
              cy={toSvgCoord(point.y)}
              r="32"
              fill={COLOR_META[color as PlayerColor].soft}
              stroke={COLOR_META[color as PlayerColor].hex}
            />
          )),
        )}
        <polygon className="center-goal" points="550,470 630,550 550,630 470,550" />
        {legalDestinations.map((point, index) =>
          point ? (
            <circle
              key={`${point.x}-${point.y}-${index}`}
              className="legal-target"
              cx={toSvgCoord(point.x)}
              cy={toSvgCoord(point.y)}
              r="42"
            />
          ) : null,
        )}
        {pieces.map((piece) => {
          const point = getPointForPiece(piece);
          if (!point) {
            return null;
          }

          const key = `${point.x}-${point.y}`;
          const count = occupiedCounts.get(key) || 0;
          occupiedCounts.set(key, count + 1);
          const offset = getStackOffset(count);
          const cx = toSvgCoord(point.x) + offset.x;
          const cy = toSvgCoord(point.y) + offset.y;
          const legal = legalPieceIds.has(piece.id);
          const selected = selectedPieceId === piece.id;

          return (
            <g
              key={piece.id}
              className={`piece-token ${legal ? "piece-token--legal" : ""} ${selected ? "piece-token--selected" : ""}`}
              transform={`translate(${cx} ${cy}) scale(${selected ? 1.14 : 1}) translate(${-cx} ${-cy})`}
              role={legal ? "button" : "img"}
              tabIndex={legal ? 0 : -1}
              aria-label={`${COLOR_META[piece.color].label}e Figur ${piece.index + 1}`}
              onClick={() => legal && onSelectPiece(piece.id)}
              onKeyDown={(event) => {
                if (legal && (event.key === "Enter" || event.key === " ")) {
                  event.preventDefault();
                  onSelectPiece(piece.id);
                }
              }}
            >
              <circle
                className="piece-shadow"
                cx={cx + 2}
                cy={cy + 4}
                r={TOKEN_SIZE / 2}
              />
              <circle
                className="piece-outline"
                cx={cx}
                cy={cy}
                r={TOKEN_SIZE / 2 + 4}
                fill="none"
              />
              <circle
                className="piece-ring"
                cx={cx}
                cy={cy}
                r={TOKEN_SIZE / 2}
                fill="#ffffff"
                stroke={selected ? "#111111" : COLOR_META[piece.color].dark}
              />
              <image
                href={pieceAssets[piece.color]}
                x={cx - TOKEN_SIZE / 2 + 6}
                y={cy - TOKEN_SIZE / 2 + 6}
                width={TOKEN_SIZE - 12}
                height={TOKEN_SIZE - 12}
                preserveAspectRatio="xMidYMid meet"
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function BaseYard({ color }: { color: PlayerColor }) {
  const points = BASE_COORDS[color];
  const xValues = points.map((point) => toSvgCoord(point.x));
  const yValues = points.map((point) => toSvgCoord(point.y));
  const x = Math.min(...xValues) - 54;
  const y = Math.min(...yValues) - 54;
  const width = Math.max(...xValues) - Math.min(...xValues) + 108;
  const height = Math.max(...yValues) - Math.min(...yValues) + 108;

  return (
    <g>
      <rect
        className="base-yard"
        x={x}
        y={y}
        width={width}
        height={height}
        rx="8"
        fill={COLOR_META[color].soft}
        stroke={COLOR_META[color].hex}
      />
      {points.map((point, index) => (
        <circle
          key={`${color}-base-${index}`}
          className="base-slot"
          cx={toSvgCoord(point.x)}
          cy={toSvgCoord(point.y)}
          r="34"
          fill="#ffffff"
          stroke={COLOR_META[color].hex}
        />
      ))}
    </g>
  );
}

function getPointForMove(state: GameStateSnapshot, targetPosition: number) {
  const activePlayer = state.players[state.currentPlayerIndex];
  if (!activePlayer) {
    return null;
  }

  if (isHomePosition(targetPosition)) {
    return HOME_COORDS[activePlayer.color][targetPosition - TRACK_LENGTH];
  }

  const absoluteTrackIndex = getAbsoluteTrackIndex(activePlayer.color, targetPosition);
  return absoluteTrackIndex === null ? null : TRACK_COORDS[absoluteTrackIndex];
}

function getPointForPiece(piece: PieceState) {
  if (piece.position === BASE_POSITION) {
    return BASE_COORDS[piece.color][piece.index];
  }

  if (isHomePosition(piece.position)) {
    return HOME_COORDS[piece.color][piece.position - TRACK_LENGTH];
  }

  if (isTrackPosition(piece.position)) {
    const absoluteTrackIndex = getAbsoluteTrackIndex(piece.color, piece.position);
    return absoluteTrackIndex === null ? null : TRACK_COORDS[absoluteTrackIndex];
  }

  return null;
}

function getStartColor(trackIndex: number): PlayerColor | undefined {
  return Object.entries(START_INDEX).find(([, startIndex]) => startIndex === trackIndex)?.[0] as PlayerColor | undefined;
}

function toSvgCoord(gridValue: number): number {
  return GRID_OFFSET + gridValue * CELL_SIZE;
}

function getStackOffset(index: number) {
  const offsets = [
    { x: 0, y: 0 },
    { x: -16, y: -16 },
    { x: 16, y: -16 },
    { x: -16, y: 16 },
    { x: 16, y: 16 },
  ];

  return offsets[index] || { x: 0, y: 0 };
}
