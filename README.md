# MDM LudoClone

Browser-Spiel nach dem Prinzip von "Mensch aergere dich nicht" mit React-Client,
Colyseus-Server und gemeinsamer TypeScript-Regellogik.

## Rechtlicher Hinweis

Dieses Projekt ist ein unabhaengiges, inoffizielles Spielprojekt. Details stehen
in `Notice.md`; der Code steht unter der im Repository enthaltenen MIT-Lizenz.

## Schnellstart

Auf diesem Rechner kann PowerShell `npm.ps1` blockieren. Nutze deshalb `npm.cmd`:

```powershell
npm.cmd install
npm.cmd run dev
```

Danach laufen die Dienste lokal:

- Client: <http://127.0.0.1:5173>
- Server: <ws://127.0.0.1:2567>
- Healthcheck: <http://127.0.0.1:2567>

## Scripts

```powershell
npm.cmd run dev
npm.cmd run typecheck
npm.cmd run build
npm.cmd run start
```

## Projektstand

- Spiel erstellen und per Raumcode beitreten
- Multiplayer-Lobby mit Host, Bereit-Status, Bots, Kick-Funktion und Chat
- Classic-Regeln fuer 2 bis 4 Farben
- Serverseitige Validierung fuer Wuerfeln, Ziehen, Lobby-Einstellungen und Reports
- Zugzeit-Limit, Timeout-Automation und Bot-Zuege
- Rejoin ueber lokalen Session-Key
- Chatfilter, Spam-Schutz und Report-System
- Responsive Brettansicht fuer Desktop und Mobile
- Dark Mode und lokal gespeicherte Einstellungen

## Repository-Regeln

- Audio-Dateien werden bewusst nicht versioniert.
- `assets/music/`, `assets/sounds/`, `public/audio/` und uebliche Audio-Endungen sind in `.gitignore` gesperrt.
- Lokale Secrets und Umgebungen wie `.env` und `.env.*` bleiben ausserhalb von Git.
- `node_modules/`, `dist/`, Logdateien und lokale Laufzeitdateien werden nicht committed.
- Wenn spaeter Audio ergaenzt wird, nur mit sauberer Lizenz und weiterhin nicht versehentlich ins Repository aufnehmen.

## Architektur

- `client/src` enthaelt React-Oberflaeche, Lobby, Brett-Rendering, Eingaben, Chat, Timer und lokale Einstellungen.
- `server/src` enthaelt Express, Colyseus-Rooms, Multiplayer-Status, Bots, Reports, Timer und autoritative Aktionen.
- `shared/src` enthaelt gemeinsame Typen, Konstanten, Brettkoordinaten, Chatfilter und reine Spiellogik.
- `assets` enthaelt versionierbare Bildassets fuer Brett, Figuren und Hintergruende.

Der Server ist die Quelle der Wahrheit. Der Client rendert den synchronisierten Zustand und hebt nur Zuege hervor, die aus der gemeinsamen Regellogik berechnet werden.

## Wichtige Dateien

- `shared/src/rules.ts` - pure Spiellogik; Regelaenderungen zuerst hier vornehmen.
- `shared/src/types.ts` - gemeinsame State-Formen fuer Client und Server.
- `shared/src/chatFilter.ts` - zentrale Chatfilter-Regeln.
- `server/src/rooms/MenschRoom.ts` - Colyseus-Room mit Nachrichtenhandlern, Timer, Reports und Spielaktionen.
- `server/src/schema.ts` - synchronisiertes Colyseus-State-Schema.
- `client/src/App.tsx` - App-Fluss, Lobby, Spielsteuerung, Chat, Timer und UI-Zustand.
- `client/src/Board.tsx` - Brett und Figuren-Rendering.
- `client/src/assets.ts` - versionierte Bildassets; Audio bleibt leer, solange keine erlaubten lokalen Assets eingebunden werden.
- `client/src/styles.css` - Layout, Brett, Lobby, Chat, Modals und responsive Darstellung.

## Weiterentwicklung

- Neue Regeln immer in `shared/src/rules.ts` ergaenzen und auf dem Server erneut validieren.
- UI darf gueltige Zuege berechnen oder darstellen, aber niemals als Quelle der Wahrheit dienen.
- Neue synchronisierte Felder in `shared/src/types.ts`, `server/src/schema.ts` und der Client-Normalisierung ergaenzen.
- Bei sichtbaren Features diese README aktualisieren.
