import { randomInt } from "node:crypto";
import { Room } from "@colyseus/core";
import { filterChatText, isReportTermInText, normalizeReportedFilterTerm } from "../../../shared/src/chatFilter";
import { COLOR_META, DEFAULT_TURN_TIME_LIMIT_MS, MAX_TURN_TIME_LIMIT_MS, MIN_TURN_TIME_LIMIT_MS, PLAYER_COLORS, } from "../../../shared/src/constants";
import { advanceToNextPlayer, applyMove, createInitialSnapshot, createPieces, getActivePlayer, getAvailableColors, getLegalMoves, resetForRematch, shouldKeepRollingAfterMiss, sortPlayersClockwise, } from "../../../shared/src/rules";
import { MenschState, schemaToSnapshot, snapshotToSchema } from "../schema";
const CHAT_WINDOW_MS = 8000;
const CHAT_MESSAGE_LIMIT = 5;
const BOT_STEP_DELAY_MS = 700;
const HUMAN_AUTO_STEP_DELAY_MS = 520;
const GLOBAL_REPORTED_FILTER_TERMS = new Set();
export class MenschRoom extends Room {
    constructor() {
        super(...arguments);
        this.hostId = "";
        this.playerTokens = new Map();
        this.tokenByPlayerId = new Map();
        this.kickedPlayerIds = new Set();
        this.chatStats = new Map();
        this.reportedFilterTerms = GLOBAL_REPORTED_FILTER_TERMS;
        this.automationTimeout = null;
        this.autoPlayPlayerId = "";
    }
    onCreate(options) {
        this.maxClients = 4;
        this.autoDispose = true;
        this.setState(new MenschState());
        const initialSnapshot = createInitialSnapshot(this.roomId, Boolean(options.strikeRequired));
        initialSnapshot.settings.turnTimeLimitMs = clampTurnTimeLimit(options.turnTimeLimitMs);
        snapshotToSchema(initialSnapshot, this.state);
        this.onMessage("toggleReady", (client, message) => {
            this.handleReady(client, Boolean(message.ready));
        });
        this.onMessage("setStrikeRequired", (client, message) => {
            this.handleStrikeRequired(client, Boolean(message.enabled));
        });
        this.onMessage("setChatFilter", (client, message) => {
            this.handleChatFilter(client, Boolean(message.enabled));
        });
        this.onMessage("setTurnTimeLimit", (client, message) => {
            this.handleTurnTimeLimit(client, message.turnTimeLimitMs);
        });
        this.onMessage("setCustomColor", (client, message) => {
            this.handleCustomColor(client, String(message.customColor || ""));
        });
        this.onMessage("startGame", (client) => {
            this.handleStartGame(client);
        });
        this.onMessage("kickPlayer", (client, message) => {
            this.handleKickPlayer(client, String(message.playerId || ""));
        });
        this.onMessage("rollDice", (client) => {
            this.handleRoll(client);
        });
        this.onMessage("movePiece", (client, message) => {
            this.handleMove(client, String(message.pieceId || ""));
        });
        this.onMessage("sendChat", (client, message) => {
            this.handleChat(client, String(message.text || ""));
        });
        this.onMessage("reportChatWord", (client, message) => {
            this.handleChatReport(client, message);
        });
        this.onMessage("requestRematch", (client) => {
            this.handleRematch(client);
        });
        this.onMessage("addBot", (client) => {
            this.handleAddBot(client);
        });
    }
    onJoin(client, options) {
        const snapshot = schemaToSnapshot(this.state);
        const reconnectToken = cleanToken(options.reconnectToken);
        if (reconnectToken && this.reconnectPlayer(client, snapshot, reconnectToken)) {
            snapshot.updatedAt = Date.now();
            snapshotToSchema(snapshot, this.state);
            this.sendSessionInfo(client, reconnectToken);
            this.scheduleTurnAutomation();
            return;
        }
        if (reconnectToken && snapshot.status !== "lobby") {
            throw new Error("Der gespeicherte Zugang passt nicht mehr zu dieser Partie.");
        }
        if (snapshot.status !== "lobby") {
            throw new Error("Dieses Spiel läuft bereits.");
        }
        if (snapshot.players.length >= 4) {
            throw new Error("Der Raum ist voll.");
        }
        const availableColors = getAvailableColors(snapshot.players);
        const requestedColor = isPlayerColor(options.color) ? options.color : undefined;
        const color = requestedColor && availableColors.includes(requestedColor) ? requestedColor : availableColors[0];
        if (!color) {
            throw new Error("Keine Farbe mehr frei.");
        }
        const playerName = cleanPlayerName(options.name) || `Spieler ${snapshot.players.length + 1}`;
        const player = {
            id: client.sessionId,
            name: playerName,
            color,
            customColor: cleanCustomColor(options.customColor, COLOR_META[color].hex),
            ready: false,
            connected: true,
            isBot: false,
            pieces: createPieces(color),
        };
        snapshot.players.push(player);
        if (!this.hostId) {
            this.hostId = client.sessionId;
            snapshot.hostId = client.sessionId;
        }
        const playerToken = createId("seat");
        this.playerTokens.set(playerToken, color);
        this.tokenByPlayerId.set(client.sessionId, playerToken);
        const requestedBots = Math.max(0, Math.min(3, Number(options.botCount || 0)));
        if (snapshot.players.length === 1 && requestedBots > 0) {
            this.addBotsToSnapshot(snapshot, requestedBots);
        }
        snapshot.players = sortPlayersClockwise(snapshot.players);
        snapshot.currentPlayerIndex = 0;
        snapshot.lastEvent = `${playerName} ist beigetreten.`;
        addSystemMessage(snapshot, `${playerName} ist dem Spiel beigetreten.`);
        snapshot.updatedAt = Date.now();
        snapshotToSchema(snapshot, this.state);
        this.sendSessionInfo(client, playerToken);
    }
    onLeave(client) {
        if (this.kickedPlayerIds.delete(client.sessionId)) {
            return;
        }
        let snapshot = schemaToSnapshot(this.state);
        const player = snapshot.players.find((entry) => entry.id === client.sessionId);
        if (!player) {
            return;
        }
        if (snapshot.status === "lobby") {
            player.connected = false;
            player.ready = false;
            snapshot.lastEvent = `${player.name} hat die Lobby verlassen und kann wieder beitreten.`;
            addSystemMessage(snapshot, snapshot.lastEvent);
        }
        else {
            player.connected = false;
            snapshot.lastEvent = `${player.name} ist disconnected.`;
            addSystemMessage(snapshot, `${player.name} ist disconnected.`);
            const active = getActivePlayer(snapshot);
            if (active?.id === client.sessionId && snapshot.status === "playing") {
                snapshot = advanceToNextPlayer(snapshot);
                this.startTurnWindow(snapshot);
                const nextPlayer = getActivePlayer(snapshot);
                snapshot.lastEvent = `${player.name} ist disconnected. ${nextPlayer?.name || "Niemand"} ist dran.`;
            }
        }
        snapshot.updatedAt = Date.now();
        snapshotToSchema(snapshot, this.state);
        this.scheduleTurnAutomation();
    }
    onDispose() {
        this.clearAutomationTimeout();
    }
    handleReady(client, ready) {
        const snapshot = schemaToSnapshot(this.state);
        if (snapshot.status !== "lobby") {
            this.sendError(client, "Bereit kann nur in der Lobby gesetzt werden.");
            return;
        }
        const player = snapshot.players.find((entry) => entry.id === client.sessionId);
        if (!player) {
            this.sendError(client, "Spieler nicht gefunden.");
            return;
        }
        player.ready = ready;
        snapshot.lastEvent = `${player.name} ist ${ready ? "bereit" : "nicht bereit"}.`;
        snapshot.updatedAt = Date.now();
        snapshotToSchema(snapshot, this.state);
    }
    handleStrikeRequired(client, enabled) {
        const snapshot = schemaToSnapshot(this.state);
        if (snapshot.status !== "lobby") {
            this.sendError(client, "Schlagzwang kann nur in der Lobby geändert werden.");
            return;
        }
        if (!this.isHost(client, snapshot)) {
            this.sendError(client, "Nur der Host kann diese Einstellung ändern.");
            return;
        }
        snapshot.settings.strikeRequired = enabled;
        snapshot.lastEvent = `Schlagzwang ist ${enabled ? "aktiv" : "inaktiv"}.`;
        addSystemMessage(snapshot, snapshot.lastEvent);
        snapshot.updatedAt = Date.now();
        snapshotToSchema(snapshot, this.state);
    }
    handleChatFilter(client, enabled) {
        const snapshot = schemaToSnapshot(this.state);
        if (snapshot.status !== "lobby") {
            this.sendError(client, "Der Chat-Filter kann nur in der Lobby geändert werden.");
            return;
        }
        if (!this.isHost(client, snapshot)) {
            this.sendError(client, "Nur der Host kann diese Einstellung ändern.");
            return;
        }
        snapshot.settings.chatFilterEnabled = enabled;
        snapshot.lastEvent = `Chat-Filter ist ${enabled ? "aktiv" : "inaktiv"}.`;
        addSystemMessage(snapshot, snapshot.lastEvent);
        snapshot.updatedAt = Date.now();
        snapshotToSchema(snapshot, this.state);
    }
    handleTurnTimeLimit(client, rawTurnTimeLimitMs) {
        const snapshot = schemaToSnapshot(this.state);
        if (snapshot.status !== "lobby") {
            this.sendError(client, "Die Zugzeit kann nur in der Lobby geändert werden.");
            return;
        }
        if (!this.isHost(client, snapshot)) {
            this.sendError(client, "Nur der Host kann die Zugzeit ändern.");
            return;
        }
        const turnTimeLimitMs = clampTurnTimeLimit(rawTurnTimeLimitMs);
        snapshot.settings.turnTimeLimitMs = turnTimeLimitMs;
        snapshot.lastEvent = `Zugzeit auf ${Math.round(turnTimeLimitMs / 1000)} Sekunden gesetzt.`;
        addSystemMessage(snapshot, snapshot.lastEvent);
        snapshot.updatedAt = Date.now();
        snapshotToSchema(snapshot, this.state);
    }
    handleCustomColor(client, rawCustomColor) {
        const snapshot = schemaToSnapshot(this.state);
        if (snapshot.status !== "lobby") {
            this.sendError(client, "Die Spielerfarbe kann nur in der Lobby geändert werden.");
            return;
        }
        const player = snapshot.players.find((entry) => entry.id === client.sessionId);
        if (!player || player.isBot) {
            this.sendError(client, "Spieler nicht gefunden.");
            return;
        }
        player.customColor = cleanCustomColor(rawCustomColor, COLOR_META[player.color].hex);
        player.ready = false;
        snapshot.lastEvent = `${player.name} hat die Spielerfarbe angepasst.`;
        snapshot.updatedAt = Date.now();
        snapshotToSchema(snapshot, this.state);
    }
    handleStartGame(client) {
        const snapshot = schemaToSnapshot(this.state);
        if (snapshot.status !== "lobby") {
            this.sendError(client, "Das Spiel läuft bereits.");
            return;
        }
        if (!this.isHost(client, snapshot)) {
            this.sendError(client, "Nur der Host kann das Spiel starten.");
            return;
        }
        const blocker = getStartBlocker(snapshot);
        if (blocker) {
            this.sendError(client, blocker);
            return;
        }
        this.startGame(snapshot);
    }
    handleKickPlayer(client, targetPlayerId) {
        const snapshot = schemaToSnapshot(this.state);
        if (snapshot.status !== "lobby") {
            this.sendError(client, "Spieler können nur in der Lobby entfernt werden.");
            return;
        }
        if (!this.isHost(client, snapshot)) {
            this.sendError(client, "Nur der Host kann Spieler entfernen.");
            return;
        }
        const target = snapshot.players.find((player) => player.id === targetPlayerId);
        if (!target) {
            this.sendError(client, "Spieler nicht gefunden.");
            return;
        }
        if (target.id === snapshot.hostId || target.id === client.sessionId) {
            this.sendError(client, "Der Host kann nicht entfernt werden.");
            return;
        }
        this.removePlayerFromLobby(snapshot, target, `${target.name} wurde vom Host entfernt.`);
        snapshotToSchema(snapshot, this.state);
    }
    handleRoll(client) {
        const snapshot = schemaToSnapshot(this.state);
        const activePlayer = getActivePlayer(snapshot);
        if (!activePlayer || activePlayer.id !== client.sessionId || activePlayer.isBot) {
            this.sendError(client, "Du bist gerade nicht am Zug.");
            return;
        }
        this.cancelAutoPlayFor(client.sessionId);
        this.rollForActivePlayer();
    }
    handleMove(client, pieceId) {
        const snapshot = schemaToSnapshot(this.state);
        const activePlayer = getActivePlayer(snapshot);
        if (!activePlayer || activePlayer.id !== client.sessionId || activePlayer.isBot) {
            this.sendError(client, "Du bist gerade nicht am Zug.");
            return;
        }
        this.cancelAutoPlayFor(client.sessionId);
        this.moveActivePiece(pieceId);
    }
    handleChat(client, rawText) {
        const snapshot = schemaToSnapshot(this.state);
        const player = snapshot.players.find((entry) => entry.id === client.sessionId);
        const text = cleanChatText(rawText);
        if (!player || !text) {
            return;
        }
        const spamResult = this.checkChatSpam(player);
        if (spamResult === "warn") {
            this.sendError(client, "Bitte langsamer schreiben. Das ist deine Chat-Verwarnung.");
            addSystemMessage(snapshot, `${player.name} wurde wegen Chat-Spam verwarnt.`);
            snapshot.updatedAt = Date.now();
            snapshotToSchema(snapshot, this.state);
            return;
        }
        if (spamResult === "kick") {
            this.sendError(client, "Du wurdest wegen Chat-Spam aus dem Raum entfernt.");
            this.removePlayerForModeration(snapshot, player, `${player.name} wurde wegen Chat-Spam entfernt.`);
            snapshotToSchema(snapshot, this.state);
            this.scheduleTurnAutomation();
            return;
        }
        snapshot.chat.push({
            id: createId("chat"),
            playerName: player.name,
            color: player.color,
            text: this.filterChatForRoom(text, snapshot),
            createdAt: Date.now(),
        });
        trimChat(snapshot);
        snapshot.updatedAt = Date.now();
        snapshotToSchema(snapshot, this.state);
    }
    handleChatReport(client, message) {
        const snapshot = schemaToSnapshot(this.state);
        const reporter = snapshot.players.find((entry) => entry.id === client.sessionId);
        if (!reporter) {
            this.sendError(client, "Spieler nicht gefunden.");
            return;
        }
        if (!snapshot.settings.chatFilterEnabled) {
            this.sendError(client, "Der Chat-Filter ist deaktiviert.");
            return;
        }
        const messageId = String(message.messageId || "").trim().slice(0, 80);
        const normalizedTerm = normalizeReportedFilterTerm(String(message.word || ""));
        if (!messageId || !normalizedTerm) {
            this.sendError(client, "Bitte ein Wort aus der Nachricht eintragen.");
            return;
        }
        const targetMessage = snapshot.chat.find((entry) => entry.id === messageId && entry.color !== "system");
        if (!targetMessage) {
            this.sendError(client, "Diese Nachricht kann nicht gemeldet werden.");
            return;
        }
        if (!isReportTermInText(targetMessage.text, normalizedTerm)) {
            this.sendError(client, "Dieses Wort wurde in der Nachricht nicht gefunden.");
            return;
        }
        const wasKnown = this.reportedFilterTerms.has(normalizedTerm);
        this.reportedFilterTerms.add(normalizedTerm);
        this.applyActiveChatFilter(snapshot);
        snapshot.lastEvent = wasKnown
            ? "Der gemeldete Begriff war bereits im Chat-Filter."
            : "Ein gemeldeter Begriff wurde zur Filterliste hinzugefuegt.";
        addSystemMessage(snapshot, snapshot.lastEvent);
        snapshot.updatedAt = Date.now();
        snapshotToSchema(snapshot, this.state);
        client.send("reportAccepted", {
            message: wasKnown ? "Report geprüft. Der Begriff war schon im Filter." : "Report angenommen. Der Begriff wird jetzt gefiltert.",
        });
    }
    handleRematch(client) {
        const snapshot = schemaToSnapshot(this.state);
        const player = snapshot.players.find((entry) => entry.id === client.sessionId);
        if (!player) {
            this.sendError(client, "Spieler nicht gefunden.");
            return;
        }
        const rematch = resetForRematch(snapshot);
        this.clearTurnWindow(rematch);
        this.applyActiveChatFilter(rematch);
        addSystemMessage(rematch, `${player.name} hat eine Revanche gestartet.`);
        snapshotToSchema(rematch, this.state);
    }
    handleAddBot(client) {
        const snapshot = schemaToSnapshot(this.state);
        if (snapshot.status !== "lobby") {
            this.sendError(client, "Bots können nur in der Lobby hinzugefügt werden.");
            return;
        }
        if (!this.isHost(client, snapshot)) {
            this.sendError(client, "Nur der Host kann Bots hinzufügen.");
            return;
        }
        if (!this.addBotsToSnapshot(snapshot, 1)) {
            this.sendError(client, "Keine Farbe mehr frei.");
            return;
        }
        snapshot.players = sortPlayersClockwise(snapshot.players);
        snapshot.lastEvent = "Ein Computerspieler wurde hinzugefügt.";
        addSystemMessage(snapshot, snapshot.lastEvent);
        snapshot.updatedAt = Date.now();
        snapshotToSchema(snapshot, this.state);
    }
    startGame(snapshot) {
        snapshot.players = sortPlayersClockwise(snapshot.players).map((player) => ({
            ...player,
            customColor: cleanCustomColor(player.customColor, COLOR_META[player.color].hex),
            pieces: createPieces(player.color),
        }));
        snapshot.status = "playing";
        snapshot.currentPlayerIndex = snapshot.players.findIndex((player) => player.connected || player.isBot);
        if (snapshot.currentPlayerIndex < 0) {
            snapshot.currentPlayerIndex = 0;
        }
        snapshot.diceValue = 0;
        snapshot.diceRolled = false;
        snapshot.rollAttempts = 0;
        snapshot.legalMoves = [];
        snapshot.winnerColor = "";
        snapshot.lastEvent = `${getActivePlayer(snapshot)?.name || "Ein Spieler"} beginnt.`;
        addSystemMessage(snapshot, "Das Spiel startet.");
        this.startTurnWindow(snapshot);
        snapshot.updatedAt = Date.now();
        snapshotToSchema(snapshot, this.state);
        this.scheduleTurnAutomation();
    }
    rollForActivePlayer() {
        let snapshot = schemaToSnapshot(this.state);
        const activePlayer = getActivePlayer(snapshot);
        if (!activePlayer || snapshot.status !== "playing") {
            return;
        }
        if (snapshot.diceRolled) {
            return;
        }
        const dice = rollDiceValue();
        snapshot.diceValue = dice;
        snapshot.diceRolled = true;
        snapshot.rollAttempts += 1;
        snapshot.legalMoves = getLegalMoves(snapshot);
        if (snapshot.legalMoves.length === 0) {
            if (dice === 6) {
                snapshot.diceRolled = false;
                snapshot.rollAttempts = 0;
                snapshot.lastEvent = `${activePlayer.name} würfelt eine 6, kann nicht ziehen und darf nochmal würfeln.`;
            }
            else if (shouldKeepRollingAfterMiss(snapshot)) {
                snapshot.diceRolled = false;
                snapshot.lastEvent = `${activePlayer.name} braucht eine 6. Versuch ${snapshot.rollAttempts}/3.`;
            }
            else {
                const event = `${activePlayer.name} würfelt ${dice}; kein Zug möglich.`;
                snapshot = advanceToNextPlayer(snapshot);
                snapshot.diceValue = dice;
                snapshot.diceRolled = false;
                snapshot.rollAttempts = 0;
                snapshot.legalMoves = [];
                snapshot.lastEvent = `${event} ${getActivePlayer(snapshot)?.name || "Niemand"} ist dran.`;
            }
        }
        else {
            snapshot.lastEvent = `${activePlayer.name} würfelt ${dice}.`;
        }
        this.keepOrStartTurnWindow(snapshot, activePlayer.id);
        snapshot.updatedAt = Date.now();
        snapshotToSchema(snapshot, this.state);
        this.scheduleTurnAutomation();
    }
    moveActivePiece(pieceId) {
        const before = schemaToSnapshot(this.state);
        const activePlayer = getActivePlayer(before);
        const result = applyMove(before, pieceId);
        if (result.error || !result.move || !activePlayer) {
            const client = this.clients.find((entry) => entry.sessionId === activePlayer?.id);
            if (client) {
                this.sendError(client, result.error || "Zug nicht möglich.");
            }
            return;
        }
        let snapshot = result.state;
        const captureText = result.move.captures.length > 0 ? " und schlägt eine Figur" : "";
        if (snapshot.status === "finished") {
            snapshot.lastEvent = `${activePlayer.name} zieht${captureText} und gewinnt.`;
            addSystemMessage(snapshot, snapshot.lastEvent);
            this.clearTurnWindow(snapshot);
            snapshotToSchema(snapshot, this.state);
            return;
        }
        if (before.diceValue === 6) {
            snapshot.diceValue = 0;
            snapshot.diceRolled = false;
            snapshot.rollAttempts = 0;
            snapshot.legalMoves = [];
            snapshot.lastEvent = `${activePlayer.name} zieht${captureText} und darf nochmal würfeln.`;
        }
        else {
            const event = `${activePlayer.name} zieht${captureText}.`;
            snapshot = advanceToNextPlayer(snapshot);
            snapshot.lastEvent = `${event} ${getActivePlayer(snapshot)?.name || "Niemand"} ist dran.`;
        }
        this.keepOrStartTurnWindow(snapshot, activePlayer.id);
        snapshot.updatedAt = Date.now();
        snapshotToSchema(snapshot, this.state);
        this.scheduleTurnAutomation();
    }
    scheduleTurnAutomation() {
        this.clearAutomationTimeout();
        const snapshot = schemaToSnapshot(this.state);
        const activePlayer = getActivePlayer(snapshot);
        if (snapshot.status !== "playing" || !activePlayer) {
            this.autoPlayPlayerId = "";
            return;
        }
        if (this.autoPlayPlayerId && this.autoPlayPlayerId !== activePlayer.id) {
            this.autoPlayPlayerId = "";
        }
        if (activePlayer.isBot || this.autoPlayPlayerId === activePlayer.id) {
            const delay = activePlayer.isBot ? BOT_STEP_DELAY_MS : HUMAN_AUTO_STEP_DELAY_MS;
            this.automationTimeout = this.clock.setTimeout(() => {
                this.playAutomatedStep(activePlayer.id, activePlayer.isBot ? "bot" : "timeout");
            }, delay);
            return;
        }
        const delay = Math.max(0, (snapshot.turnDeadlineAt || Date.now()) - Date.now());
        this.automationTimeout = this.clock.setTimeout(() => {
            this.startHumanAutoPlay(activePlayer.id);
        }, delay);
    }
    startHumanAutoPlay(playerId) {
        const snapshot = schemaToSnapshot(this.state);
        const activePlayer = getActivePlayer(snapshot);
        if (snapshot.status !== "playing" ||
            !activePlayer ||
            activePlayer.id !== playerId ||
            activePlayer.isBot ||
            Date.now() < snapshot.turnDeadlineAt) {
            this.scheduleTurnAutomation();
            return;
        }
        this.autoPlayPlayerId = playerId;
        addSystemMessage(snapshot, `${activePlayer.name} ist nicht rechtzeitig dran. Der Computer spielt diesen Zug.`);
        snapshot.lastEvent = `${activePlayer.name} ist nicht rechtzeitig dran. Der Computer übernimmt kurz.`;
        snapshot.updatedAt = Date.now();
        snapshotToSchema(snapshot, this.state);
        this.scheduleTurnAutomation();
    }
    playAutomatedStep(playerId, reason) {
        const snapshot = schemaToSnapshot(this.state);
        const activePlayer = getActivePlayer(snapshot);
        if (snapshot.status !== "playing" || !activePlayer || activePlayer.id !== playerId) {
            this.scheduleTurnAutomation();
            return;
        }
        if (reason === "timeout" && this.autoPlayPlayerId !== playerId) {
            this.scheduleTurnAutomation();
            return;
        }
        if (!snapshot.diceRolled) {
            this.rollForActivePlayer();
            return;
        }
        const move = chooseBotMove(snapshot);
        if (move) {
            this.moveActivePiece(move.pieceId);
            return;
        }
        this.scheduleTurnAutomation();
    }
    startTurnWindow(snapshot) {
        if (snapshot.status !== "playing") {
            this.clearTurnWindow(snapshot);
            return;
        }
        const activePlayer = getActivePlayer(snapshot);
        if (!activePlayer) {
            this.clearTurnWindow(snapshot);
            return;
        }
        const now = Date.now();
        const turnTimeLimitMs = clampTurnTimeLimit(snapshot.settings.turnTimeLimitMs);
        snapshot.settings.turnTimeLimitMs = turnTimeLimitMs;
        snapshot.turnStartedAt = now;
        snapshot.turnDeadlineAt = now + turnTimeLimitMs;
    }
    keepOrStartTurnWindow(snapshot, previousPlayerId) {
        const activePlayer = getActivePlayer(snapshot);
        const samePlayerStillActive = Boolean(activePlayer &&
            activePlayer.id === previousPlayerId &&
            snapshot.turnStartedAt &&
            snapshot.turnDeadlineAt);
        if (!samePlayerStillActive) {
            this.startTurnWindow(snapshot);
        }
    }
    clearTurnWindow(snapshot) {
        snapshot.turnStartedAt = 0;
        snapshot.turnDeadlineAt = 0;
        this.autoPlayPlayerId = "";
        this.clearAutomationTimeout();
    }
    clearAutomationTimeout() {
        this.automationTimeout?.clear();
        this.automationTimeout = null;
    }
    cancelAutoPlayFor(playerId) {
        if (this.autoPlayPlayerId === playerId) {
            this.autoPlayPlayerId = "";
        }
    }
    addBotsToSnapshot(snapshot, amount) {
        let added = 0;
        for (let index = 0; index < amount; index += 1) {
            const color = getAvailableColors(snapshot.players)[0];
            if (!color) {
                break;
            }
            const playerName = `${COLOR_META[color].label}-Computer`;
            snapshot.players.push({
                id: `bot-${color}`,
                name: playerName,
                color,
                customColor: COLOR_META[color].hex,
                ready: true,
                connected: true,
                isBot: true,
                pieces: createPieces(color),
            });
            added += 1;
        }
        return added > 0;
    }
    reconnectPlayer(client, snapshot, token) {
        const color = this.playerTokens.get(token);
        if (!color) {
            return false;
        }
        const player = snapshot.players.find((entry) => entry.color === color && !entry.isBot);
        if (!player) {
            return false;
        }
        const previousId = player.id;
        const previousClient = this.clients.find((entry) => entry.sessionId === previousId && entry.sessionId !== client.sessionId);
        player.id = client.sessionId;
        player.connected = true;
        if (snapshot.status === "lobby") {
            player.ready = false;
        }
        this.tokenByPlayerId.delete(previousId);
        this.tokenByPlayerId.set(client.sessionId, token);
        if (snapshot.hostId === previousId || this.hostId === previousId) {
            this.hostId = client.sessionId;
            snapshot.hostId = client.sessionId;
        }
        if (previousClient) {
            previousClient.send("errorMessage", { message: "Deine Sitzung wurde in einem neuen Fenster übernommen." });
            previousClient.leave(4001, "Sitzung übernommen.");
        }
        snapshot.lastEvent = `${player.name} ist wieder beigetreten.`;
        addSystemMessage(snapshot, `${player.name} ist wieder beigetreten.`);
        return true;
    }
    filterChatForRoom(text, snapshot) {
        if (!snapshot.settings.chatFilterEnabled) {
            return text;
        }
        return filterChatText(text, { extraPhrases: [...this.reportedFilterTerms] });
    }
    applyActiveChatFilter(snapshot) {
        if (!snapshot.settings.chatFilterEnabled) {
            return;
        }
        snapshot.chat = snapshot.chat.map((message) => {
            if (message.color === "system") {
                return message;
            }
            return {
                ...message,
                text: this.filterChatForRoom(message.text, snapshot),
            };
        });
    }
    sendSessionInfo(client, reconnectToken) {
        this.clock.setTimeout(() => {
            client.send("sessionInfo", {
                roomId: this.roomId,
                reconnectToken,
            });
        }, 100);
    }
    isHost(client, snapshot) {
        return Boolean(snapshot.hostId && snapshot.hostId === client.sessionId);
    }
    removePlayerFromLobby(snapshot, target, reason) {
        this.deleteTokenForPlayer(target.id);
        snapshot.players = sortPlayersClockwise(snapshot.players.filter((player) => player.id !== target.id));
        snapshot.currentPlayerIndex = 0;
        snapshot.lastEvent = reason;
        addSystemMessage(snapshot, reason);
        snapshot.updatedAt = Date.now();
        const targetClient = this.clients.find((entry) => entry.sessionId === target.id);
        if (targetClient) {
            this.kickedPlayerIds.add(target.id);
            targetClient.send("kicked", { message: reason });
            targetClient.leave(4000, reason);
        }
    }
    removePlayerForModeration(snapshot, player, reason) {
        this.deleteTokenForPlayer(player.id);
        if (snapshot.status === "lobby") {
            this.removePlayerFromLobby(snapshot, player, reason);
            return;
        }
        else {
            addSystemMessage(snapshot, reason);
            player.connected = false;
            player.ready = false;
            snapshot.lastEvent = reason;
            const active = getActivePlayer(snapshot);
            if (active?.id === player.id && snapshot.status === "playing") {
                const currentIndex = snapshot.players.findIndex((entry) => entry.id === player.id);
                snapshot.currentPlayerIndex = currentIndex < 0 ? snapshot.currentPlayerIndex : currentIndex;
                const nextSnapshot = advanceToNextPlayer(snapshot);
                Object.assign(snapshot, nextSnapshot);
                this.startTurnWindow(snapshot);
            }
            snapshot.updatedAt = Date.now();
        }
        const targetClient = this.clients.find((entry) => entry.sessionId === player.id);
        if (targetClient) {
            this.kickedPlayerIds.add(player.id);
            targetClient.send("kicked", { message: reason });
            targetClient.leave(4000, reason);
        }
    }
    deleteTokenForPlayer(playerId) {
        const token = this.tokenByPlayerId.get(playerId);
        if (!token) {
            return;
        }
        this.tokenByPlayerId.delete(playerId);
        this.playerTokens.delete(token);
        this.chatStats.delete(token);
    }
    checkChatSpam(player) {
        const statsKey = this.tokenByPlayerId.get(player.id) || player.id;
        const now = Date.now();
        const current = this.chatStats.get(statsKey) || {
            windowStart: now,
            count: 0,
            warnings: 0,
        };
        if (now - current.windowStart > CHAT_WINDOW_MS) {
            current.windowStart = now;
            current.count = 0;
        }
        current.count += 1;
        this.chatStats.set(statsKey, current);
        if (current.count <= CHAT_MESSAGE_LIMIT) {
            return "ok";
        }
        if (current.warnings === 0) {
            current.warnings = 1;
            current.count = 0;
            current.windowStart = now;
            return "warn";
        }
        return "kick";
    }
    sendError(client, message) {
        client.send("errorMessage", { message });
    }
}
function getStartBlocker(snapshot) {
    const activePlayers = snapshot.players.filter((player) => player.connected || player.isBot);
    const disconnectedPlayers = snapshot.players.filter((player) => !player.connected && !player.isBot);
    const waitingPlayers = snapshot.players.filter((player) => player.connected && !player.isBot && !player.ready);
    if (activePlayers.length < 2) {
        return "Mindestens zwei Spieler oder Computer werden benötigt.";
    }
    if (disconnectedPlayers.length > 0) {
        return "Es gibt disconnected Spieler. Warte auf Rejoin oder entferne sie als Host.";
    }
    if (waitingPlayers.length > 0) {
        return "Noch nicht alle Spieler sind bereit.";
    }
    return "";
}
function chooseBotMove(snapshot) {
    const moves = snapshot.legalMoves;
    if (moves.length === 0) {
        return undefined;
    }
    return [...moves].sort((a, b) => {
        if (a.captures.length !== b.captures.length) {
            return b.captures.length - a.captures.length;
        }
        if (a.from !== b.from) {
            return b.from - a.from;
        }
        return a.pieceId.localeCompare(b.pieceId);
    })[0];
}
function addSystemMessage(snapshot, text) {
    snapshot.chat.push({
        id: createId("system"),
        playerName: "System",
        color: "system",
        text,
        createdAt: Date.now(),
    });
    trimChat(snapshot);
}
function trimChat(snapshot) {
    if (snapshot.chat.length > 80) {
        snapshot.chat = snapshot.chat.slice(snapshot.chat.length - 80);
    }
}
function cleanPlayerName(value) {
    return String(value || "")
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 24);
}
function cleanChatText(value) {
    return value.trim().replace(/\s+/g, " ").slice(0, 240);
}
function cleanCustomColor(value, fallback) {
    const color = String(value || "").trim();
    if (/^#[0-9a-f]{6}$/i.test(color)) {
        return color.toLowerCase();
    }
    if (/^#[0-9a-f]{3}$/i.test(color)) {
        const [, r, g, b] = color.toLowerCase();
        return `#${r}${r}${g}${g}${b}${b}`;
    }
    return fallback;
}
function clampTurnTimeLimit(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return DEFAULT_TURN_TIME_LIMIT_MS;
    }
    return Math.min(MAX_TURN_TIME_LIMIT_MS, Math.max(MIN_TURN_TIME_LIMIT_MS, Math.round(parsed)));
}
function cleanToken(value) {
    return String(value || "").trim().slice(0, 80);
}
function createId(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
function rollDiceValue() {
    return randomInt(1, 7);
}
function isPlayerColor(value) {
    return PLAYER_COLORS.includes(value);
}
