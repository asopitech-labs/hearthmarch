import { findPath } from "../game/path.ts";
import { getTile, humanKingdom, kingdomById, unitAt } from "../game/query.ts";
import type { GameState } from "../game/types.ts";

export interface TilePoint {
  x: number;
  y: number;
}

export type PointerIntent =
  | { kind: "select"; unitId: number }
  | { kind: "order"; unitId: number; x: number; y: number }
  | { kind: "note"; text: string }
  | { kind: "none" };

export const POINTER_NOTES = {
  water: "Water keeps its own counsel.",
  blocked: "No path there.",
} as const;

/**
 * Decides what a left click on a tile means. Does not change the match.
 * The view applies an "order" with orderUnit.
 */
export function interpretTileClick(
  state: GameState,
  selectedId: number | null,
  tile: TilePoint | null,
): PointerIntent {
  if (!tile || state.status !== "playing") return { kind: "none" };

  const occupant = unitAt(state, tile.x, tile.y);
  const human = humanKingdom(state);
  if (occupant && human && occupant.kingdomId === human.id) {
    return { kind: "select", unitId: occupant.id };
  }

  if (selectedId === null) return { kind: "none" };
  const unit = state.units.find((candidate) => candidate.id === selectedId);
  if (!unit) return { kind: "none" };
  const kingdom = kingdomById(state, unit.kingdomId);
  if (!kingdom || kingdom.controlledBy !== "human" || !kingdom.alive) return { kind: "none" };

  const ground = getTile(state, tile.x, tile.y);
  if (!ground || ground.terrain === "water") {
    return { kind: "note", text: POINTER_NOTES.water };
  }
  if (unit.x === tile.x && unit.y === tile.y) {
    return { kind: "order", unitId: unit.id, x: tile.x, y: tile.y };
  }
  if (!findPath(state, unit, tile)) {
    return { kind: "note", text: POINTER_NOTES.blocked };
  }
  return { kind: "order", unitId: unit.id, x: tile.x, y: tile.y };
}
