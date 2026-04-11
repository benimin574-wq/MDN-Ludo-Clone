import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, MutableRefObject } from "react";
import { Client, type Room } from "@colyseus/sdk";
import { COLOR_META, PLAYER_COLORS } from "../../shared/src/constants";
import type { GameStateSnapshot, PlayerColor } from "../../shared/src/types";
import { Board } from "./Board";

const DEFAULT_NAME = "Spieler";
const LAST_ROOM_KEY = "mensch:last-room";
const THEME_STORAGE_KEY = "mensch:theme";
const DICE_PIPS: Record<number, number[]> = {
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
};

interface SavedRoomSession {
  roomId: string;
  reconnectToken: string;
}

type ThemeMode = "light" | "dark";

export function App() {
  const clientRef = useRef<Client | null>(null);
  const moveTimeoutRef = useRef<number | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [state, setState] = useState<GameStateSnapshot | null>(null);
  const [playerName, setPlayerName] = useState(DEFAULT_NAME);
  const [selectedColor, setSelectedColor] = useState<PlayerColor>("blue");
  const [joinCode, setJoinCode] = useState("");
  const [botCount, setBotCount] = useState(1);
  const [strikeRequired, setStrikeRequired] = useState(false);
  const [selectedPieceId, setSelectedPieceId] = useState("");
  const [chatText, setChatText] = useState("");
  const [rulesOpen, setRulesOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [savedRoom, setSavedRoom] = useState<SavedRoomSession | null>(() => getSavedRoomSession());
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => getSavedThemeMode());

  const me = useMemo(
    () => state?.players.find((player) => player.id === room?.sessionId),
    [room?.sessionId, state],
  );
  const activePlayer = state ? state.players[state.currentPlayerIndex] : undefined;
  const isMyTurn = Boolean(state && me && activePlayer?.id === me.id && state.status === "playing");
  const isHost = Boolean(state && me && state.hostId === me.id);
  const canRoll = Boolean(isMyTurn && state && !state.diceRolled);
  const startBlocker = state ? getStartBlocker(state) : "";
  const toggleTheme = () => {
    setThemeMode((current) => (current === "dark" ? "light" : "dark"));
  };

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    localStorage.setItem(THEME_STORAGE_KEY, themeMode);
  }, [themeMode]);

  useEffect(() => {
    return () => {
      if (moveTimeoutRef.current) {
        window.clearTimeout(moveTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!errorMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => setErrorMessage(""), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [errorMessage]);

  useEffect(() => {
    if (!state || !selectedPieceId) {
      return;
    }

    if (!state.legalMoves.some((move) => move.pieceId === selectedPieceId)) {
      setSelectedPieceId("");
    }
  }, [selectedPieceId, state]);

  async function createRoom() {
    setBusy(true);
    setErrorMessage("");
    try {
      const joinedRoom = await getClient(clientRef).create("mensch", {
        name: playerName,
        color: selectedColor,
        botCount,
        strikeRequired,
      });
      attachRoom(joinedRoom);
      playUiSound(320);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function joinRoomByCode(codeOverride?: string) {
    const code = (codeOverride || joinCode).trim();
    if (!code) {
      setErrorMessage("Bitte einen Raumcode eingeben.");
      return;
    }

    setBusy(true);
    setErrorMessage("");
    try {
      const joinedRoom = await getClient(clientRef).joinById(code, {
        name: playerName,
        color: selectedColor,
        reconnectToken: getReconnectToken(code),
      });
      attachRoom(joinedRoom);
      playUiSound(320);
    } catch (error) {
      const message = getErrorMessage(error);
      if (codeOverride && shouldForgetSavedRoom(message)) {
        clearRoomSession(code);
        setSavedRoom(getSavedRoomSession());
      }
      setErrorMessage(message);
    } finally {
      setBusy(false);
    }
  }

  function attachRoom(joinedRoom: Room) {
    room?.leave();
    setRoom(joinedRoom);
    setJoinCode(joinedRoom.roomId);
    setSelectedPieceId("");
    setState(normalizeState(joinedRoom.state));

    joinedRoom.onStateChange((nextState) => {
      setState(normalizeState(nextState));
    });
    joinedRoom.onMessage("sessionInfo", (message: SavedRoomSession) => {
      if (message.roomId && message.reconnectToken) {
        saveRoomSession(message);
        setSavedRoom(message);
      }
    });
    joinedRoom.onMessage("errorMessage", (message: { message?: string }) => {
      setErrorMessage(message.message || "Aktion nicht möglich.");
      playUiSound(110);
    });
    joinedRoom.onMessage("kicked", (message: { message?: string }) => {
      clearRoomSession(joinedRoom.roomId);
      setSavedRoom(getSavedRoomSession());
      setErrorMessage(message.message || "Du wurdest aus dem Raum entfernt.");
      playUiSound(90);
    });
    joinedRoom.onLeave(() => {
      setRoom(null);
      setState(null);
      setSelectedPieceId("");
    });
  }

  function sendReady() {
    if (!room || !me) {
      return;
    }

    room.send("toggleReady", { ready: !me.ready });
    playUiSound(260);
  }

  function sendStrikeRequired(enabled: boolean) {
    setStrikeRequired(enabled);
    room?.send("setStrikeRequired", { enabled });
  }

  function sendChatFilter(enabled: boolean) {
    room?.send("setChatFilter", { enabled });
  }

  function addBot() {
    room?.send("addBot");
    playUiSound(260);
  }

  function startGame() {
    room?.send("startGame");
    playUiSound(360);
  }

  function kickPlayer(playerId: string) {
    room?.send("kickPlayer", { playerId });
  }

  function rollDice() {
    if (!room || !canRoll) {
      return;
    }

    room.send("rollDice");
    playUiSound(420);
  }

  function movePiece(pieceId: string) {
    const move = state?.legalMoves.find((entry) => entry.pieceId === pieceId);
    if (!room || !move || !isMyTurn) {
      return;
    }

    setSelectedPieceId(pieceId);
    playUiSound(move.captures.length > 0 ? 160 : 360);

    if (moveTimeoutRef.current) {
      window.clearTimeout(moveTimeoutRef.current);
    }

    moveTimeoutRef.current = window.setTimeout(() => {
      room.send("movePiece", { pieceId });
      setSelectedPieceId("");
      moveTimeoutRef.current = null;
    }, 220);
  }

  function sendChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = chatText.trim();
    if (!room || !text) {
      return;
    }

    room.send("sendChat", { text });
    setChatText("");
  }

  function requestRematch() {
    room?.send("requestRematch");
    setSelectedPieceId("");
  }

  function leaveRoom() {
    room?.leave();
    setRoom(null);
    setState(null);
    setSelectedPieceId("");
  }

  if (!room || !state) {
    return (
      <main className="app-shell entry-shell">
        <section className="entry-panel">
          <div>
            <p className="eyebrow">Classic</p>
            <h1>Mensch ärgere dich nicht</h1>
            <p className="lede">Online lokal spielen, mit Freunden oder Computerspielern.</p>
          </div>
          <ThemeToggle themeMode={themeMode} onToggle={toggleTheme} />

          <div className="form-grid">
            <label>
              Name
              <input
                value={playerName}
                maxLength={24}
                onChange={(event) => setPlayerName(event.target.value)}
                placeholder="Dein Name"
              />
            </label>
            <label>
              Farbe
              <select
                value={selectedColor}
                onChange={(event) => setSelectedColor(event.target.value as PlayerColor)}
              >
                {PLAYER_COLORS.map((color) => (
                  <option key={color} value={color}>
                    {COLOR_META[color].label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Computerspieler
              <select value={botCount} onChange={(event) => setBotCount(Number(event.target.value))}>
                <option value={0}>Keine</option>
                <option value={1}>1 Computer</option>
                <option value={2}>2 Computer</option>
                <option value={3}>3 Computer</option>
              </select>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={strikeRequired}
                onChange={(event) => setStrikeRequired(event.target.checked)}
              />
              Schlagzwang
            </label>
          </div>

          <div className="button-row">
            <button disabled={busy} onClick={createRoom}>
              Spiel erstellen
            </button>
            <button className="button-secondary" onClick={() => setRulesOpen(true)}>
              Regeln anzeigen
            </button>
          </div>

          <div className="join-row">
            <input
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value)}
              placeholder="Raumcode"
              aria-label="Raumcode"
            />
            <button className="button-secondary" disabled={busy} onClick={() => joinRoomByCode()}>
              Beitreten
            </button>
          </div>

          {savedRoom ? (
            <button className="button-secondary" disabled={busy} onClick={() => joinRoomByCode(savedRoom.roomId)}>
              Letzten Raum wieder betreten: {savedRoom.roomId}
            </button>
          ) : null}
        </section>

        {errorMessage ? <div className="toast">{errorMessage}</div> : null}
        {rulesOpen ? <RulesDialog onClose={() => setRulesOpen(false)} /> : null}
      </main>
    );
  }

  if (state.status === "lobby") {
    return (
      <main className="app-shell app-shell--lobby">
        <LobbyStage
          state={state}
          meId={room.sessionId}
          isHost={isHost}
          startBlocker={startBlocker}
          chatText={chatText}
          onReady={sendReady}
          onAddBot={addBot}
          onStartGame={startGame}
          onKickPlayer={kickPlayer}
          onStrikeRequired={sendStrikeRequired}
          onChatFilter={sendChatFilter}
          onChatText={setChatText}
          onSendChat={sendChat}
          themeMode={themeMode}
          onToggleTheme={toggleTheme}
          onRules={() => setRulesOpen(true)}
          onLeave={leaveRoom}
        />
        {errorMessage ? <div className="toast">{errorMessage}</div> : null}
        {rulesOpen ? <RulesDialog onClose={() => setRulesOpen(false)} /> : null}
      </main>
    );
  }

  return (
    <main className="app-shell">
      <section className="top-bar">
        <div>
          <p className="eyebrow">Partie läuft</p>
          <h1>Mensch ärgere dich nicht</h1>
        </div>
        <div className="top-actions">
          <RoomCodeBadge roomId={state.roomId} />
          <ThemeToggle themeMode={themeMode} onToggle={toggleTheme} />
          <button className="button-secondary" onClick={() => setRulesOpen(true)}>
            Regeln
          </button>
          <button className="button-secondary" onClick={leaveRoom}>
            Verlassen
          </button>
        </div>
      </section>

      <section className="game-layout">
        <div className="playfield">
          <Board state={state} selectedPieceId={selectedPieceId} onSelectPiece={movePiece} />
          <WinnerOverlay state={state} meId={room.sessionId} />
        </div>

        <aside className="side-panel">
          <TurnBanner state={state} meId={room.sessionId} canRoll={canRoll} />
          <TurnPanel
            state={state}
            meId={room.sessionId}
            canRoll={canRoll}
            onRoll={rollDice}
            onRematch={requestRematch}
          />
          <PlayersPanel state={state} meId={room.sessionId} hostId={state.hostId} />
          <ChatPanel
            state={state}
            chatText={chatText}
            onChatText={setChatText}
            onSendChat={sendChat}
          />
        </aside>
      </section>

      {errorMessage ? <div className="toast">{errorMessage}</div> : null}
      {rulesOpen ? <RulesDialog onClose={() => setRulesOpen(false)} /> : null}
    </main>
  );
}

interface LobbyStageProps {
  state: GameStateSnapshot;
  meId: string;
  isHost: boolean;
  startBlocker: string;
  chatText: string;
  onReady: () => void;
  onAddBot: () => void;
  onStartGame: () => void;
  onKickPlayer: (playerId: string) => void;
  onStrikeRequired: (enabled: boolean) => void;
  onChatFilter: (enabled: boolean) => void;
  onChatText: (value: string) => void;
  onSendChat: (event: FormEvent<HTMLFormElement>) => void;
  themeMode: ThemeMode;
  onToggleTheme: () => void;
  onRules: () => void;
  onLeave: () => void;
}

function LobbyStage({
  state,
  meId,
  isHost,
  startBlocker,
  chatText,
  onReady,
  onAddBot,
  onStartGame,
  onKickPlayer,
  onStrikeRequired,
  onChatFilter,
  onChatText,
  onSendChat,
  themeMode,
  onToggleTheme,
  onRules,
  onLeave,
}: LobbyStageProps) {
  const me = state.players.find((player) => player.id === meId);
  const host = state.players.find((player) => player.id === state.hostId);
  const canAddBot = isHost && state.players.length < 4;

  return (
    <section className="lobby-stage">
      <div className="lobby-board-backdrop">
        <Board state={state} selectedPieceId="" onSelectPiece={() => undefined} disabled />
      </div>
      <div className="lobby-overlay">
        <section className="lobby-window">
          <div className="lobby-main">
            <div className="lobby-head">
              <div>
                <p className="eyebrow">Lobby</p>
                <h1>Warten auf Spieler</h1>
              </div>
              <div className="room-code-box">
                <span>Code</span>
                <strong>{state.roomId}</strong>
              </div>
            </div>
            <ThemeToggle themeMode={themeMode} onToggle={onToggleTheme} />

            <p className="status-line">
              Host: {host?.name || "wartet"} {isHost ? "· du hast die Admin-Rechte" : ""}
            </p>

            <div className="lobby-settings">
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={state.settings.strikeRequired}
                  disabled={!isHost}
                  onChange={(event) => onStrikeRequired(event.target.checked)}
                />
                Schlagzwang
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={state.settings.chatFilterEnabled}
                  disabled={!isHost}
                  onChange={(event) => onChatFilter(event.target.checked)}
                />
                Chat-Filter
              </label>
            </div>

            <PlayersPanel
              state={state}
              meId={meId}
              hostId={state.hostId}
              isHost={isHost}
              onKick={onKickPlayer}
            />

            <div className="lobby-actions">
              <button onClick={onReady}>{me?.ready ? "Bereit zurücknehmen" : "Bereit"}</button>
              <button className="button-secondary" disabled={!canAddBot} onClick={onAddBot}>
                Computer hinzufügen
              </button>
              <button disabled={!isHost || Boolean(startBlocker)} onClick={onStartGame}>
                Spiel starten
              </button>
              <button className="button-secondary" onClick={onRules}>
                Regeln
              </button>
              <button className="button-secondary" onClick={onLeave}>
                Verlassen
              </button>
            </div>

            <p className="status-line">{startBlocker || state.lastEvent}</p>
          </div>

          <ChatPanel
            state={state}
            chatText={chatText}
            onChatText={onChatText}
            onSendChat={onSendChat}
          />
        </section>
      </div>
    </section>
  );
}

interface TurnPanelProps {
  state: GameStateSnapshot;
  meId: string;
  canRoll: boolean;
  onRoll: () => void;
  onRematch: () => void;
}

function TurnPanel({ state, meId, canRoll, onRoll, onRematch }: TurnPanelProps) {
  const activePlayer = state.players[state.currentPlayerIndex];
  const isMyTurn = activePlayer?.id === meId;
  const winner = state.winnerColor ? state.players.find((player) => player.color === state.winnerColor) : undefined;

  if (state.status === "finished") {
    return (
      <section className="panel-block">
        <p className="eyebrow">Gewonnen</p>
        <h2>{winner?.name || "Ein Spieler"}</h2>
        <p className="status-line">{state.lastEvent}</p>
        <button onClick={onRematch}>Revanche</button>
      </section>
    );
  }

  return (
    <section className="panel-block">
      <p className="eyebrow">Am Zug</p>
      <h2>{activePlayer?.name || "Warten"}</h2>
      <div className="dice-row">
        <DiceFace value={state.diceValue} active={state.diceRolled} />
        <div className="dice-actions">
          <button disabled={!canRoll} onClick={onRoll}>
            {canRoll ? "Jetzt würfeln" : "Warten"}
          </button>
          <span>{state.diceRolled ? `Gewürfelt: ${state.diceValue}` : "Würfel bereit"}</span>
        </div>
      </div>
      <p className="status-line">{state.lastEvent}</p>
      {isMyTurn && state.legalMoves.length > 0 ? (
        <div className="move-box">
          <p>{state.diceValue === 6 ? "Sechs gewürfelt: Wähle eine markierte Figur." : "Figur anklicken. Der Zug wird direkt ausgeführt."}</p>
        </div>
      ) : null}
      {activePlayer?.isBot ? <p className="status-line">Der Computer denkt.</p> : null}
    </section>
  );
}

function DiceFace({ value, active }: { value: number; active: boolean }) {
  const pips = DICE_PIPS[value] || [];

  return (
    <div className={`dice-face ${active ? "dice-face--active" : ""}`} aria-label={value ? `Würfel ${value}` : "Nicht gewürfelt"}>
      {value ? (
        Array.from({ length: 9 }, (_, index) => {
          const position = index + 1;
          return <span key={position} className={pips.includes(position) ? "dice-pip dice-pip--visible" : "dice-pip"} />;
        })
      ) : (
        <span className="dice-placeholder">?</span>
      )}
    </div>
  );
}

function TurnBanner({ state, meId, canRoll }: { state: GameStateSnapshot; meId: string; canRoll: boolean }) {
  const activePlayer = state.players[state.currentPlayerIndex];
  if (state.status !== "playing" || activePlayer?.id !== meId) {
    return null;
  }

  return (
    <div className="turn-banner">
      <strong>Du bist am Zug</strong>
      <span>{canRoll ? "Jetzt würfeln" : "Figur anklicken"}</span>
    </div>
  );
}

function WinnerOverlay({ state, meId }: { state: GameStateSnapshot; meId: string }) {
  if (state.status !== "finished") {
    return null;
  }

  const winner = state.players.find((player) => player.color === state.winnerColor);
  const isWinner = winner?.id === meId;
  const headline = isWinner ? "Gratulation, du hast gewonnen" : `${winner?.name || "Ein Spieler"} hat gewonnen`;
  const text = isWinner
    ? "Alle vier Figuren sind im Ziel. Der Pokal gehört dir."
    : `${winner?.name || "Ein Spieler"} hat alle vier Figuren ins Ziel gebracht.`;

  return (
    <div className="winner-overlay" role="status" aria-live="assertive">
      <div className="winner-overlay__content">
        <TrophyIcon />
        <p className="eyebrow">Spiel beendet</p>
        <h2>{headline}</h2>
        <p>{text}</p>
      </div>
    </div>
  );
}

function TrophyIcon() {
  return (
    <svg className="trophy-icon" viewBox="0 0 120 120" role="img" aria-label="Pokal">
      <path className="trophy-cup" d="M36 18h48v18c0 19-9 33-24 37C45 69 36 55 36 36V18Z" />
      <path className="trophy-side" d="M36 28H18v7c0 16 10 27 25 28-4-6-7-13-7-23V28Z" />
      <path className="trophy-side" d="M84 28h18v7c0 16-10 27-25 28 4-6 7-13 7-23V28Z" />
      <path className="trophy-stem" d="M54 72h12v18H54z" />
      <path className="trophy-base" d="M40 90h40l8 14H32l8-14Z" />
      <path className="trophy-shine" d="M50 27h8v29h-8z" />
    </svg>
  );
}

function RoomCodeBadge({ roomId }: { roomId: string }) {
  return (
    <div className="room-code-chip" aria-label={`Raumcode ${roomId}`}>
      <span>Raumcode</span>
      <strong>{roomId}</strong>
    </div>
  );
}

function ThemeToggle({ themeMode, onToggle }: { themeMode: ThemeMode; onToggle: () => void }) {
  return (
    <button className="theme-toggle button-secondary" onClick={onToggle} type="button">
      {themeMode === "dark" ? "Light Mode" : "Dark Mode"}
    </button>
  );
}

interface PlayersPanelProps {
  state: GameStateSnapshot;
  meId: string;
  hostId: string;
  isHost?: boolean;
  onKick?: (playerId: string) => void;
}

function PlayersPanel({ state, meId, hostId, isHost = false, onKick }: PlayersPanelProps) {
  return (
    <section className="panel-block players-panel">
      <p className="eyebrow">Spieler</p>
      <ul className="player-list">
        {state.players.map((player, index) => {
          const active = index === state.currentPlayerIndex && state.status === "playing";
          const canKick = Boolean(isHost && state.status === "lobby" && onKick && player.id !== meId && player.id !== hostId);

          return (
            <li key={player.id} className={active ? "player-row player-row--active" : "player-row"}>
              <span className="color-dot" style={{ background: COLOR_META[player.color].hex }} />
              <span>
                {player.name}
                {player.id === meId ? " (du)" : ""}
                {player.id === hostId ? " · Host" : ""}
              </span>
              <small>{getPlayerStatus(player.ready, player.connected, player.isBot, active)}</small>
              {canKick ? (
                <button className="tiny-button" onClick={() => onKick?.(player.id)}>
                  Kick
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

interface ChatPanelProps {
  state: GameStateSnapshot;
  chatText: string;
  onChatText: (value: string) => void;
  onSendChat: (event: FormEvent<HTMLFormElement>) => void;
}

function ChatPanel({ state, chatText, onChatText, onSendChat }: ChatPanelProps) {
  return (
    <section className="panel-block chat-panel">
      <p className="eyebrow">Chat {state.settings.chatFilterEnabled ? "· Filter aktiv" : ""}</p>
      <div className="chat-log" aria-live="polite">
        {state.chat.length === 0 ? <p className="empty-chat">Noch keine Nachrichten.</p> : null}
        {state.chat.map((message) => (
          <p key={message.id} className={message.color === "system" ? "chat-message chat-message--system" : "chat-message"}>
            <strong>{message.playerName}:</strong> {message.text}
          </p>
        ))}
      </div>
      <form className="chat-form" onSubmit={onSendChat}>
        <input
          value={chatText}
          maxLength={240}
          onChange={(event) => onChatText(event.target.value)}
          placeholder="Nachricht"
        />
        <button>Senden</button>
      </form>
    </section>
  );
}

function RulesDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Spielregeln">
      <section className="rules-dialog">
        <div className="dialog-head">
          <div>
            <p className="eyebrow">Classic</p>
            <h2>Regeln</h2>
          </div>
          <button className="button-secondary" onClick={onClose}>
            Schließen
          </button>
        </div>
        <ul className="rules-list">
          <li>Alle Spieler ziehen reihum im Uhrzeigersinn.</li>
          <li>Eine Sechs erlaubt das Raussetzen aus dem Start oder einen anderen gültigen Zug.</li>
          <li>Steht eine eigene Figur auf dem Anfangsfeld und weitere Figuren sind noch im Start, muss sie so bald wie möglich weiterziehen.</li>
          <li>Eigene und fremde Figuren dürfen übersprungen werden.</li>
          <li>Auf eigenen Figuren darf nicht gelandet werden.</li>
          <li>Eine gegnerische Figur auf dem Zielfeld wird geschlagen. Mit aktivem Schlagzwang muss ein Schlagzug genommen werden.</li>
          <li>Zielfelder brauchen die genaue Augenzahl. Wer alle vier Figuren im Ziel hat, gewinnt.</li>
          <li>Wer keine Figur auf der Laufbahn hat, darf bei passenden Zielfeldern bis zu drei Mal auf eine Sechs würfeln.</li>
          <li>Nach jeder Sechs gibt es einen weiteren Wurf, auch wenn kein Zug möglich war.</li>
        </ul>
      </section>
    </div>
  );
}

function normalizeState(rawState: unknown): GameStateSnapshot {
  const value = typeof (rawState as { toJSON?: () => unknown })?.toJSON === "function"
    ? (rawState as { toJSON: () => unknown }).toJSON()
    : rawState;
  const snapshot = value as GameStateSnapshot;

  return {
    roomId: snapshot.roomId || "",
    hostId: snapshot.hostId || "",
    status: snapshot.status || "lobby",
    players: (snapshot.players || []).map((player) => ({
      ...player,
      pieces: player.pieces || [],
    })),
    currentPlayerIndex: snapshot.currentPlayerIndex || 0,
    diceValue: snapshot.diceValue || 0,
    diceRolled: Boolean(snapshot.diceRolled),
    rollAttempts: snapshot.rollAttempts || 0,
    legalMoves: snapshot.legalMoves || [],
    winnerColor: snapshot.winnerColor || "",
    lastEvent: snapshot.lastEvent || "",
    settings: {
      strikeRequired: Boolean(snapshot.settings?.strikeRequired),
      chatFilterEnabled: snapshot.settings?.chatFilterEnabled ?? true,
    },
    chat: snapshot.chat || [],
    updatedAt: snapshot.updatedAt || Date.now(),
  };
}

function getClient(clientRef: MutableRefObject<Client | null>): Client {
  if (!clientRef.current) {
    clientRef.current = new Client(getServerUrl());
  }

  return clientRef.current;
}

function getServerUrl(): string {
  const configuredUrl = import.meta.env.VITE_COLYSEUS_URL as string | undefined;
  if (configuredUrl) {
    return configuredUrl;
  }

  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const localHosts = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);
  if (localHosts.has(window.location.hostname)) {
    return `${protocol}://${window.location.hostname}:2567`;
  }

  return `${protocol}://${window.location.host}`;
}

function getStartBlocker(state: GameStateSnapshot): string {
  const activePlayers = state.players.filter((player) => player.connected || player.isBot);
  const disconnectedPlayers = state.players.filter((player) => !player.connected && !player.isBot);
  const waitingPlayers = state.players.filter((player) => player.connected && !player.isBot && !player.ready);

  if (activePlayers.length < 2) {
    return "Mindestens zwei Spieler oder Computer werden benötigt.";
  }

  if (disconnectedPlayers.length > 0) {
    return "Warte auf disconnected Spieler oder entferne sie als Host.";
  }

  if (waitingPlayers.length > 0) {
    return "Noch nicht alle Spieler sind bereit.";
  }

  return "";
}

function getPlayerStatus(ready: boolean, connected: boolean, isBot: boolean, active: boolean): string {
  if (active) {
    return "am Zug";
  }
  if (isBot) {
    return "Computer";
  }
  if (!connected) {
    return "offline";
  }
  return ready ? "bereit" : "wartet";
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Verbindung fehlgeschlagen.";
}

function shouldForgetSavedRoom(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("gespeicherte") || normalized.includes("not found") || normalized.includes("nicht gefunden");
}

function getSavedThemeMode(): ThemeMode {
  return localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
}

function getRoomStorageKey(roomId: string): string {
  return `mensch:room:${roomId}`;
}

function getReconnectToken(roomId: string): string {
  return localStorage.getItem(getRoomStorageKey(roomId)) || "";
}

function getSavedRoomSession(): SavedRoomSession | null {
  try {
    const raw = localStorage.getItem(LAST_ROOM_KEY);
    return raw ? JSON.parse(raw) as SavedRoomSession : null;
  } catch {
    return null;
  }
}

function saveRoomSession(session: SavedRoomSession): void {
  localStorage.setItem(getRoomStorageKey(session.roomId), session.reconnectToken);
  localStorage.setItem(LAST_ROOM_KEY, JSON.stringify(session));
}

function clearRoomSession(roomId: string): void {
  localStorage.removeItem(getRoomStorageKey(roomId));
  const saved = getSavedRoomSession();
  if (saved?.roomId === roomId) {
    localStorage.removeItem(LAST_ROOM_KEY);
  }
}

function playUiSound(frequency: number): void {
  const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) {
    return;
  }

  const audioContext = new AudioContextCtor();
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.frequency.value = frequency;
  oscillator.type = "sine";
  gain.gain.value = 0.025;
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.08);
}
