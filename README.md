# Mensch ärgere dich nicht

Browser-Spiel mit React-Client, Colyseus-Server und gemeinsam genutzter Regel-Logik in TypeScript.

## Start

PowerShell blockiert auf diesem Rechner `npm.ps1`. Nutze deshalb `npm.cmd`.

```powershell
npm.cmd install
npm.cmd run dev
```

Danach:

- Client: http://127.0.0.1:5173
- Server: ws://127.0.0.1:2567
- Healthcheck: http://127.0.0.1:2567

## Scripts

```powershell
npm.cmd run dev
npm.cmd run typecheck
npm.cmd run build
npm.cmd run start
```

## Architektur

- `client/src`
  React-Oberfläche, Brett-Rendering, Lobby, Chat, Regeln, Einstellungen und Eingaben.
- `server/src`
  Colyseus-Room, Lobby, Multiplayer, Bots, Chat, Disconnects und autoritative Validierung.
- `shared/src`
  Gemeinsame Typen, Konstanten, Brettkoordinaten und Classic-Regeln.
- `assets`
  Vorhandene Brett- und Spielstein-Assets. Im Client werden die SVG-Dateien genutzt.

Der Server entscheidet immer, ob Würfeln und Züge gültig sind. Der Client rendert nur den synchronisierten Zustand und hebt serverseitig berechnete Züge hervor.

## Umgesetzt

- Spiel erstellen und per Raumcode beitreten
- Name eingeben und Farbe wählen
- Host-Lobby mit Raumcode, Bereit-Status und abgedunkeltem Brett im Hintergrund
- Host-Rechte für Spielstart, Computerspieler, Einstellungen und Kick-Funktion
- Manuelles Starten des Spiels erst, wenn genug aktive Spieler bereit sind
- Rejoin in dieselbe Lobby oder Partie über einen lokalen Session-Key, auch wenn eine alte Verbindung noch hängt
- Classic-Spiel für 2 bis 4 Farben
- Computerspieler hinzufügen oder direkt beim Erstellen auffüllen
- Schlagzwang in der Lobby aktivieren oder deaktivieren
- Chatfilter in der Lobby aktivieren oder deaktivieren
- Regeln im Client anzeigen
- Würfeln und Figur direkt anklicken, ohne zusätzlichen Bestätigungsbutton
- Bei einer Sechs zwischen allen gültigen markierten Figuren wählen
- Ausgewählte Figur mit kurzer Vergrößerungsanimation
- Einblendung für den eigenen Zug und den nächsten Schritt in der Seitenleiste
- Gültige Züge und Zielfelder hervorheben
- Schlagen gegnerischer Figuren
- Pflicht zum Raussetzen bei Sechs, wenn möglich
- Pflicht zum Freiziehen des eigenen Anfangsfelds, wenn möglich
- Exakte Zielbewegung in die Zielfelder
- Drei Würfelversuche, wenn keine Figur auf der Laufbahn steht und die Zielsteine aufgerückt sind
- Extra-Wurf nach jeder Sechs
- Gewinneranzeige, sobald alle vier Figuren in Zielfeldern sind, mit animiertem Pokal in der Brettmitte und Revanche
- Kompakter Chat mit Systemmeldungen, robusterem Wortfilter und Spam-Schutz
- Disconnect-Anzeige, Rejoin-Möglichkeit und Überspringen eines disconnected aktiven Spielers
- Kompakteres Brettlayout, damit das Spiel auf Desktop ohne vertikales Scrollen nutzbar bleibt
- Würfelanzeige mit echten Würfelpunkten und sichtbarem Raumcode in der Spielansicht
- Dark Mode mit lokal gespeicherter Auswahl
- Sichtbare Figuren-Außenringe im Light und Dark Mode
- Erweiterbare Chatfilter-Regeln in `shared/src/chatFilter.ts`

## Wichtige Dateien

- `shared/src/rules.ts`
  Pure Spiellogik. Änderungen an Regeln zuerst hier vornehmen.
- `shared/src/chatFilter.ts`
  Zentrale Chatfilter-Regeln. Neue Filterbegriffe oder Regex-Regeln hier ergänzen.
- `server/src/rooms/MenschRoom.ts`
  Colyseus-Room und serverseitige Aktionen.
- `server/src/schema.ts`
  Synchronisiertes Colyseus-State-Schema.
- `client/src/App.tsx`
  App-Fluss, Lobby, Spielsteuerung, Chat und Regeln.
- `client/src/Board.tsx`
  SVG-Brett und Figuren-Rendering.

## Hinweise für Weiterentwicklung

- Neue Regeln immer in `shared/src/rules.ts` ergänzen und vom Server erneut validieren lassen.
- UI darf gültige Züge berechnen oder darstellen, aber niemals als Quelle der Wahrheit dienen.
- Bei neuen sichtbaren Features diese README aktualisieren.
