import bluePiece from "../../assets/Blauer Spielstein auf weißem Hintergrund.svg";
import bluePieceRaw from "../../assets/Blauer Spielstein auf weißem Hintergrund.svg?raw";
import yellowPiece from "../../assets/Gelbes Spielstein auf weißem Hintergrund.svg";
import yellowPieceRaw from "../../assets/Gelbes Spielstein auf weißem Hintergrund.svg?raw";
import greenPiece from "../../assets/Grüner Schachfigur mit glänzender Oberfläche.svg";
import greenPieceRaw from "../../assets/Grüner Schachfigur mit glänzender Oberfläche.svg?raw";
import boardImage from "../../assets/Mensch ärgere dich nicht Spielbrett.svg";
import redPiece from "../../assets/Roter Spielstein auf weißem Hintergrund.svg";
import redPieceRaw from "../../assets/Roter Spielstein auf weißem Hintergrund.svg?raw";
import musicLifeBeautiful from "../../assets/music/Aylex - Life is Beautiful (freetouse.com).mp3";
import musicPureDream from "../../assets/music/Kashia - Pure Dream (freetouse.com).mp3";
import musicDonut from "../../assets/music/Lukrembo - Donut (freetouse.com).mp3";
import musicCharmed from "../../assets/music/Pufino - Charmed (freetouse.com).mp3";
import musicEnlivening from "../../assets/music/Pufino - Enlivening (freetouse.com).mp3";
import musicFantasy from "../../assets/music/Pufino - Fantasy (freetouse.com).mp3";
import soundGameStart from "../../assets/sounds/foxboytails-game-start-317318.mp3";
import soundCoolClick from "../../assets/sounds/mixkit-cool-interface-click-tone-2568.wav";
import soundModernSelect from "../../assets/sounds/mixkit-modern-technology-select-3124.wav";
import soundMouseClose from "../../assets/sounds/mixkit-mouse-click-close-1113.wav";
import soundSelectClick from "../../assets/sounds/mixkit-select-click-1109.wav";
import soundVictory from "../../assets/sounds/mrstokes302-you-win-sfx-442128.mp3";
import soundWin from "../../assets/sounds/superpuyofans1234-winner-game-sound-404167.mp3";
import type { PlayerColor } from "../../shared/src/types";

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

export const musicAssets = [
  { title: "Life is Beautiful", artist: "Aylex", src: musicLifeBeautiful },
  { title: "Pure Dream", artist: "Kashia", src: musicPureDream },
  { title: "Donut", artist: "Lukrembo", src: musicDonut },
  { title: "Charmed", artist: "Pufino", src: musicCharmed },
  { title: "Fantasy", artist: "Pufino", src: musicFantasy },
  { title: "Enlivening", artist: "Pufino", src: musicEnlivening },
];

export const soundAssets = {
  coolClick: soundCoolClick,
  gameStart: soundGameStart,
  modernSelect: soundModernSelect,
  mouseClose: soundMouseClose,
  selectClick: soundSelectClick,
  victory: soundVictory,
  win: soundWin,
};
