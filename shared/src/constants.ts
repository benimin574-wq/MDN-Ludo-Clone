import type { BoardPoint, GameMode, PlayerColor } from "./types";

export const PIECES_PER_PLAYER = 4;
export const HOME_LENGTH = 4;
export const DEFAULT_TURN_TIME_LIMIT_MS = 20_000;
export const MIN_TURN_TIME_LIMIT_MS = 10_000;
export const MAX_TURN_TIME_LIMIT_MS = 120_000;
export const TURN_TIME_LIMIT_MS = DEFAULT_TURN_TIME_LIMIT_MS;

export const PLAYER_COLORS: PlayerColor[] = ["red", "pink", "violet", "blue", "teal", "green", "yellow", "orange"];
export const CLASSIC_PLAYER_COLORS: PlayerColor[] = ["red", "blue", "green", "yellow"];
export const PARTY_PLAYER_COLORS: PlayerColor[] = PLAYER_COLORS;
export const CLOCKWISE_COLORS: PlayerColor[] = PARTY_PLAYER_COLORS;

export const COLOR_META: Record<
  PlayerColor,
  { label: string; hex: string; dark: string; soft: string }
> = {
  red: { label: "Rot", hex: "#d92f2f", dark: "#8f1515", soft: "#ffe0df" },
  pink: { label: "Pink", hex: "#e8559f", dark: "#9d1f60", soft: "#ffe1f0" },
  violet: { label: "Violett", hex: "#7f55d9", dark: "#45258f", soft: "#eadfff" },
  blue: { label: "Blau", hex: "#2357d9", dark: "#0e2f8f", soft: "#dce7ff" },
  teal: { label: "Türkis", hex: "#139d9a", dark: "#075d5a", soft: "#d8f4f2" },
  green: { label: "Grün", hex: "#20a35b", dark: "#0d6636", soft: "#d8f3e3" },
  yellow: { label: "Gelb", hex: "#f7d23a", dark: "#9a7700", soft: "#fff4bf" },
  orange: { label: "Orange", hex: "#f07b24", dark: "#96420c", soft: "#ffe7d2" },
};

export interface BoardConfig {
  id: "classic" | "party";
  trackLength: number;
  homeLength: number;
  finalPosition: number;
  playerColors: PlayerColor[];
  clockwiseColors: PlayerColor[];
  startIndex: Record<PlayerColor, number>;
  trackCoords: BoardPoint[];
  homeCoords: Record<PlayerColor, BoardPoint[]>;
  baseCoords: Record<PlayerColor, BoardPoint[]>;
}

const CLASSIC_TRACK_LENGTH = 40;
const PARTY_TRACK_LENGTH = 64;

const CLASSIC_START_INDEX: Record<PlayerColor, number> = {
  red: 0,
  pink: 0,
  violet: 0,
  blue: 10,
  teal: 0,
  green: 20,
  yellow: 30,
  orange: 0,
};

const PARTY_START_INDEX: Record<PlayerColor, number> = {
  red: 0,
  pink: 8,
  violet: 16,
  blue: 24,
  teal: 32,
  green: 40,
  yellow: 48,
  orange: 56,
};

const CLASSIC_TRACK_COORDS: BoardPoint[] = [
  { x: 4, y: 10 },
  { x: 4, y: 9 },
  { x: 4, y: 8 },
  { x: 4, y: 7 },
  { x: 4, y: 6 },
  { x: 3, y: 6 },
  { x: 2, y: 6 },
  { x: 1, y: 6 },
  { x: 0, y: 6 },
  { x: 0, y: 5 },
  { x: 0, y: 4 },
  { x: 1, y: 4 },
  { x: 2, y: 4 },
  { x: 3, y: 4 },
  { x: 4, y: 4 },
  { x: 4, y: 3 },
  { x: 4, y: 2 },
  { x: 4, y: 1 },
  { x: 4, y: 0 },
  { x: 5, y: 0 },
  { x: 6, y: 0 },
  { x: 6, y: 1 },
  { x: 6, y: 2 },
  { x: 6, y: 3 },
  { x: 6, y: 4 },
  { x: 7, y: 4 },
  { x: 8, y: 4 },
  { x: 9, y: 4 },
  { x: 10, y: 4 },
  { x: 10, y: 5 },
  { x: 10, y: 6 },
  { x: 9, y: 6 },
  { x: 8, y: 6 },
  { x: 7, y: 6 },
  { x: 6, y: 6 },
  { x: 6, y: 7 },
  { x: 6, y: 8 },
  { x: 6, y: 9 },
  { x: 6, y: 10 },
  { x: 5, y: 10 },
];

const CLASSIC_HOME_COORDS: Record<PlayerColor, BoardPoint[]> = {
  red: [
    { x: 5, y: 9 },
    { x: 5, y: 8 },
    { x: 5, y: 7 },
    { x: 5, y: 6 },
  ],
  pink: [],
  violet: [],
  blue: [
    { x: 1, y: 5 },
    { x: 2, y: 5 },
    { x: 3, y: 5 },
    { x: 4, y: 5 },
  ],
  teal: [],
  green: [
    { x: 5, y: 1 },
    { x: 5, y: 2 },
    { x: 5, y: 3 },
    { x: 5, y: 4 },
  ],
  yellow: [
    { x: 9, y: 5 },
    { x: 8, y: 5 },
    { x: 7, y: 5 },
    { x: 6, y: 5 },
  ],
  orange: [],
};

const CLASSIC_BASE_COORDS: Record<PlayerColor, BoardPoint[]> = {
  blue: [
    { x: 1, y: 1 },
    { x: 2, y: 1 },
    { x: 1, y: 2 },
    { x: 2, y: 2 },
  ],
  pink: [],
  violet: [],
  teal: [],
  green: [
    { x: 8, y: 1 },
    { x: 9, y: 1 },
    { x: 8, y: 2 },
    { x: 9, y: 2 },
  ],
  yellow: [
    { x: 8, y: 8 },
    { x: 9, y: 8 },
    { x: 8, y: 9 },
    { x: 9, y: 9 },
  ],
  orange: [],
  red: [
    { x: 1, y: 8 },
    { x: 2, y: 8 },
    { x: 1, y: 9 },
    { x: 2, y: 9 },
  ],
};

const PARTY_CENTER: BoardPoint = { x: 5, y: 5 };
const PARTY_TRACK_RADIUS = 4.25;
const PARTY_HOME_STEP = 0.62;
const PARTY_BASE_RADIUS = 4.85;
const PARTY_BASE_SPREAD = 0.3;

export const BOARD_CONFIGS: Record<BoardConfig["id"], BoardConfig> = {
  classic: {
    id: "classic",
    trackLength: CLASSIC_TRACK_LENGTH,
    homeLength: HOME_LENGTH,
    finalPosition: CLASSIC_TRACK_LENGTH + HOME_LENGTH - 1,
    playerColors: CLASSIC_PLAYER_COLORS,
    clockwiseColors: CLASSIC_PLAYER_COLORS,
    startIndex: CLASSIC_START_INDEX,
    trackCoords: CLASSIC_TRACK_COORDS,
    homeCoords: CLASSIC_HOME_COORDS,
    baseCoords: CLASSIC_BASE_COORDS,
  },
  party: {
    id: "party",
    trackLength: PARTY_TRACK_LENGTH,
    homeLength: HOME_LENGTH,
    finalPosition: PARTY_TRACK_LENGTH + HOME_LENGTH - 1,
    playerColors: PARTY_PLAYER_COLORS,
    clockwiseColors: PARTY_PLAYER_COLORS,
    startIndex: PARTY_START_INDEX,
    trackCoords: Array.from({ length: PARTY_TRACK_LENGTH }, (_, index) =>
      radialPoint(indexToAngle(index, PARTY_TRACK_LENGTH), PARTY_TRACK_RADIUS),
    ),
    homeCoords: buildPartyHomeCoords(),
    baseCoords: buildPartyBaseCoords(),
  },
};

export const TRACK_LENGTH = BOARD_CONFIGS.party.trackLength;
export const FINAL_POSITION = BOARD_CONFIGS.party.finalPosition;
export const START_INDEX = BOARD_CONFIGS.party.startIndex;
export const TRACK_COORDS = BOARD_CONFIGS.party.trackCoords;
export const HOME_COORDS = BOARD_CONFIGS.party.homeCoords;
export const BASE_COORDS = BOARD_CONFIGS.party.baseCoords;

export function getBoardConfigForMode(mode: GameMode | undefined): BoardConfig {
  return mode === "party" ? BOARD_CONFIGS.party : BOARD_CONFIGS.classic;
}

export function getPlayerColorsForMode(mode: GameMode | undefined): PlayerColor[] {
  return getBoardConfigForMode(mode).playerColors;
}

export function getDefaultBotCountForMode(mode: GameMode | undefined): number {
  return mode === "singleplayer" ? 3 : 0;
}

export function getMaxPlayersForMode(mode: GameMode | undefined): number {
  return getPlayerColorsForMode(mode).length;
}

function buildPartyHomeCoords(): Record<PlayerColor, BoardPoint[]> {
  return Object.fromEntries(
    PARTY_PLAYER_COLORS.map((color) => {
      const angle = indexToAngle(PARTY_START_INDEX[color], PARTY_TRACK_LENGTH);
      const points = Array.from({ length: HOME_LENGTH }, (_, index) =>
        radialPoint(angle, PARTY_TRACK_RADIUS - PARTY_HOME_STEP * (index + 1)),
      );
      return [color, points];
    }),
  ) as Record<PlayerColor, BoardPoint[]>;
}

function buildPartyBaseCoords(): Record<PlayerColor, BoardPoint[]> {
  return Object.fromEntries(
    PARTY_PLAYER_COLORS.map((color) => {
      const angle = indexToAngle(PARTY_START_INDEX[color], PARTY_TRACK_LENGTH);
      const center = radialPoint(angle, PARTY_BASE_RADIUS);
      const tangent = angle + Math.PI / 2;
      const radial = angle;

      return [
        color,
        [
          offsetPoint(center, tangent, -PARTY_BASE_SPREAD, radial, -PARTY_BASE_SPREAD),
          offsetPoint(center, tangent, PARTY_BASE_SPREAD, radial, -PARTY_BASE_SPREAD),
          offsetPoint(center, tangent, -PARTY_BASE_SPREAD, radial, PARTY_BASE_SPREAD),
          offsetPoint(center, tangent, PARTY_BASE_SPREAD, radial, PARTY_BASE_SPREAD),
        ],
      ];
    }),
  ) as Record<PlayerColor, BoardPoint[]>;
}

function indexToAngle(index: number, trackLength: number): number {
  return Math.PI / 2 + (index / trackLength) * Math.PI * 2;
}

function radialPoint(angle: number, radius: number): BoardPoint {
  return {
    x: roundCoord(PARTY_CENTER.x + Math.cos(angle) * radius),
    y: roundCoord(PARTY_CENTER.y + Math.sin(angle) * radius),
  };
}

function offsetPoint(center: BoardPoint, angleA: number, amountA: number, angleB: number, amountB: number): BoardPoint {
  return {
    x: roundCoord(center.x + Math.cos(angleA) * amountA + Math.cos(angleB) * amountB),
    y: roundCoord(center.y + Math.sin(angleA) * amountA + Math.sin(angleB) * amountB),
  };
}

function roundCoord(value: number): number {
  return Math.round(value * 1000) / 1000;
}
