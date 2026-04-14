import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { Server } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import { MenschRoom } from "./rooms/MenschRoom";

const port = Number(process.env.PORT || 2567);
const app = express();

app.use(cors());
app.use(express.json());
app.get("/", (_request, response) => {
  response.json({
    ok: true,
    game: "Mensch ärgere dich nicht",
    room: "mensch",
  });
});

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
