export type PlayerColor = "blue" | "yellow" | "green" | "red";

export type GameStatus = "lobby" | "playing" | "finished";

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
