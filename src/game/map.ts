import type { Terrain, Tile } from "./types.ts";

/** Wide enough that a march between the hearths is a long part of the match. */
export const MAP_WIDTH = 64;
export const MAP_HEIGHT = 36;

export const PLAYER_HEARTH = { x: 5, y: 18 };
export const CPU_HEARTH = { x: 58, y: 18 };

const RIVER_X0 = 31;
const RIVER_X1 = 33;

function inEllipse(
  x: number,
  y: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): boolean {
  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  return dx * dx + dy * dy <= 1;
}

function nearHearth(x: number, y: number): boolean {
  const player = Math.abs(x - PLAYER_HEARTH.x) + Math.abs(y - PLAYER_HEARTH.y);
  const cpu = Math.abs(x - CPU_HEARTH.x) + Math.abs(y - CPU_HEARTH.y);
  return player <= 4 || cpu <= 4;
}

function isFord(x: number, y: number): boolean {
  if (x < RIVER_X0 - 1 || x > RIVER_X1 + 1) return false;
  return (y >= 7 && y <= 9) || (y >= 26 && y <= 28);
}

function isRiver(x: number, y: number): boolean {
  return x >= RIVER_X0 && x <= RIVER_X1 && !isFord(x, y);
}

function isPond(x: number, y: number): boolean {
  if (x >= 10 && x <= 11 && y >= 24 && y <= 25) return true;
  if (x >= 50 && x <= 51 && y >= 11 && y <= 12) return true;
  return false;
}

function isLake(x: number, y: number): boolean {
  return inEllipse(x, y, 16, 8, 6, 4) || inEllipse(x, y, 47, 28, 7, 4.2);
}

function isWater(x: number, y: number): boolean {
  if (nearHearth(x, y) || isFord(x, y)) return false;
  return isRiver(x, y) || isLake(x, y) || isPond(x, y);
}

function isWood(x: number, y: number): boolean {
  if (isWater(x, y) || nearHearth(x, y) || isFord(x, y)) return false;
  if (y % 8 === 3 && x % 3 !== 0) return true;
  if ((x * 3 + y * 5) % 17 === 0) return true;
  return false;
}

export function buildMarsh(): { width: number; height: number; tiles: Tile[] } {
  const tiles: Tile[] = [];
  for (let y = 0; y < MAP_HEIGHT; y++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      let terrain: Terrain = "meadow";
      if (isWater(x, y)) terrain = "water";
      else if (isWood(x, y)) terrain = "wood";
      const isHearth =
        (x === PLAYER_HEARTH.x && y === PLAYER_HEARTH.y) ||
        (x === CPU_HEARTH.x && y === CPU_HEARTH.y);
      if (isHearth) terrain = "meadow";
      tiles.push({ x, y, terrain, ownerId: null, isHearth });
    }
  }
  return { width: MAP_WIDTH, height: MAP_HEIGHT, tiles };
}
