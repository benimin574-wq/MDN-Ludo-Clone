export const PIECES_PER_PLAYER = 4;
export const TRACK_LENGTH = 40;
export const HOME_LENGTH = 4;
export const FINAL_POSITION = TRACK_LENGTH + HOME_LENGTH - 1;
export const DEFAULT_TURN_TIME_LIMIT_MS = 20_000;
export const MIN_TURN_TIME_LIMIT_MS = 10_000;
export const MAX_TURN_TIME_LIMIT_MS = 120_000;
export const TURN_TIME_LIMIT_MS = DEFAULT_TURN_TIME_LIMIT_MS;
export const PLAYER_COLORS = ["blue", "yellow", "green", "red"];
export const CLOCKWISE_COLORS = ["red", "blue", "green", "yellow"];
export const COLOR_META = {
    blue: { label: "Blau", hex: "#2357d9", dark: "#0e2f8f", soft: "#dce7ff" },
    yellow: { label: "Gelb", hex: "#f7d23a", dark: "#9a7700", soft: "#fff4bf" },
    green: { label: "Grün", hex: "#20a35b", dark: "#0d6636", soft: "#d8f3e3" },
    red: { label: "Rot", hex: "#d92f2f", dark: "#8f1515", soft: "#ffe0df" },
};
export const START_INDEX = {
    red: 0,
    blue: 10,
    green: 20,
    yellow: 30,
};
export const TRACK_COORDS = [
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
export const HOME_COORDS = {
    red: [
        { x: 5, y: 9 },
        { x: 5, y: 8 },
        { x: 5, y: 7 },
        { x: 5, y: 6 },
    ],
    blue: [
        { x: 1, y: 5 },
        { x: 2, y: 5 },
        { x: 3, y: 5 },
        { x: 4, y: 5 },
    ],
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
};
export const BASE_COORDS = {
    blue: [
        { x: 1, y: 1 },
        { x: 2, y: 1 },
        { x: 1, y: 2 },
        { x: 2, y: 2 },
    ],
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
    red: [
        { x: 1, y: 8 },
        { x: 2, y: 8 },
        { x: 1, y: 9 },
        { x: 2, y: 9 },
    ],
};
