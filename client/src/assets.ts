import bluePiece from "../../assets/Blauer Spielstein auf weißem Hintergrund.svg";
import bluePieceRaw from "../../assets/Blauer Spielstein auf weißem Hintergrund.svg?raw";
import yellowPiece from "../../assets/Gelbes Spielstein auf weißem Hintergrund.svg";
import yellowPieceRaw from "../../assets/Gelbes Spielstein auf weißem Hintergrund.svg?raw";
import greenPiece from "../../assets/Grüner Schachfigur mit glänzender Oberfläche.svg";
import greenPieceRaw from "../../assets/Grüner Schachfigur mit glänzender Oberfläche.svg?raw";
import boardImage from "../../assets/Mensch ärgere dich nicht Spielbrett.svg";
import redPiece from "../../assets/Roter Spielstein auf weißem Hintergrund.svg";
import redPieceRaw from "../../assets/Roter Spielstein auf weißem Hintergrund.svg?raw";
import type { PlayerColor } from "../../shared/src/types";

interface MusicAsset {
  title: string;
  artist: string;
  src: string;
}

type SoundAssetKey =
  | "coolClick"
  | "gameStart"
  | "modernSelect"
  | "mouseClose"
  | "selectClick"
  | "victory"
  | "win";

export const boardAsset = boardImage;

export const pieceAssets: Record<PlayerColor, string> = {
  blue: bluePiece,
  yellow: yellowPiece,
  green: greenPiece,
  red: redPiece,
};

export const pieceSvgSources: Record<PlayerColor, string> = {
  blue: bluePieceRaw,
  yellow: yellowPieceRaw,
  green: greenPieceRaw,
  red: redPieceRaw,
};

export const musicAssets: MusicAsset[] = [];

export const soundAssets: Record<SoundAssetKey, string> = {
  coolClick: "",
  gameStart: "",
  modernSelect: "",
  mouseClose: "",
  selectClick: "",
  victory: "",
  win: "",
};
