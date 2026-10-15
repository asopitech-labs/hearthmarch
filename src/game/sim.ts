import { chooseMarchTarget, runAi } from "./ai.ts";
import {
  COMBAT_RATIO,
  DAY_MS,
  HEARTH_BONUS,
  MAX_STRENGTH,
  MAX_UNITS,
  MOVE_MS,
  REGEN,
  RITE_FIRST_MS,
  RITE_THINK_MS,
  SLICE_MS,
  SPAWN_AT,
  SPAWN_STRENGTH,
  WOOD_MOVE_MS,
} from "./config.ts";
import { setPathTo, trySpawn } from "./commands.ts";
import { dailyYield } from "./economy.ts";
import { addDawnFaith, beliefOf, considerDivine, rivalGod } from "./faith.ts";
import { pushLog } from "./log.ts";
import { buildMarsh } from "./map.ts";
import { findPath } from "./path.ts";
import { DIRS, getTile, kingdomById, territoryCount, unitAt, unitsOf } from "./query.ts";
import type { GameState, GameStatus, GodId, Kingdom, PowerId, Tile, Unit } from "./types.ts";

function claimDisk(
  tiles: Tile[],
  origin: { x: number; y: number },
  kingdomId: string,
  radius: number,
): void {
  for (const tile of tiles) {
    if (tile.terrain === "water") continue;
    const distance = Math.abs(tile.x - origin.x) + Math.abs(tile.y - origin.y);
    if (distance <= radius) tile.ownerId = kingdomId;
  }
}

function makeUnit(
  state: GameState,
  kingdomId: string,
  x: number,
  y: number,
  strength: number,
  moveMs: number,
): Unit {
  const seq = state.nextSeq++;
  const unit: Unit = {
    id: seq,
    seq,
    kingdomId,
    x,
    y,
    strength,
    path: [],
    moveMs,
    waitSteps: 0,
  };
  state.units.push(unit);
  return unit;
}

export interface SkirmishOptions {
  humanGod?: GodId;
  cpuGod?: GodId;
}

export function createSkirmish(options?: SkirmishOptions): GameState {
  const humanGod = options?.humanGod ?? "lark";
  const cpuGod = options?.cpuGod ?? rivalGod(humanGod);
  const marsh = buildMarsh();
  const { width, height, tiles } = marsh;
  const playerHearth = tiles.find((tile) => tile.isHearth && tile.x < width / 2);
  const cpuHearth = tiles.find((tile) => tile.isHearth && tile.x > width / 2);
  if (!playerHearth || !cpuHearth) throw new Error("The marsh is missing a hearth");

  claimDisk(tiles, playerHearth, "ashvale", 2);
  claimDisk(tiles, cpuHearth, "reedmoor", 2);

  const kingdoms: Kingdom[] = [
    {
      id: "ashvale",
      name: "Ashvale",
      controlledBy: "human",
      gold: 30,
      population: 18,
      taxRate: 10,
      alive: true,
      ink: "#d87a32",
      wash: "rgba(216, 122, 50, 0.4)",
      ...beliefOf(humanGod, 0),
    },
    {
      id: "reedmoor",
      name: "Reedmoor",
      controlledBy: "cpu",
      gold: 30,
      population: 18,
      taxRate: 10,
      alive: true,
      ink: "#2f8f86",
      wash: "rgba(47, 143, 134, 0.38)",
      ...beliefOf(cpuGod, RITE_FIRST_MS),
    },
  ];

  const state: GameState = {
    width,
    height,
    tiles,
    kingdoms,
    units: [],
    day: 1,
    clockMs: 0,
    status: "playing",
    winnerId: null,
    log: [],
    flashes: [],
    nextSeq: 1,
  };

  makeUnit(state, "ashvale", playerHearth.x, playerHearth.y, 13, 0);
  makeUnit(state, "ashvale", playerHearth.x + 2, playerHearth.y, 10, 220);
  makeUnit(state, "reedmoor", cpuHearth.x, cpuHearth.y, 13, 90);
  makeUnit(state, "reedmoor", cpuHearth.x - 2, cpuHearth.y, 10, 300);

  pushLog(state, "log.keeps", { human: "ashvale", humanGod, cpu: "reedmoor", cpuGod });
  runAi(state, "reedmoor");
  return state;
}

export function judge(state: GameState): GameStatus {
  const humans = state.kingdoms.filter((kingdom) => kingdom.controlledBy === "human");
  const rivals = state.kingdoms.filter((kingdom) => kingdom.controlledBy === "cpu");
  if (humans.length > 0 && humans.every((kingdom) => !kingdom.alive)) return "lost";
  if (rivals.length > 0 && rivals.every((kingdom) => !kingdom.alive)) return "won";
  return "playing";
}

function defeat(state: GameState, loserId: string, winnerId: string): void {
  const loser = kingdomById(state, loserId);
  const winner = kingdomById(state, winnerId);
  if (!loser || !winner || !loser.alive) return;
  loser.alive = false;
  const seized = loser.gold;
  loser.gold = 0;
  winner.gold += seized;
  for (const tile of state.tiles) {
    if (tile.ownerId === loserId) tile.ownerId = winnerId;
  }
  state.units = state.units.filter((unit) => unit.kingdomId !== loserId);
  pushLog(state, "log.hearth", { winner: winner.id, loser: loser.id, gold: seized });
  state.status = judge(state);
  if (state.status !== "playing") state.winnerId = winner.id;
}

function capture(state: GameState, unit: Unit, tile: Tile): void {
  if (tile.terrain === "water" || tile.ownerId === unit.kingdomId) return;
  const previous = tile.ownerId;
  const kingdom = kingdomById(state, unit.kingdomId);
  if (!kingdom) return;
  tile.ownerId = unit.kingdomId;
  state.flashes.push({ x: tile.x, y: tile.y, ms: 560, kind: "capture" });

  if (tile.isHearth && previous) {
    const loser = kingdomById(state, previous);
    if (loser?.alive) defeat(state, previous, kingdom.id);
    return;
  }

  if (previous) {
    const other = kingdomById(state, previous);
    pushLog(state, "log.ground", { kingdom: kingdom.id, other: other?.id ?? "neighbor" });
  } else if (kingdom.controlledBy === "human") {
    pushLog(state, "log.claim", { kingdom: kingdom.id });
  }
}

function removeUnit(state: GameState, unit: Unit): void {
  const index = state.units.findIndex((other) => other.id === unit.id);
  if (index >= 0) state.units.splice(index, 1);
}

/**
 * On a hearth, marchers already standing on the four neighboring tiles
 * join the blow. Lord Monarch takes a castle with one gathered body, not
 * a queue of equal duels. Open ground stays a duel.
 */
function assaultStrength(state: GameState, attacker: Unit, tile: Tile): number {
  if (!tile.isHearth) return attacker.strength;
  let assault = attacker.strength;
  for (const [dx, dy] of DIRS) {
    const ally = unitAt(state, tile.x + dx, tile.y + dy);
    if (!ally || ally.id === attacker.id || ally.kingdomId !== attacker.kingdomId) continue;
    assault += ally.strength;
  }
  return assault;
}

function hearthInvested(state: GameState, tile: Tile, kingdomId: string): boolean {
  for (const [dx, dy] of DIRS) {
    const neighbor = unitAt(state, tile.x + dx, tile.y + dy);
    if (neighbor && neighbor.kingdomId !== kingdomId) return true;
  }
  return false;
}

function fight(
  state: GameState,
  attacker: Unit,
  defender: Unit,
  tile: Tile,
): "attacker" | "defender" {
  const homeBonus = tile.isHearth && tile.ownerId === defender.kingdomId ? HEARTH_BONUS : 0;
  const defense = defender.strength + homeBonus;
  const assault = assaultStrength(state, attacker, tile);
  state.flashes.push({ x: tile.x, y: tile.y, ms: 820, kind: "combat" });
  const attackerKingdom = kingdomById(state, attacker.kingdomId);
  const defenderKingdom = kingdomById(state, defender.kingdomId);
  const attackerId = attackerKingdom?.id ?? "marcher";
  const defenderId = defenderKingdom?.id ?? "marcher";

  if (assault > defense) {
    attacker.strength = Math.max(1, Math.round(attacker.strength - defense * COMBAT_RATIO));
    removeUnit(state, defender);
    pushLog(state, "log.break", { attacker: attackerId, defender: defenderId });
    return "attacker";
  }

  defender.strength = Math.max(1, Math.round(defender.strength - assault * COMBAT_RATIO));
  removeUnit(state, attacker);
  pushLog(state, "log.hold", { defender: defenderId, attacker: attackerId });
  return "defender";
}

function onIdle(state: GameState, unit: Unit): void {
  if (!state.units.includes(unit) || unit.path.length > 0 || state.status !== "playing") return;
  const kingdom = kingdomById(state, unit.kingdomId);
  if (!kingdom || kingdom.controlledBy !== "cpu" || !kingdom.alive) return;
  const dest = chooseMarchTarget(state, unit);
  if (!dest || (dest.x === unit.x && dest.y === unit.y)) return;
  setPathTo(state, unit, dest);
}

function stepUnit(state: GameState, unit: Unit): void {
  if (!state.units.includes(unit) || unit.path.length === 0) return;
  const next = unit.path[0];
  if (!next) return;
  const tile = getTile(state, next.x, next.y);
  if (!tile || tile.terrain === "water") {
    unit.path = [];
    return;
  }

  const occupant = unitAt(state, next.x, next.y);
  if (occupant && occupant.id !== unit.id && occupant.kingdomId === unit.kingdomId) {
    unit.waitSteps += 1;
    if (unit.waitSteps >= 2) {
      const dest = unit.path[unit.path.length - 1];
      unit.path = dest ? (findPath(state, unit, dest) ?? []) : [];
      unit.waitSteps = 0;
    }
    return;
  }

  unit.waitSteps = 0;
  if (occupant && occupant.kingdomId !== unit.kingdomId) {
    const result = fight(state, unit, occupant, tile);
    if (result !== "attacker" || !state.units.includes(unit) || state.status !== "playing") {
      if (state.units.includes(unit)) unit.path = [];
      return;
    }
    unit.path.shift();
    unit.x = tile.x;
    unit.y = tile.y;
    capture(state, unit, tile);
    if (state.status === "playing") onIdle(state, unit);
    return;
  }

  unit.path.shift();
  unit.x = tile.x;
  unit.y = tile.y;
  capture(state, unit, tile);
  if (state.status === "playing") onIdle(state, unit);
}

/** Pay taxes, grow villages, muster marchers, and let each computer kingdom think. */
export function applyDawn(state: GameState): void {
  if (state.status !== "playing") return;
  state.day += 1;

  for (const kingdom of state.kingdoms) {
    if (!kingdom.alive) continue;
    addDawnFaith(kingdom);
    const tiles = territoryCount(state, kingdom.id);
    const gained = dailyYield(tiles, kingdom.taxRate);
    kingdom.gold += gained.gold;

    for (const unit of unitsOf(state, kingdom.id)) {
      const tile = getTile(state, unit.x, unit.y);
      if (!tile || tile.ownerId !== kingdom.id || unit.strength >= MAX_STRENGTH) continue;
      if (tile.isHearth && hearthInvested(state, tile, kingdom.id)) continue;
      unit.strength += REGEN;
    }

    if (unitsOf(state, kingdom.id).length >= MAX_UNITS) {
      kingdom.population = Math.min(kingdom.population, SPAWN_AT - 1);
    } else {
      kingdom.population += gained.population;
      while (
        kingdom.population >= SPAWN_AT &&
        unitsOf(state, kingdom.id).length < MAX_UNITS &&
        state.status === "playing"
      ) {
        const spawned = trySpawn(state, kingdom.id, SPAWN_STRENGTH);
        if (!spawned) {
          kingdom.population = Math.min(kingdom.population, SPAWN_AT);
          break;
        }
        kingdom.population -= SPAWN_AT;
        pushLog(state, "log.muster", { kingdom: kingdom.id });
        state.flashes.push({ x: spawned.x, y: spawned.y, ms: 720, kind: "spawn" });
      }
    }
  }

  if (state.status !== "playing") return;
  for (const kingdom of state.kingdoms) {
    if (kingdom.alive && kingdom.controlledBy === "cpu") runAi(state, kingdom.id);
  }
}

function coolRites(state: GameState, dt: number): void {
  for (const kingdom of state.kingdoms) {
    for (const key of Object.keys(kingdom.riteWait) as PowerId[]) {
      const left = (kingdom.riteWait[key] ?? 0) - dt;
      if (left <= 0) delete kingdom.riteWait[key];
      else kingdom.riteWait[key] = left;
    }
    if (!kingdom.alive || kingdom.controlledBy !== "cpu") continue;
    kingdom.riteThinkMs -= dt;
    if (kingdom.riteThinkMs > 0) continue;
    considerDivine(state, kingdom.id);
    kingdom.riteThinkMs = RITE_THINK_MS;
  }
}

function advance(state: GameState, dt: number): void {
  for (const flash of state.flashes) flash.ms -= dt;
  state.flashes = state.flashes.filter((flash) => flash.ms > 0);
  if (state.status !== "playing") return;

  const movers = state.units.slice().sort((a, b) => a.seq - b.seq);
  for (const unit of movers) {
    if (state.status !== "playing") return;
    if (!state.units.includes(unit)) continue;
    const kingdom = kingdomById(state, unit.kingdomId);
    if (!kingdom?.alive) continue;

    const next = unit.path[0];
    const nextTile = next ? getTile(state, next.x, next.y) : null;
    const interval = nextTile?.terrain === "wood" ? WOOD_MOVE_MS : MOVE_MS;
    unit.moveMs += dt;

    if (unit.path.length === 0) {
      unit.moveMs = Math.min(unit.moveMs, interval);
      continue;
    }

    if (unit.moveMs >= interval) {
      unit.moveMs -= interval;
      stepUnit(state, unit);
    }
  }

  if (state.status !== "playing") return;
  coolRites(state, dt);
  state.clockMs += dt;
  while (state.clockMs >= DAY_MS && state.status === "playing") {
    state.clockMs -= DAY_MS;
    applyDawn(state);
  }
}

export function tick(state: GameState, dtMs: number): void {
  if (!(dtMs > 0) || state.status !== "playing") return;
  let left = dtMs;
  while (left > 0 && state.status === "playing") {
    const slice = Math.min(SLICE_MS, left);
    advance(state, slice);
    left -= slice;
  }
}
