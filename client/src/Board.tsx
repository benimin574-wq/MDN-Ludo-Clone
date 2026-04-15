import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent } from "react";
import { COLOR_META, getBoardConfigForMode } from "../../shared/src/constants";
import { getAbsoluteTrackIndex, isHomePosition, isTrackPosition } from "../../shared/src/rules";
import { BASE_POSITION, type GameStateSnapshot, type PieceState, type PlayerColor } from "../../shared/src/types";
import { getPieceAssetForColor, useTintedPieceAssets } from "./pieceTint";

interface BoardProps {
  state: GameStateSnapshot;
  selectedPieceId: string;
  onSelectPiece: (pieceId: string) => void;
  disabled?: boolean;
  dragToMove?: boolean;
  moveAnimation?: PieceMoveAnimation | null;
  captureMarkers?: CaptureMarker[];
}

export interface PieceMoveAnimation {
  pieceId: string;
  from: number;
  to: number;
  startedAt: number;
  durationMs: number;
}

export interface CaptureMarker {
  id: string;
  pieceId: string;
  color: PlayerColor;
  index: number;
  position: number;
  startedAt: number;
  durationMs: number;
}

const BOARD_SIZE = 1100;
const GRID_OFFSET = 100;
const CELL_SIZE = 90;
const TOKEN_SIZE = 70;
const DROP_DISTANCE = 76;
const EMPTY_LEGAL_MOVES: GameStateSnapshot["legalMoves"] = [];

interface DragState {
  pieceId: string;
  x: number;
  y: number;
}

export function Board({
  state,
  selectedPieceId,
  onSelectPiece,
  disabled = false,
  dragToMove = false,
  moveAnimation = null,
  captureMarkers = [],
}: BoardProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [animationNow, setAnimationNow] = useState(() => Date.now());
  useTintedPieceAssets(state.players);
  const board = getBoardConfigForMode(state.gameMode);
  const legalMoves = disabled ? EMPTY_LEGAL_MOVES : state.legalMoves;
  const legalPieceIds = useMemo(() => new Set(legalMoves.map((move) => move.pieceId)), [legalMoves]);
  const legalMoveByPiece = useMemo(() => new Map(legalMoves.map((move) => [move.pieceId, move])), [legalMoves]);
  const legalDestinations = useMemo(() => legalMoves.map((move) => getPointForMove(state, move.to)), [legalMoves, state]);
  const pieces = useMemo(() => state.players.flatMap((player) => player.pieces), [state.players]);
  const occupiedCounts = new Map<string, number>();

  useEffect(() => {
    if (!moveAnimation) {
      return;
    }

    setAnimationNow(Date.now());
    const intervalId = window.setInterval(() => setAnimationNow(Date.now()), 32);
    const timeoutId = window.setTimeout(() => {
      window.clearInterval(intervalId);
      setAnimationNow(Date.now());
    }, moveAnimation.durationMs + 80);

    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
    };
  }, [moveAnimation]);

  function getSvgPointerPoint(event: PointerEvent<SVGElement>) {
    const svg = svgRef.current;
    if (!svg) {
      return null;
    }

    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const matrix = svg.getScreenCTM();
    return matrix ? point.matrixTransform(matrix.inverse()) : null;
  }

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    if (!dragState) {
      return;
    }

    const point = getSvgPointerPoint(event);
    if (point) {
      setDragState({ pieceId: dragState.pieceId, x: point.x, y: point.y });
    }
  }

  function handlePointerUp(event: PointerEvent<SVGSVGElement>) {
    if (!dragState) {
      return;
    }

    const point = getSvgPointerPoint(event);
    const move = legalMoveByPiece.get(dragState.pieceId);
    const target = move ? getPointForMove(state, move.to) : null;
    setDragState(null);

    if (!point || !target) {
      return;
    }

    const targetX = toSvgCoord(target.x);
    const targetY = toSvgCoord(target.y);
    const distance = Math.hypot(point.x - targetX, point.y - targetY);
    if (distance <= DROP_DISTANCE) {
      onSelectPiece(dragState.pieceId);
    }
  }

  function handlePiecePointerDown(event: PointerEvent<SVGGElement>, pieceId: string, legal: boolean) {
    if (!dragToMove || !legal) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = getSvgPointerPoint(event);
    if (point) {
      setDragState({ pieceId, x: point.x, y: point.y });
    }
  }

  return (
    <div
      className={`board-shell ${disabled ? "board-shell--disabled" : ""}`}
    >
      <svg
        className={`game-board ${dragToMove ? "game-board--drag-mode" : ""}`}
        viewBox={`0 0 ${BOARD_SIZE} ${BOARD_SIZE}`}
        role="img"
        aria-label="Spielbrett"
        ref={svgRef}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => setDragState(null)}
      >
        <rect className="board-bg" x="20" y="20" width="1060" height="1060" rx="8" />
        {board.playerColors.map((color) => (
          <BaseYard key={color} state={state} color={color as PlayerColor} />
        ))}
        {board.trackCoords.map((point, index) => {
          const startColor = getStartColor(state, index);
          const startVisual = startColor ? getVisualColorForSeat(state, startColor) : null;
          return (
            <circle
              key={`${point.x}-${point.y}`}
              className={`track-cell ${startColor ? "start-cell" : ""}`}
              cx={toSvgCoord(point.x)}
              cy={toSvgCoord(point.y)}
              r="32"
              fill={startVisual ? startVisual.soft : "#f8faf9"}
              stroke={startVisual ? startVisual.hex : "#2b2b2b"}
            />
          );
        })}
        {board.playerColors.map((color) => {
          const points = board.homeCoords[color];
          const visual = getVisualColorForSeat(state, color as PlayerColor);
          return points.map((point, index) => (
              <circle
                key={`${color}-${index}`}
                className="home-cell"
                cx={toSvgCoord(point.x)}
                cy={toSvgCoord(point.y)}
                r="32"
                fill={visual.soft}
                stroke={visual.hex}
              />
            ));
        })}
        {board.id === "party" ? <CenterGarden /> : <ClassicCenter />}
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
          const animatedPoint = getAnimatedPointForPiece(piece, moveAnimation, animationNow, state.gameMode);
          const point = animatedPoint || getPointForPiece(piece, state.gameMode);
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
          const animating = Boolean(animatedPoint);
          const dragging = dragState?.pieceId === piece.id;
          const renderCx = dragging ? dragState.x : cx;
          const renderCy = dragging ? dragState.y : cy;
          const visual = getVisualColorForSeat(state, piece.color);
          const pieceHref = getPieceAssetForColor(piece.color, visual.hex);

          return (
            <g
              key={piece.id}
              className={`piece-token ${legal ? "piece-token--legal" : ""} ${dragging ? "piece-token--dragging" : ""} ${animating ? "piece-token--running" : ""} ${selected ? "piece-token--selected" : ""}`}
              transform={`translate(${renderCx} ${renderCy}) scale(${selected || dragging || animating ? 1.14 : 1}) translate(${-renderCx} ${-renderCy})`}
              role={legal ? "button" : "img"}
              tabIndex={legal ? 0 : -1}
              aria-label={`${COLOR_META[piece.color].label}e Figur ${piece.index + 1}`}
              onPointerDown={(event) => handlePiecePointerDown(event, piece.id, legal)}
              onClick={() => legal && !dragToMove && onSelectPiece(piece.id)}
              onKeyDown={(event) => {
                if (legal && (event.key === "Enter" || event.key === " ")) {
                  event.preventDefault();
                  onSelectPiece(piece.id);
                }
              }}
            >
              <circle
                className="piece-shadow"
                cx={renderCx + 2}
                cy={renderCy + 4}
                r={TOKEN_SIZE / 2}
              />
              <circle
                className="piece-outline"
                cx={renderCx}
                cy={renderCy}
                r={TOKEN_SIZE / 2 + 4}
                fill="none"
              />
              <circle
                className="piece-ring"
                cx={renderCx}
                cy={renderCy}
                r={TOKEN_SIZE / 2}
                style={{
                  fill: "#ffffff",
                  stroke: selected ? "#111111" : visual.dark,
                }}
              />
              <image
                href={pieceHref}
                x={renderCx - TOKEN_SIZE / 2 + 6}
                y={renderCy - TOKEN_SIZE / 2 + 6}
                width={TOKEN_SIZE - 12}
                height={TOKEN_SIZE - 12}
                preserveAspectRatio="xMidYMid meet"
              />
            </g>
          );
        })}
        {captureMarkers.map((marker) => {
          const point = getPointForPieceAtPosition(marker, marker.position, state.gameMode);
          const targetPoint = board.baseCoords[marker.color][marker.index];
          if (!point || !targetPoint) {
            return null;
          }

          const cx = toSvgCoord(point.x);
          const cy = toSvgCoord(point.y);
          const targetX = toSvgCoord(targetPoint.x);
          const targetY = toSvgCoord(targetPoint.y);
          const visual = getVisualColorForSeat(state, marker.color);
          const pieceHref = getPieceAssetForColor(marker.color, visual.hex);
          const returnDurationMs = Math.round(marker.durationMs * 0.78);

          return (
            <g
              key={marker.id}
              aria-hidden="true"
            >
              <g className="capture-return" transform={`translate(${cx} ${cy})`}>
                <animateTransform
                  attributeName="transform"
                  type="translate"
                  from={`${cx} ${cy}`}
                  to={`${targetX} ${targetY}`}
                  begin="0.18s"
                  dur={`${returnDurationMs}ms`}
                  fill="freeze"
                />
                <animate
                  attributeName="opacity"
                  values="1;1;0"
                  keyTimes="0;0.72;1"
                  dur={`${marker.durationMs}ms`}
                  fill="freeze"
                />
                <circle className="piece-shadow" cx="2" cy="4" r={TOKEN_SIZE / 2} />
                <circle
                  className="piece-ring"
                  cx="0"
                  cy="0"
                  r={TOKEN_SIZE / 2}
                  style={{ fill: "#ffffff", stroke: visual.dark }}
                />
                <image
                  href={pieceHref}
                  x={-TOKEN_SIZE / 2 + 6}
                  y={-TOKEN_SIZE / 2 + 6}
                  width={TOKEN_SIZE - 12}
                  height={TOKEN_SIZE - 12}
                  preserveAspectRatio="xMidYMid meet"
                />
              </g>
              <g transform={`translate(${cx} ${cy})`}>
                <g
                  className="capture-marker"
                  style={{ "--capture-color": visual.hex } as CSSProperties}
                >
                  <circle className="capture-marker__burst" r="43" />
                  <path className="capture-marker__slash capture-marker__slash--one" d="M-27 -27 L27 27" />
                  <path className="capture-marker__slash capture-marker__slash--two" d="M27 -27 L-27 27" />
                </g>
              </g>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function CenterGarden() {
  return (
    <g className="center-garden" aria-hidden="true">
      <circle className="center-garden__sand" cx="550" cy="550" r="124" />
      <path className="center-garden__path" d="M445 586 C492 558 506 520 550 516 C594 520 608 558 655 586" />
      <path className="center-garden__trunk" d="M528 631 C541 594 538 559 532 520 C559 558 562 593 573 631 Z" />
      <path className="center-garden__branch" d="M546 550 C510 530 492 504 475 474" />
      <path className="center-garden__branch" d="M552 544 C596 532 623 505 642 476" />
      <path className="center-garden__branch" d="M545 520 C540 491 546 464 564 438" />
      <circle className="center-garden__leaf center-garden__leaf--one" cx="482" cy="465" r="42" />
      <circle className="center-garden__leaf center-garden__leaf--two" cx="533" cy="436" r="48" />
      <circle className="center-garden__leaf center-garden__leaf--three" cx="594" cy="454" r="44" />
      <circle className="center-garden__leaf center-garden__leaf--four" cx="638" cy="490" r="37" />
      <circle className="center-garden__leaf center-garden__leaf--five" cx="500" cy="504" r="35" />
      <circle className="center-garden__moon" cx="606" cy="604" r="22" />
    </g>
  );
}

function ClassicCenter() {
  return <polygon className="center-goal" points="550,470 630,550 550,630 470,550" />;
}

function BaseYard({ state, color }: { state: GameStateSnapshot; color: PlayerColor }) {
  const points = getBoardConfigForMode(state.gameMode).baseCoords[color];
  const visual = getVisualColorForSeat(state, color);
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
        fill={visual.soft}
        stroke={visual.hex}
      />
      {points.map((point, index) => (
        <circle
          key={`${color}-base-${index}`}
          className="base-slot"
          cx={toSvgCoord(point.x)}
          cy={toSvgCoord(point.y)}
          r="34"
          fill="#ffffff"
          stroke={visual.hex}
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

  if (isHomePosition(targetPosition, state.gameMode)) {
    const board = getBoardConfigForMode(state.gameMode);
    return board.homeCoords[activePlayer.color][targetPosition - board.trackLength];
  }

  const absoluteTrackIndex = getAbsoluteTrackIndex(activePlayer.color, targetPosition, state.gameMode);
  const board = getBoardConfigForMode(state.gameMode);
  return absoluteTrackIndex === null ? null : board.trackCoords[absoluteTrackIndex];
}

function getPointForPiece(piece: PieceState, mode = "party" as GameStateSnapshot["gameMode"]) {
  return getPointForPieceAtPosition(piece, piece.position, mode);
}

function getPointForPieceAtPosition(piece: PieceState, position: number, mode = "party" as GameStateSnapshot["gameMode"]) {
  const board = getBoardConfigForMode(mode);
  if (position === BASE_POSITION) {
    return board.baseCoords[piece.color][piece.index];
  }

  if (isHomePosition(position, mode)) {
    return board.homeCoords[piece.color][position - board.trackLength];
  }

  if (isTrackPosition(position, mode)) {
    const absoluteTrackIndex = getAbsoluteTrackIndex(piece.color, position, mode);
    return absoluteTrackIndex === null ? null : board.trackCoords[absoluteTrackIndex];
  }

  return null;
}

function getAnimatedPointForPiece(
  piece: PieceState,
  animation: PieceMoveAnimation | null,
  now: number,
  mode: GameStateSnapshot["gameMode"],
) {
  if (!animation || animation.pieceId !== piece.id || animation.durationMs <= 0) {
    return null;
  }

  const elapsed = now - animation.startedAt;
  if (elapsed < 0 || elapsed >= animation.durationMs) {
    return null;
  }

  const path = getPositionPath(animation.from, animation.to);
  if (path.length < 2) {
    return null;
  }

  const progress = Math.min(0.999, Math.max(0, elapsed / animation.durationMs));
  const segmentProgress = progress * (path.length - 1);
  const fromIndex = Math.floor(segmentProgress);
  const toIndex = Math.min(path.length - 1, fromIndex + 1);
  const localProgress = segmentProgress - fromIndex;
  const fromPoint = getPointForPieceAtPosition(piece, path[fromIndex], mode);
  const toPoint = getPointForPieceAtPosition(piece, path[toIndex], mode);

  if (!fromPoint || !toPoint) {
    return null;
  }

  const eased = easeInOut(localProgress);
  return {
    x: fromPoint.x + (toPoint.x - fromPoint.x) * eased,
    y: fromPoint.y + (toPoint.y - fromPoint.y) * eased,
  };
}

function getPositionPath(from: number, to: number): number[] {
  if (from === to) {
    return [to];
  }

  if (from === BASE_POSITION) {
    return [BASE_POSITION, 0, ...rangePositions(1, to)];
  }

  return rangePositions(from, to);
}

function rangePositions(from: number, to: number): number[] {
  const direction = to >= from ? 1 : -1;
  const positions: number[] = [];
  for (let position = from; direction > 0 ? position <= to : position >= to; position += direction) {
    positions.push(position);
  }
  return positions;
}

function easeInOut(value: number): number {
  return value < 0.5 ? 2 * value * value : 1 - ((-2 * value + 2) ** 2) / 2;
}

function getStartColor(state: GameStateSnapshot, trackIndex: number): PlayerColor | undefined {
  const board = getBoardConfigForMode(state.gameMode);
  return board.playerColors.find((color) => board.startIndex[color] === trackIndex);
}

function getVisualColorForSeat(state: GameStateSnapshot, color: PlayerColor) {
  const player = state.players.find((entry) => entry.color === color);
  const hex = normalizeHexColor(player?.customColor, COLOR_META[color].hex);
  return {
    hex,
    dark: mixHex(hex, "#101411", 0.42),
    soft: mixHex(hex, "#ffffff", 0.78),
  };
}

function normalizeHexColor(value: unknown, fallback: string): string {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : fallback;
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
