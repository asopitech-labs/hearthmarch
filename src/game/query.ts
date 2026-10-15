import type { GameState, Kingdom, Tile, Unit } from "./types.ts";

export const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export function getTile(state: GameState, x: number, y: number): Tile | null {
  if (x < 0 || y < 0 || x >= state.width || y >= state.height) return null;
  return state.tiles[y * state.width + x] ?? null;
}

export function unitAt(state: GameState, x: number, y: number): Unit | undefined {
  return state.units.find((unit) => unit.x === x && unit.y === y);
}

export function kingdomById(state: GameState, id: string): Kingdom | undefined {
  return state.kingdoms.find((kingdom) => kingdom.id === id);
}

export function territoryCount(state: GameState, kingdomId: string): number {
  let count = 0;
  for (const tile of state.tiles) {
    if (tile.ownerId === kingdomId) count += 1;
  }
  return count;
}

export function unitsOf(state: GameState, kingdomId: string): Unit[] {
  return state.units.filter((unit) => unit.kingdomId === kingdomId);
}

export function humanKingdom(state: GameState): Kingdom | undefined {
  return state.kingdoms.find((kingdom) => kingdom.controlledBy === "human");
}

export function rivalKingdoms(state: GameState): Kingdom[] {
  return state.kingdoms.filter((kingdom) => kingdom.controlledBy === "cpu");
}

export function manhattan(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}
