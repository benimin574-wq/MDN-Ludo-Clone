var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { ArraySchema, Schema, type } from "@colyseus/schema";
export class PieceModel extends Schema {
    constructor() {
        super(...arguments);
        this.id = "";
        this.color = "";
        this.index = 0;
        this.position = -1;
    }
}
__decorate([
    type("string")
], PieceModel.prototype, "id", void 0);
__decorate([
    type("string")
], PieceModel.prototype, "color", void 0);
__decorate([
    type("number")
], PieceModel.prototype, "index", void 0);
__decorate([
    type("number")
], PieceModel.prototype, "position", void 0);
export class PlayerModel extends Schema {
    constructor() {
        super(...arguments);
        this.id = "";
        this.name = "";
        this.color = "";
        this.customColor = "";
        this.ready = false;
        this.connected = true;
        this.isBot = false;
        this.pieces = new ArraySchema();
    }
}
__decorate([
    type("string")
], PlayerModel.prototype, "id", void 0);
__decorate([
    type("string")
], PlayerModel.prototype, "name", void 0);
__decorate([
    type("string")
], PlayerModel.prototype, "color", void 0);
__decorate([
    type("string")
], PlayerModel.prototype, "customColor", void 0);
__decorate([
    type("boolean")
], PlayerModel.prototype, "ready", void 0);
__decorate([
    type("boolean")
], PlayerModel.prototype, "connected", void 0);
__decorate([
    type("boolean")
], PlayerModel.prototype, "isBot", void 0);
__decorate([
    type([PieceModel])
], PlayerModel.prototype, "pieces", void 0);
export class ChatMessageModel extends Schema {
    constructor() {
        super(...arguments);
        this.id = "";
        this.playerName = "";
        this.color = "";
        this.text = "";
        this.createdAt = 0;
    }
}
__decorate([
    type("string")
], ChatMessageModel.prototype, "id", void 0);
__decorate([
    type("string")
], ChatMessageModel.prototype, "playerName", void 0);
__decorate([
    type("string")
], ChatMessageModel.prototype, "color", void 0);
__decorate([
    type("string")
], ChatMessageModel.prototype, "text", void 0);
__decorate([
    type("number")
], ChatMessageModel.prototype, "createdAt", void 0);
export class SettingsModel extends Schema {
    constructor() {
        super(...arguments);
        this.strikeRequired = false;
        this.chatFilterEnabled = true;
        this.turnTimeLimitMs = 20_000;
    }
}
__decorate([
    type("boolean")
], SettingsModel.prototype, "strikeRequired", void 0);
__decorate([
    type("boolean")
], SettingsModel.prototype, "chatFilterEnabled", void 0);
__decorate([
    type("number")
], SettingsModel.prototype, "turnTimeLimitMs", void 0);
export class MoveOptionModel extends Schema {
    constructor() {
        super(...arguments);
        this.pieceId = "";
        this.from = -1;
        this.to = -1;
        this.captures = new ArraySchema();
    }
}
__decorate([
    type("string")
], MoveOptionModel.prototype, "pieceId", void 0);
__decorate([
    type("number")
], MoveOptionModel.prototype, "from", void 0);
__decorate([
    type("number")
], MoveOptionModel.prototype, "to", void 0);
__decorate([
    type(["string"])
], MoveOptionModel.prototype, "captures", void 0);
export class MenschState extends Schema {
    constructor() {
        super(...arguments);
        this.roomId = "";
        this.hostId = "";
        this.status = "lobby";
        this.players = new ArraySchema();
        this.currentPlayerIndex = 0;
        this.diceValue = 0;
        this.diceRolled = false;
        this.rollAttempts = 0;
        this.legalMoves = new ArraySchema();
        this.winnerColor = "";
        this.lastEvent = "";
        this.turnStartedAt = 0;
        this.turnDeadlineAt = 0;
        this.settings = new SettingsModel();
        this.chat = new ArraySchema();
        this.updatedAt = 0;
    }
}
__decorate([
    type("string")
], MenschState.prototype, "roomId", void 0);
__decorate([
    type("string")
], MenschState.prototype, "hostId", void 0);
__decorate([
    type("string")
], MenschState.prototype, "status", void 0);
__decorate([
    type([PlayerModel])
], MenschState.prototype, "players", void 0);
__decorate([
    type("number")
], MenschState.prototype, "currentPlayerIndex", void 0);
__decorate([
    type("number")
], MenschState.prototype, "diceValue", void 0);
__decorate([
    type("boolean")
], MenschState.prototype, "diceRolled", void 0);
__decorate([
    type("number")
], MenschState.prototype, "rollAttempts", void 0);
__decorate([
    type([MoveOptionModel])
], MenschState.prototype, "legalMoves", void 0);
__decorate([
    type("string")
], MenschState.prototype, "winnerColor", void 0);
__decorate([
    type("string")
], MenschState.prototype, "lastEvent", void 0);
__decorate([
    type("number")
], MenschState.prototype, "turnStartedAt", void 0);
__decorate([
    type("number")
], MenschState.prototype, "turnDeadlineAt", void 0);
__decorate([
    type(SettingsModel)
], MenschState.prototype, "settings", void 0);
__decorate([
    type([ChatMessageModel])
], MenschState.prototype, "chat", void 0);
__decorate([
    type("number")
], MenschState.prototype, "updatedAt", void 0);
export function schemaToSnapshot(state) {
    return {
        roomId: state.roomId,
        hostId: state.hostId,
        status: state.status,
        players: state.players.map((player) => ({
            id: player.id,
            name: player.name,
            color: player.color,
            customColor: player.customColor,
            ready: player.ready,
            connected: player.connected,
            isBot: player.isBot,
            pieces: player.pieces.map((piece) => ({
                id: piece.id,
                color: piece.color,
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
        winnerColor: state.winnerColor,
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
            color: message.color,
            text: message.text,
            createdAt: message.createdAt,
        })),
        updatedAt: state.updatedAt,
    };
}
export function snapshotToSchema(snapshot, state) {
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
    replaceArray(state.players, snapshot.players.map((player) => {
        const model = new PlayerModel();
        model.id = player.id;
        model.name = player.name;
        model.color = player.color;
        model.customColor = player.customColor;
        model.ready = player.ready;
        model.connected = player.connected;
        model.isBot = player.isBot;
        replaceArray(model.pieces, player.pieces.map((piece) => {
            const pieceModel = new PieceModel();
            pieceModel.id = piece.id;
            pieceModel.color = piece.color;
            pieceModel.index = piece.index;
            pieceModel.position = piece.position;
            return pieceModel;
        }));
        return model;
    }));
    replaceArray(state.legalMoves, snapshot.legalMoves.map((move) => {
        const model = new MoveOptionModel();
        model.pieceId = move.pieceId;
        model.from = move.from;
        model.to = move.to;
        replaceArray(model.captures, move.captures);
        return model;
    }));
    replaceArray(state.chat, snapshot.chat.map((message) => {
        const model = new ChatMessageModel();
        model.id = message.id;
        model.playerName = message.playerName;
        model.color = message.color;
        model.text = message.text;
        model.createdAt = message.createdAt;
        return model;
    }));
}
function replaceArray(target, values) {
    target.splice(0, target.length);
    for (const value of values) {
        target.push(value);
    }
}
