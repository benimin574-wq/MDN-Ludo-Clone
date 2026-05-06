import bluePiece from "../../assets/Blauer Spielstein auf weißem Hintergrund.svg";
import yellowPiece from "../../assets/Gelbes Spielstein auf weißem Hintergrund.svg";
import greenPiece from "../../assets/Grüner Schachfigur mit glänzender Oberfläche.svg";
import boardImage from "../../assets/Mensch ärgere dich nicht Spielbrett.svg";
import redPiece from "../../assets/Roter Spielstein auf weißem Hintergrund.svg";
import type { PlayerColor } from "../../shared/src/types";

export const boardAsset = boardImage;

const silentAudio =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=";

export const pieceAssets: Record<PlayerColor, string> = {
  red: redPiece,
  pink: redPiece,
  violet: bluePiece,
  blue: bluePiece,
  teal: bluePiece,
  green: greenPiece,
  yellow: yellowPiece,
  orange: yellowPiece,
};

export const musicAssets = [
  { title: "Audio optional", artist: "Lokale Dateien fehlen", src: silentAudio },
];

export const soundAssets = {
  coolClick: silentAudio,
  gameStart: silentAudio,
  modernSelect: silentAudio,
  mouseClose: silentAudio,
  selectClick: silentAudio,
  victory: silentAudio,
  win: silentAudio,
};
