import bluePiece from "../../assets/Blauer Spielstein auf weißem Hintergrund.svg";
import boardImage from "../../assets/Mensch ärgere dich nicht Spielbrett.svg";
import greenPiece from "../../assets/Grüner Schachfigur mit glänzender Oberfläche.svg";
import redPiece from "../../assets/Roter Spielstein auf weißem Hintergrund.svg";
import yellowPiece from "../../assets/Gelbes Spielstein auf weißem Hintergrund.svg";
import type { PlayerColor } from "../../shared/src/types";

export const boardAsset = boardImage;

export const pieceAssets: Record<PlayerColor, string> = {
  blue: bluePiece,
  yellow: yellowPiece,
  green: greenPiece,
  red: redPiece,
};
