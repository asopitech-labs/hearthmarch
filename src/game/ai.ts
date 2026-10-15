import { levy, setPathTo } from "./commands.ts";
import { LEVY_COST, RITE_COST_SMALL, SPAWN_AT } from "./config.ts";

/** Mornings a computer captain will sit the hearth before marching out. */
const GARRISON_DAYS = 10;

/** The captain stays home until the field army is at least this large. */
const GARRISON_UNITS = 4;
import { pushLog } from "./log.ts";
import { DIRS, getTile, kingdomById, manhattan, unitAt, unitsOf } from "./query.ts";
import type { GameState, Tile, Unit } from "./types.ts";

export function decideTax(input: {
  gold: number;
  population: number;
  ownUnits: number;
  rivalUnits: number;
  faith?: number;
}): number {
  const needsBodies = input.ownUnits < 2 || input.ownUnits < input.rivalUnits;
  let rate: number;
  if (needsBodies) {
    rate = input.gold < LEVY_COST && input.population < SPAWN_AT * 0.55 ? 22 : 3;
  } else if (input.gold < LEVY_COST) {
    rate = 16;
  } else {
    rate = 9;
  }
  // A hard tax stills prayer. Once there are marchers, leave the villages
  // enough that another rite can be bought instead of going quiet.
  if (
    input.faith !== undefined &&
    input.faith < RITE_COST_SMALL &&
    input.ownUnits >= 2 &&
    rate > 8
  ) {
    return 8;
  }
  return rate;
}

function isVanguard(state: GameState, unit: Unit): boolean {
  let best: Unit | null = null;
  for (const mate of state.units) {
    if (mate.kingdomId !== unit.kingdomId) continue;
    if (
      !best ||
      mate.strength > best.strength ||
      (mate.strength === best.strength && mate.seq < best.seq)
    ) {
      best = mate;
    }
  }
  return best?.id === unit.id;
}

function ownHearth(state: GameState, unit: Unit): Tile | null {
  return state.tiles.find((tile) => tile.isHearth && tile.ownerId === unit.kingdomId) ?? null;
}

function nearestEnemyHearth(state: GameState, unit: Unit): Tile | null {
  let best: Tile | null = null;
  let bestDistance = Infinity;
  for (const tile of state.tiles) {
    if (!tile.isHearth || !tile.ownerId || tile.ownerId === unit.kingdomId) continue;
    const owner = kingdomById(state, tile.ownerId);
    if (!owner?.alive) continue;
    const distance = manhattan(unit, tile);
    if (distance < bestDistance) {
      best = tile;
      bestDistance = distance;
    }
  }
  return best;
}

function touchesOwner(state: GameState, tile: Tile, kingdomId: string): boolean {
  for (const [dx, dy] of DIRS) {
    const neighbor = getTile(state, tile.x + dx, tile.y + dy);
    if (neighbor?.ownerId === kingdomId) return true;
  }
  return false;
}

function nearestFrontier(
  state: GameState,
  unit: Unit,
): { x: number; y: number } | null {
  const hearth = nearestEnemyHearth(state, unit);
  let best: { x: number; y: number; score: number } | null = null;
  for (const tile of state.tiles) {
    if (tile.terrain === "water") continue;
    if (tile.ownerId === unit.kingdomId) continue;
    if (!touchesOwner(state, tile, unit.kingdomId)) continue;
    const occupant = unitAt(state, tile.x, tile.y);
    if (occupant && occupant.kingdomId === unit.kingdomId) continue;
    const distance = manhattan(unit, tile);
    const hearthDistance = hearth ? manhattan(tile, hearth) : 0;
    const score = hearthDistance * 3 + distance * 0.25 - (tile.ownerId ? 1 : 0);
    if (!best || score < best.score) best = { x: tile.x, y: tile.y, score };
  }
  if (best) return { x: best.x, y: best.y };
  if (hearth) return { x: hearth.x, y: hearth.y };
  return null;
}

/** Where this computer marcher should walk next. Null means hold. */
export function chooseMarchTarget(
  state: GameState,
  unit: Unit,
): { x: number; y: number } | null {
  const kingdom = kingdomById(state, unit.kingdomId);
  if (!kingdom?.alive) return null;

  const vanguard = isVanguard(state, unit);
  if (vanguard && unitsOf(state, unit.kingdomId).length < GARRISON_UNITS && state.day < GARRISON_DAYS) {
    const home = ownHearth(state, unit);
    if (home && (unit.x !== home.x || unit.y !== home.y)) return { x: home.x, y: home.y };
    return null;
  }

  const nearby = state.units
    .filter((other) => other.kingdomId !== unit.kingdomId && manhattan(other, unit) <= 5)
    .sort((a, b) => manhattan(a, unit) - manhattan(b, unit) || a.strength - b.strength);
  const threat = nearby.find((other) => unit.strength + 1 >= other.strength);
  if (threat) return { x: threat.x, y: threat.y };

  if (vanguard) {
    const hearth = nearestEnemyHearth(state, unit);
    if (hearth) return { x: hearth.x, y: hearth.y };
  }

  return nearestFrontier(state, unit);
}

export function runAi(state: GameState, kingdomId: string): void {
  const kingdom = kingdomById(state, kingdomId);
  if (!kingdom || !kingdom.alive || kingdom.controlledBy !== "cpu") return;
  if (state.status !== "playing") return;

  const own = unitsOf(state, kingdomId);
  const rivalUnits = state.units.filter((unit) => {
    if (unit.kingdomId === kingdomId) return false;
    return kingdomById(state, unit.kingdomId)?.alive;
  }).length;

  const nextTax = decideTax({
    gold: kingdom.gold,
    population: kingdom.population,
    ownUnits: own.length,
    rivalUnits,
    faith: kingdom.faith,
  });
  if (nextTax !== kingdom.taxRate) {
    kingdom.taxRate = nextTax;
    pushLog(state, "log.tax", { kingdom: kingdom.id, percent: nextTax });
  }

  if (kingdom.gold >= LEVY_COST && own.length < rivalUnits) {
    levy(state, kingdomId);
  }

  for (const unit of unitsOf(state, kingdomId)) {
    if (unit.path.length > 0) continue;
    const dest = chooseMarchTarget(state, unit);
    if (!dest || (dest.x === unit.x && dest.y === unit.y)) continue;
    setPathTo(state, unit, dest);
  }
}
