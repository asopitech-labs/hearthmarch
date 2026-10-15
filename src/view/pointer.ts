import { findPath } from "../game/path.ts";
import { getTile, humanKingdom, unitAt } from "../game/query.ts";
import type { GameState } from "../game/types.ts";

export interface TilePoint {
  x: number;
  y: number;
}

export const POINTER_NOTES = {
  water: "Water keeps its own counsel.",
  blocked: "No path there.",
} as const;

/**
 * Left click selects one of your marchers, or clears the selection on open ground.
 * It does not issue an order. StarCraft II and Age of Empires IV both use the
 * left button to select and the right button to command.
 */
export function interpretSelectClick(
  state: GameState,
  tile: TilePoint | null,
): { kind: "select"; unitId: number } | { kind: "clear" } | { kind: "none" } {
  if (state.status !== "playing") return { kind: "none" };
  if (!tile) return { kind: "clear" };
  const occupant = unitAt(state, tile.x, tile.y);
  const human = humanKingdom(state);
  if (occupant && human && occupant.kingdomId === human.id) {
    return { kind: "select", unitId: occupant.id };
  }
  return { kind: "clear" };
}

/**
 * Right click sends the current selection. Does not change the match;
 * the view applies an order with orderUnits.
 */
export function interpretOrderClick(
  state: GameState,
  selectedIds: number[],
  tile: TilePoint | null,
): { kind: "order"; x: number; y: number } | { kind: "note"; text: string } | { kind: "none" } {
  if (!tile || state.status !== "playing" || selectedIds.length === 0) return { kind: "none" };
  const human = humanKingdom(state);
  if (!human?.alive) return { kind: "none" };
  const ground = getTile(state, tile.x, tile.y);
  if (!ground || ground.terrain === "water") {
    return { kind: "note", text: POINTER_NOTES.water };
  }
  const selected = selectedIds
    .map((id) => state.units.find((unit) => unit.id === id))
    .filter((unit) => unit && unit.kingdomId === human.id);
  if (selected.length === 0) return { kind: "none" };
  const reachable = selected.some((unit) => {
    if (!unit) return false;
    if (unit.x === tile.x && unit.y === tile.y) return true;
    return findPath(state, unit, tile) !== null;
  });
  if (!reachable) return { kind: "note", text: POINTER_NOTES.blocked };
  return { kind: "order", x: tile.x, y: tile.y };
}
