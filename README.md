````md
# Ludo Clone

Unabhängiges Browser-Spiel, inspiriert von klassischen Cross-and-Circle-Brettspielen.

## Rechtlicher Hinweis

Dieses Projekt ist ein unabhängiges Fan- bzw. Klonprojekt und steht in keiner Verbindung zu Schmidt Spiele GmbH.
„Mensch ärgere Dich nicht“ ist eine Marke des jeweiligen Rechteinhabers.
Dieses Repository beansprucht keinerlei Rechte an fremden Marken, Namen, Logos oder Originalgrafiken.

## Überblick

Dieses Projekt besteht aus drei Teilen:

- `client/src`  
  React-Oberfläche mit Lobby, Spielbrett, Chat, Regeln, Einstellungen und Eingaben
- `server/src`  
  Colyseus-Server mit Lobby, Multiplayer, Bots, Disconnect-Handling und serverseitiger Validierung
- `shared/src`  
  Gemeinsame Typen, Konstanten, Brettkoordinaten und Spiellogik

Der Server ist immer die Quelle der Wahrheit. Der Client zeigt nur den synchronisierten Zustand an und hebt serverseitig berechnete Züge hervor.

## Voraussetzungen

- Node.js
- npm  
- Unter Windows kann PowerShell `npm.ps1` blockieren. In dem Fall einfach `npm.cmd` statt `npm` benutzen.

## Installation

```powershell
npm.cmd install
````

## Lokal starten

```powershell
npm.cmd run dev
```

Danach erreichst du das Projekt lokal hier:

* Client: `http://127.0.0.1:5173`
* Server: `ws://127.0.0.1:2567`
* Healthcheck: `http://127.0.0.1:2567`

## Online mit Freunden spielen

`localhost` reicht nicht, wenn andere von außen mitspielen sollen.
Die einfachste Lösung für dieses Projekt ist ein **Cloudflare Tunnel**, der dein lokales Frontend öffentlich erreichbar macht.

### Wichtig vor dem ersten Online-Test

Wenn du das Spiel über einen `trycloudflare.com`-Link öffnest, blockt Vite den Host standardmäßig.
Deshalb musst du in `vite.config.ts` den Host erlauben.

Öffne `vite.config.ts` und ergänze im `server`-Block:

```ts
allowedHosts: [".trycloudflare.com"],
```

Beispiel:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "client",
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    allowedHosts: [".trycloudflare.com"],
    proxy: {
      "/matchmake": {
        target: "http://127.0.0.1:2567",
        changeOrigin: true,
      },
      "^/[A-Za-z0-9_-]+/[A-Za-z0-9_-]+(?:\\?.*)?$": {
        target: "ws://127.0.0.1:2567",
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    outDir: "../dist/client",
    emptyOutDir: true,
  },
});
```

Danach den Dev-Server neu starten.

## Cloudflare Tunnel einrichten

### 1. Projekt lokal starten

```powershell
npm.cmd run dev
```

### 2. Cloudflared installieren

Falls noch nicht installiert:

```powershell
winget install --id Cloudflare.cloudflared
```

### 3. Tunnel starten

```powershell
cloudflared tunnel --url http://127.0.0.1:5173
```

Danach bekommst du eine öffentliche `https://...trycloudflare.com`-Adresse.
Diesen Link schickst du an deine Freunde.

## So spielt ihr online

1. Host startet das Projekt lokal
2. Host startet den Cloudflare Tunnel
3. Host schickt den `trycloudflare.com`-Link an alle Mitspieler
4. Host erstellt einen Raum
5. Mitspieler öffnen den Link und treten mit dem Raumcode bei
6. Alle stellen sich auf **Bereit**
7. Der Host startet das Spiel

## Wichtige Hinweise für Spieler und Host

### Alle Spieler müssen vor Spielstart beitreten

Sobald das Spiel gestartet wurde, sind normale neue Joins gesperrt.
Danach funktioniert nur noch Reconnect mit vorhandenem Reconnect-Token.

### Maximal 4 Plätze insgesamt

Ein Raum hat maximal **4 Plätze**.
Bots zählen dabei mit. Wenn 4 echte Spieler mitspielen sollen, keine Bots hinzufügen.

### Reconnect funktioniert nur im gleichen Browser

Der Client speichert `roomId` und `reconnectToken` lokal im Browser.
Dadurch kann derselbe Spieler mit demselben Browser wieder in Lobby oder Partie zurückkehren.

### Für Online-Spiel müssen die Prozesse offen bleiben

Damit das Spiel online erreichbar bleibt, müssen offen bleiben:

* das Terminal mit `npm.cmd run dev`
* das Terminal mit `cloudflared tunnel --url http://127.0.0.1:5173`

Wenn du den Tunnel oder den Server stoppst, ist das Spiel für alle weg.

## Scripts

```powershell
npm.cmd run dev
npm.cmd run typecheck
npm.cmd run build
npm.cmd run start
```

## Features

* Spiel erstellen und per Raumcode beitreten
* Namen eingeben und Farbe wählen
* Host-Lobby mit Raumcode, Bereit-Status und Brett im Hintergrund
* Host-Rechte für Spielstart, Bots, Einstellungen und Kick-Funktion
* Manuelles Starten erst, wenn genug aktive Spieler bereit sind
* Rejoin in dieselbe Lobby oder Partie über lokalen Session-Key
* Classic-Spiel für 2 bis 4 Farben
* Computerspieler hinzufügen oder beim Erstellen direkt auffüllen
* Schlagzwang in der Lobby aktivieren oder deaktivieren
* Chatfilter in der Lobby aktivieren oder deaktivieren
* Regeln direkt im Client anzeigen
* Würfeln und Figur direkt anklicken
* Bei einer Sechs zwischen allen gültigen Figuren wählen
* Ausgewählte Figur mit kurzer Vergrößerungsanimation
* Einblendung für den eigenen Zug und den nächsten Schritt in der Seitenleiste
* Gültige Züge und Zielfelder hervorheben
* Gegnerische Figuren schlagen
* Pflicht zum Raussetzen bei Sechs, wenn möglich
* Pflicht zum Freiziehen des eigenen Anfangsfelds, wenn möglich
* Exakte Zielbewegung in die Zielfelder
* Drei Würfelversuche, wenn keine Figur auf der Laufbahn steht und die Zielsteine aufgerückt sind
* Extra-Wurf nach jeder Sechs
* Gewinneranzeige mit Pokal und Revanche
* Kompakter Chat mit Systemmeldungen, Wortfilter und Spam-Schutz
* Disconnect-Anzeige, Rejoin-Möglichkeit und Überspringen eines disconnected aktiven Spielers
* Kompaktes Brettlayout für Desktop ohne vertikales Scrollen
* Würfelanzeige mit echten Würfelpunkten und sichtbarem Raumcode
* Dark Mode mit lokal gespeicherter Auswahl
* Sichtbare Figuren-Außenringe im Light und Dark Mode
* Erweiterbare Chatfilter-Regeln in `shared/src/chatFilter.ts`

## Wichtige Dateien

* `shared/src/rules.ts`
  Pure Spiellogik. Regeländerungen zuerst hier vornehmen.
* `shared/src/chatFilter.ts`
  Zentrale Chatfilter-Regeln. Neue Begriffe oder Regex-Regeln hier ergänzen.
* `server/src/rooms/MenschRoom.ts`
  Colyseus-Room und serverseitige Aktionen.
* `server/src/schema.ts`
  Synchronisiertes Colyseus-State-Schema.
* `client/src/App.tsx`
  App-Fluss, Lobby, Spielsteuerung, Chat und Regeln.
* `client/src/Board.tsx`
  SVG-Brett und Figuren-Rendering.

## Häufige Probleme

### `Blocked request. This host is not allowed.`

In `vite.config.ts` fehlt noch:

```ts
allowedHosts: [".trycloudflare.com"]
```

Danach Vite neu starten.

### Die Seite lädt, aber Raum erstellen oder Joinen geht nicht

Dann läuft meistens der Server auf `2567` nicht sauber oder der Dev-Server wurde nicht korrekt gestartet.

### Ein Freund kommt nach Spielstart nicht mehr rein

Das ist aktuell so vorgesehen.
Nach Spielstart sind neue normale Joins gesperrt. Nur Reconnect geht noch.

### Der Raum ist voll

Maximal 4 Spieler oder Bots zusammen.

## Hinweise für Weiterentwicklung

* Neue Regeln immer zuerst in `shared/src/rules.ts` ergänzen
* Der Server muss neue Regeln immer erneut validieren
* Die UI darf gültige Züge anzeigen, aber nie die Quelle der Wahrheit sein
* Bei neuen sichtbaren Features diese README aktualisieren

