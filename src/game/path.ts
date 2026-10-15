import { DIRS, getTile, unitAt } from "./query.ts";
import type { GameState, Unit } from "./types.ts";

function keyOf(x: number, y: number): string {
  return `${x},${y}`;
}

/**
 * Four-direction path that avoids water and friendly marchers.
 * Enemy marchers are walkable: stepping onto them starts a skirmish.
 * Returns the steps after the unit's current tile, or null when no road exists.
 */
export function findPath(
  state: GameState,
  unit: Unit,
  dest: { x: number; y: number },
): Array<{ x: number; y: number }> | null {
  const goal = getTile(state, dest.x, dest.y);
  if (!goal || goal.terrain === "water") return null;
  if (unit.x === dest.x && unit.y === dest.y) return [];

  const occupant = unitAt(state, dest.x, dest.y);
  if (occupant && occupant.id !== unit.id && occupant.kingdomId === unit.kingdomId) {
    return null;
  }

  const startKey = keyOf(unit.x, unit.y);
  const goalKey = keyOf(dest.x, dest.y);
  const queue: Array<{ x: number; y: number }> = [{ x: unit.x, y: unit.y }];
  const prev = new Map<string, string | null>();
  prev.set(startKey, null);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    for (const [dx, dy] of DIRS) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      const key = keyOf(nx, ny);
      if (prev.has(key)) continue;
      const tile = getTile(state, nx, ny);
      if (!tile || tile.terrain === "water") continue;
      const blocker = unitAt(state, nx, ny);
      if (blocker && blocker.id !== unit.id && blocker.kingdomId === unit.kingdomId) continue;
      prev.set(key, keyOf(current.x, current.y));
      if (key === goalKey) return reconstruct(prev, goalKey);
      queue.push({ x: nx, y: ny });
    }
  }

  return null;
}

function reconstruct(
  prev: Map<string, string | null>,
  goalKey: string,
): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  let cursor: string | null = goalKey;
  while (cursor !== null) {
    const [xs, ys] = cursor.split(",");
    out.push({ x: Number(xs), y: Number(ys) });
    const parent: string | null = prev.get(cursor) ?? null;
    cursor = parent;
  }
  out.reverse();
  out.shift();
  return out;
}
