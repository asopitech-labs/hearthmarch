import { LEVY_COST, LEVY_STRENGTH, MAX_UNITS, MOVE_MS } from "./config.ts";
import { pushLog } from "./log.ts";
import { findPath } from "./path.ts";
import { DIRS, getTile, kingdomById, unitAt, unitsOf } from "./query.ts";
import type { GameState, Tile, Unit } from "./types.ts";

export function setTax(state: GameState, kingdomId: string, rate: number): void {
  if (state.status !== "playing") return;
  const kingdom = kingdomById(state, kingdomId);
  if (!kingdom || kingdom.controlledBy !== "human" || !kingdom.alive) return;
  const clamped = Math.min(30, Math.max(0, Math.round(rate)));
  kingdom.taxRate = Number.isFinite(clamped) ? clamped : kingdom.taxRate;
}

export function setPathTo(
  state: GameState,
  unit: Unit,
  dest: { x: number; y: number },
  options?: { eager?: boolean },
): boolean {
  if (state.status !== "playing") return false;
  const tile = getTile(state, dest.x, dest.y);
  if (!tile || tile.terrain === "water") return false;
  if (unit.x === dest.x && unit.y === dest.y) {
    unit.path = [];
    return true;
  }
  const path = findPath(state, unit, dest);
  if (!path) return false;
  unit.path = path;
  unit.waitSteps = 0;
  if (options?.eager) unit.moveMs = Math.max(unit.moveMs, MOVE_MS);
  return true;
}

export function orderUnit(state: GameState, unitId: number, x: number, y: number): boolean {
  return orderUnits(state, [unitId], x, y) > 0;
}

/**
 * Send several marchers toward one tile. They land on that tile and the
 * open ground beside it, so they do not all try to stand on the same square.
 */
export function orderUnits(state: GameState, unitIds: number[], x: number, y: number): number {
  const tile = getTile(state, x, y);
  if (!tile || tile.terrain === "water" || state.status !== "playing") return 0;
  const spots = landingSpots(state, x, y, unitIds.length);
  let sent = 0;
  for (let index = 0; index < unitIds.length; index++) {
    const unit = state.units.find((candidate) => candidate.id === unitIds[index]);
    if (!unit) continue;
    const kingdom = kingdomById(state, unit.kingdomId);
    if (!kingdom || kingdom.controlledBy !== "human" || !kingdom.alive) continue;
    const spot = spots[index] ?? tile;
    if (setPathTo(state, unit, spot, { eager: true })) sent += 1;
  }
  return sent;
}

function landingSpots(state: GameState, x: number, y: number, count: number): Tile[] {
  const spots: Tile[] = [];
  const seen = new Set<string>([`${x},${y}`]);
  const queue: Array<{ x: number; y: number }> = [{ x, y }];
  while (queue.length > 0 && spots.length < count) {
    const current = queue.shift();
    if (!current) break;
    const tile = getTile(state, current.x, current.y);
    if (tile && tile.terrain !== "water") spots.push(tile);
    for (const [dx, dy] of DIRS) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      const key = `${nx},${ny}`;
      if (seen.has(key)) continue;
      const next = getTile(state, nx, ny);
      if (!next || next.terrain === "water") continue;
      seen.add(key);
      queue.push({ x: nx, y: ny });
    }
  }
  return spots;
}

export function findSpawnTile(
  state: GameState,
  kingdomId: string,
): { x: number; y: number } | null {
  const hearth = state.tiles.find((tile) => tile.isHearth && tile.ownerId === kingdomId);
  if (!hearth) return null;
  const queue: Tile[] = [hearth];
  const seen = new Set<string>([`${hearth.x},${hearth.y}`]);
  while (queue.length > 0) {
    const tile = queue.shift();
    if (!tile) break;
    if (tile.terrain !== "water" && tile.ownerId === kingdomId && !unitAt(state, tile.x, tile.y)) {
      return { x: tile.x, y: tile.y };
    }
    for (const [dx, dy] of DIRS) {
      const next = getTile(state, tile.x + dx, tile.y + dy);
      if (!next) continue;
      const key = `${next.x},${next.y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (next.ownerId === kingdomId && next.terrain !== "water") queue.push(next);
    }
  }
  return null;
}

export function canLevy(state: GameState, kingdomId: string): boolean {
  if (state.status !== "playing") return false;
  const kingdom = kingdomById(state, kingdomId);
  if (!kingdom || !kingdom.alive) return false;
  if (kingdom.gold < LEVY_COST) return false;
  if (unitsOf(state, kingdomId).length >= MAX_UNITS) return false;
  return findSpawnTile(state, kingdomId) !== null;
}

export function trySpawn(state: GameState, kingdomId: string, strength: number): Unit | null {
  const kingdom = kingdomById(state, kingdomId);
  if (!kingdom?.alive || state.status !== "playing") return null;
  if (unitsOf(state, kingdomId).length >= MAX_UNITS) return null;
  const spot = findSpawnTile(state, kingdomId);
  if (!spot) return null;
  const seq = state.nextSeq++;
  const unit: Unit = {
    id: seq,
    seq,
    kingdomId,
    x: spot.x,
    y: spot.y,
    strength,
    path: [],
    moveMs: (seq * 137) % MOVE_MS,
    waitSteps: 0,
  };
  state.units.push(unit);
  return unit;
}

export function levy(state: GameState, kingdomId: string): boolean {
  if (!canLevy(state, kingdomId)) return false;
  const kingdom = kingdomById(state, kingdomId);
  if (!kingdom) return false;
  kingdom.gold -= LEVY_COST;
  const unit = trySpawn(state, kingdomId, LEVY_STRENGTH);
  if (!unit) {
    kingdom.gold += LEVY_COST;
    return false;
  }
  pushLog(state, "log.levy", { kingdom: kingdom.id });
  state.flashes.push({ x: unit.x, y: unit.y, ms: 720, kind: "spawn" });
  return true;
}
