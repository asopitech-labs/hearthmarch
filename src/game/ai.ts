import { levy, setPathTo } from "./commands.ts";
import { HEARTH_BONUS, LEVY_COST, RITE_COST_SMALL, SPAWN_AT } from "./config.ts";

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

/** A friend this close to the enemy cottage calls the rest of the army in. */
const SIEGE_CALL = 6;

function orthogonalTo(unit: Unit, tile: Tile): boolean {
  return Math.abs(unit.x - tile.x) + Math.abs(unit.y - tile.y) === 1;
}

function adjacentAllies(state: GameState, unit: Unit, hearth: Tile): Unit[] {
  const allies: Unit[] = [];
  for (const [dx, dy] of DIRS) {
    const ally = unitAt(state, hearth.x + dx, hearth.y + dy);
    if (!ally || ally.id === unit.id || ally.kingdomId !== unit.kingdomId) continue;
    allies.push(ally);
  }
  return allies;
}

/** Step onto the cottage only when the company already at the door can break it. */
function shouldStorm(state: GameState, unit: Unit, hearth: Tile): boolean {
  if (!orthogonalTo(unit, hearth)) return false;
  const defender = unitAt(state, hearth.x, hearth.y);
  if (!defender || defender.kingdomId === unit.kingdomId) return true;
  const allies = adjacentAllies(state, unit, hearth);
  const assault = unit.strength + allies.reduce((sum, ally) => sum + ally.strength, 0);
  const defense = defender.strength + (hearth.ownerId === defender.kingdomId ? HEARTH_BONUS : 0);
  if (assault <= defense) return false;
  const company = [unit, ...allies].sort((a, b) => b.strength - a.strength || a.seq - b.seq);
  return company[0]?.id === unit.id;
}

function siegeCalled(state: GameState, unit: Unit, hearth: Tile): boolean {
  return state.units.some(
    (mate) => mate.kingdomId === unit.kingdomId && manhattan(mate, hearth) <= SIEGE_CALL,
  );
}

/** The weakest marcher keeps the home cottage once a siege has been called. */
function isHomeGuard(state: GameState, unit: Unit): boolean {
  const mates = unitsOf(state, unit.kingdomId);
  if (mates.length < 3) return false;
  const weakest = mates.slice().sort((a, b) => a.strength - b.strength || b.seq - a.seq)[0];
  return weakest?.id === unit.id;
}

function siegeDestination(
  state: GameState,
  unit: Unit,
  hearth: Tile,
): { x: number; y: number } | null {
  if (shouldStorm(state, unit, hearth)) return { x: hearth.x, y: hearth.y };
  if (orthogonalTo(unit, hearth)) return null;
  for (const [dx, dy] of DIRS) {
    const tile = getTile(state, hearth.x + dx, hearth.y + dy);
    if (!tile || tile.terrain === "water") continue;
    const occupant = unitAt(state, tile.x, tile.y);
    if (occupant && occupant.id !== unit.id) continue;
    return { x: tile.x, y: tile.y };
  }
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

  const enemyHearth = nearestEnemyHearth(state, unit);
  const called = enemyHearth ? siegeCalled(state, unit, enemyHearth) : false;
  if (called && isHomeGuard(state, unit)) {
    const home = ownHearth(state, unit);
    if (home && (unit.x !== home.x || unit.y !== home.y)) return { x: home.x, y: home.y };
    return null;
  }

  const nearby = state.units
    .filter((other) => other.kingdomId !== unit.kingdomId && manhattan(other, unit) <= 5)
    .sort((a, b) => manhattan(a, unit) - manhattan(b, unit) || a.strength - b.strength);
  const threat = nearby.find((other) => unit.strength + 1 >= other.strength);
  if (threat) {
    const ground = getTile(state, threat.x, threat.y);
    const cottage = ground?.isHearth && ground.ownerId === threat.kingdomId ? ground : null;
    if (!cottage || shouldStorm(state, unit, cottage)) return { x: threat.x, y: threat.y };
  }

  if ((vanguard || called) && enemyHearth) {
    return siegeDestination(state, unit, enemyHearth);
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
