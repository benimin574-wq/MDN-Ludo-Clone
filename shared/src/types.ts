export type PlayerColor = "red" | "pink" | "violet" | "blue" | "teal" | "green" | "yellow" | "orange";

export type GameStatus = "lobby" | "playing" | "finished";
export type GameMode = "singleplayer" | "multiplayer" | "party";

export const BASE_POSITION = -1;

export interface PieceState {
  id: string;
  color: PlayerColor;
  index: number;
  position: number;
}

export interface PlayerState {
  id: string;
  name: string;
  color: PlayerColor;
  customColor: string;
  ready: boolean;
  connected: boolean;
  isBot: boolean;
  pieces: PieceState[];
}

export interface ChatMessage {
  id: string;
  playerName: string;
  color: PlayerColor | "system";
  text: string;
  createdAt: number;
}

export interface GameSettings {
  strikeRequired: boolean;
  chatFilterEnabled: boolean;
  turnTimeLimitMs: number;
}

export interface MoveOption {
  pieceId: string;
  from: number;
  to: number;
  captures: string[];
}

export interface GameStateSnapshot {
  roomId: string;
  hostId: string;
  gameMode: GameMode;
  status: GameStatus;
  players: PlayerState[];
  currentPlayerIndex: number;
  diceValue: number;
  diceRolled: boolean;
  rollAttempts: number;
  legalMoves: MoveOption[];
  winnerColor: PlayerColor | "";
  lastEvent: string;
  turnStartedAt: number;
  turnDeadlineAt: number;
  settings: GameSettings;
  chat: ChatMessage[];
  updatedAt: number;
}

export interface BoardPoint {
  x: number;
  y: number;
}

export interface MoveResult {
  state: GameStateSnapshot;
  move?: MoveOption;
  error?: string;
}
