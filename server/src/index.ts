import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import path from "node:path";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { MenschRoom } from "./rooms/MenschRoom";

const port = Number(process.env.PORT || 2567);
const app = express();

app.use(cors());
app.use(express.json());
app.get("/health", (_request, response) => {
  response.json({
    ok: true,
    game: "Mensch ärgere dich nicht",
    room: "mensch",
  });
});

const clientDistPath = process.env.CLIENT_DIST_PATH || path.join(process.cwd(), "dist", "client");
const clientIndexPath = path.join(clientDistPath, "index.html");

if (existsSync(clientIndexPath)) {
  app.use(express.static(clientDistPath));
  app.use((request, response, next) => {
    if (request.path.startsWith("/matchmake")) {
      next();
      return;
    }

    response.sendFile(clientIndexPath);
  });
} else {
  app.get("/", (_request, response) => {
    response.json({
      ok: true,
      game: "Mensch ärgere dich nicht",
      room: "mensch",
      client: "not_built",
    });
  });
}

const server = createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({
    server,
    pingInterval: 10000,
    pingMaxRetries: 4,
  }),
});

gameServer.define("mensch", MenschRoom);

gameServer.listen(port);
console.log(`Colyseus Server läuft auf ws://localhost:${port}`);
