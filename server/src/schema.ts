import { ArraySchema, Schema, type } from "@colyseus/schema";
import type { ChatMessage, GameStateSnapshot, MoveOption, PieceState, PlayerState } from "../../shared/src/types";

export class PieceModel extends Schema {
  @type("string") id = "";
  @type("string") color = "";
  @type("number") index = 0;
  @type("number") position = -1;
}

export class PlayerModel extends Schema {
  @type("string") id = "";
  @type("string") name = "";
  @type("string") color = "";
  @type("string") customColor = "";
  @type("boolean") ready = false;
  @type("boolean") connected = true;
  @type("boolean") isBot = false;
  @type([PieceModel]) pieces = new ArraySchema<PieceModel>();
}

export class ChatMessageModel extends Schema {
  @type("string") id = "";
  @type("string") playerName = "";
  @type("string") color = "";
  @type("string") text = "";
  @type("number") createdAt = 0;
}

export class SettingsModel extends Schema {
  @type("boolean") strikeRequired = false;
  @type("boolean") chatFilterEnabled = true;
  @type("number") turnTimeLimitMs = 20_000;
}

export class MoveOptionModel extends Schema {
  @type("string") pieceId = "";
  @type("number") from = -1;
  @type("number") to = -1;
  @type(["string"]) captures = new ArraySchema<string>();
}

export class MenschState extends Schema {
  @type("string") roomId = "";
  @type("string") hostId = "";
  @type("string") status = "lobby";
  @type([PlayerModel]) players = new ArraySchema<PlayerModel>();
  @type("number") currentPlayerIndex = 0;
  @type("number") diceValue = 0;
  @type("boolean") diceRolled = false;
  @type("number") rollAttempts = 0;
  @type([MoveOptionModel]) legalMoves = new ArraySchema<MoveOptionModel>();
  @type("string") winnerColor = "";
  @type("string") lastEvent = "";
  @type("number") turnStartedAt = 0;
  @type("number") turnDeadlineAt = 0;
  @type(SettingsModel) settings = new SettingsModel();
  @type([ChatMessageModel]) chat = new ArraySchema<ChatMessageModel>();
  @type("number") updatedAt = 0;
}

export function schemaToSnapshot(state: MenschState): GameStateSnapshot {
  return {
    roomId: state.roomId,
    hostId: state.hostId,
    status: state.status as GameStateSnapshot["status"],
    players: state.players.map((player) => ({
      id: player.id,
      name: player.name,
      color: player.color as PlayerState["color"],
      customColor: player.customColor,
      ready: player.ready,
      connected: player.connected,
      isBot: player.isBot,
      pieces: player.pieces.map((piece) => ({
        id: piece.id,
        color: piece.color as PieceState["color"],
        index: piece.index,
        position: piece.position,
      })),
    })),
    currentPlayerIndex: state.currentPlayerIndex,
    diceValue: state.diceValue,
    diceRolled: state.diceRolled,
    rollAttempts: state.rollAttempts,
    legalMoves: state.legalMoves.map((move) => ({
      pieceId: move.pieceId,
      from: move.from,
      to: move.to,
      captures: [...move.captures],
    })),
    winnerColor: state.winnerColor as GameStateSnapshot["winnerColor"],
    lastEvent: state.lastEvent,
    turnStartedAt: state.turnStartedAt,
    turnDeadlineAt: state.turnDeadlineAt,
    settings: {
      strikeRequired: state.settings.strikeRequired,
      chatFilterEnabled: state.settings.chatFilterEnabled,
      turnTimeLimitMs: state.settings.turnTimeLimitMs,
    },
    chat: state.chat.map((message) => ({
      id: message.id,
      playerName: message.playerName,
      color: message.color as ChatMessage["color"],
      text: message.text,
      createdAt: message.createdAt,
    })),
    updatedAt: state.updatedAt,
  };
}

export function snapshotToSchema(snapshot: GameStateSnapshot, state: MenschState): void {
  state.roomId = snapshot.roomId;
  state.hostId = snapshot.hostId;
  state.status = snapshot.status;
  state.currentPlayerIndex = snapshot.currentPlayerIndex;
  state.diceValue = snapshot.diceValue;
  state.diceRolled = snapshot.diceRolled;
  state.rollAttempts = snapshot.rollAttempts;
  state.winnerColor = snapshot.winnerColor;
  state.lastEvent = snapshot.lastEvent;
  state.turnStartedAt = snapshot.turnStartedAt;
  state.turnDeadlineAt = snapshot.turnDeadlineAt;
  state.settings.strikeRequired = snapshot.settings.strikeRequired;
  state.settings.chatFilterEnabled = snapshot.settings.chatFilterEnabled;
  state.settings.turnTimeLimitMs = snapshot.settings.turnTimeLimitMs;
  state.updatedAt = snapshot.updatedAt;

  replaceArray(
    state.players,
    snapshot.players.map((player) => {
      const model = new PlayerModel();
      model.id = player.id;
      model.name = player.name;
      model.color = player.color;
      model.customColor = player.customColor;
      model.ready = player.ready;
      model.connected = player.connected;
      model.isBot = player.isBot;
      replaceArray(
        model.pieces,
        player.pieces.map((piece) => {
          const pieceModel = new PieceModel();
          pieceModel.id = piece.id;
          pieceModel.color = piece.color;
          pieceModel.index = piece.index;
          pieceModel.position = piece.position;
          return pieceModel;
        }),
      );
      return model;
    }),
  );

  replaceArray(
    state.legalMoves,
    snapshot.legalMoves.map((move) => {
      const model = new MoveOptionModel();
      model.pieceId = move.pieceId;
      model.from = move.from;
      model.to = move.to;
      replaceArray(model.captures, move.captures);
      return model;
    }),
  );

  replaceArray(
    state.chat,
    snapshot.chat.map((message) => {
      const model = new ChatMessageModel();
      model.id = message.id;
      model.playerName = message.playerName;
      model.color = message.color;
      model.text = message.text;
      model.createdAt = message.createdAt;
      return model;
    }),
  );
}

function replaceArray<T>(target: ArraySchema<T>, values: T[]): void {
  target.splice(0, target.length);
  for (const value of values) {
    target.push(value);
  }
}
