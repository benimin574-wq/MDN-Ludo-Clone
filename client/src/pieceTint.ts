import { useEffect, useMemo, useState } from "react";
import { COLOR_META } from "../../shared/src/constants";
import type { PlayerColor, PlayerState } from "../../shared/src/types";
import { pieceAssets } from "./assets";

type PieceTintOwner = Pick<PlayerState, "color" | "customColor">;

const tintedPieceCache = new Map<string, string>();
const pendingTintLoads = new Map<string, Promise<string>>();
const PIECE_SOURCE_COLOR: Record<PlayerColor, PlayerColor> = {
  red: "red",
  pink: "red",
  violet: "blue",
  blue: "blue",
  teal: "blue",
  green: "green",
  yellow: "yellow",
  orange: "yellow",
};

export function useTintedPieceAssets(players: readonly PieceTintOwner[]): void {
  const [, refresh] = useState(0);
  const colorSignature = useMemo(
    () => players.map((player) => `${player.color}:${getTargetHex(player.color, player.customColor)}`).join("|"),
    [players],
  );

  useEffect(() => {
    const requests = players
      .map((player) => ({
        color: player.color,
        targetHex: getTargetHex(player.color, player.customColor),
      }))
      .filter(({ color, targetHex }) => targetHex !== getBaseHex(color));

    if (requests.length === 0) {
      return undefined;
    }

    let active = true;
    void Promise.all(requests.map(({ color, targetHex }) => ensureTintedPieceAsset(color, targetHex))).then(() => {
      if (active) {
        refresh((version) => version + 1);
      }
    });

    return () => {
      active = false;
    };
  }, [colorSignature]);
}

export function getPieceAssetForColor(color: PlayerColor, visualHex: string): string {
  const targetHex = getTargetHex(color, visualHex);
  if (targetHex === getBaseHex(color)) {
    return pieceAssets[color];
  }

  return tintedPieceCache.get(getCacheKey(color, targetHex)) || pieceAssets[color];
}

async function ensureTintedPieceAsset(color: PlayerColor, visualHex: string): Promise<string> {
  const targetHex = getTargetHex(color, visualHex);
  if (targetHex === getBaseHex(color)) {
    return pieceAssets[color];
  }

  const cacheKey = getCacheKey(color, targetHex);
  const cached = tintedPieceCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const pending = pendingTintLoads.get(cacheKey);
  if (pending) {
    return pending;
  }

  const load = fetch(pieceAssets[color])
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Unable to load piece asset: ${response.status}`);
      }
      return response.text();
    })
    .then((svgSource) => {
      const tintedSvg = tintPieceSvg(svgSource, targetHex);
      const dataUri = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(tintedSvg)}`;
      tintedPieceCache.set(cacheKey, dataUri);
      return dataUri;
    })
    .catch(() => pieceAssets[color])
    .finally(() => {
      pendingTintLoads.delete(cacheKey);
    });

  pendingTintLoads.set(cacheKey, load);
  return load;
}

function getCacheKey(color: PlayerColor, targetHex: string): string {
  return `${color}:${targetHex}`;
}

function getTargetHex(color: PlayerColor, value: unknown): string {
  return normalizeHexColor(value, getBaseHex(color));
}

function getBaseHex(color: PlayerColor): string {
  return COLOR_META[PIECE_SOURCE_COLOR[color]].hex.toLowerCase();
}

function tintPieceSvg(svgSource: string, targetHex: string): string {
  return svgSource.replace(/fill="(#[0-9a-f]{6})"/gi, (match, fillColor: string) => {
    const source = hexToRgb(fillColor);
    const max = Math.max(source.r, source.g, source.b);
    const min = Math.min(source.r, source.g, source.b);
    const lightness = (max + min) / 510;
    const saturation = max === 0 ? 0 : (max - min) / max;

    if (lightness > 0.84 && saturation < 0.18) {
      return match;
    }

    const shadedHex = lightness < 0.5
      ? mixHex(targetHex, "#050505", (0.5 - lightness) * 0.85)
      : mixHex(targetHex, "#ffffff", (lightness - 0.5) * 0.7);

    return `fill="${shadedHex}"`;
  });
}

function normalizeHexColor(value: unknown, fallback: string): string {
  const color = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : fallback;
}

function mixHex(hex: string, targetHex: string, targetWeight: number): string {
  const source = hexToRgb(hex);
  const target = hexToRgb(targetHex);
  const weight = Math.min(1, Math.max(0, targetWeight));
  return rgbToHex({
    r: Math.round(source.r * (1 - weight) + target.r * weight),
    g: Math.round(source.g * (1 - weight) + target.g * weight),
    b: Math.round(source.b * (1 - weight) + target.b * weight),
  });
}

function hexToRgb(hex: string) {
  const normalized = hex.replace("#", "");
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }: { r: number; g: number; b: number }): string {
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}
