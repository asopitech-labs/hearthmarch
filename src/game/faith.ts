import {
  FAITH_CAP,
  FAITH_PER_VILLAGER,
  RITE_COOLDOWN_MS,
  RITE_COST_GREAT,
  RITE_COST_MID,
  RITE_COST_SMALL,
  RITE_FIRST_MS,
  STARTING_FAITH,
  TAX_MAX,
  WARMTH,
  WOUND_CINDER,
  WOUND_TREMOR,
  WOUND_UNDERTOW,
  MAX_STRENGTH,
} from "./config.ts";
import { clampTax } from "./economy.ts";
import { pushLog } from "./log.ts";
import { DIRS, getTile, kingdomById, manhattan, unitAt, unitsOf } from "./query.ts";
import type { GameState, GodId, Kingdom, PowerId, Tile, Unit } from "./types.ts";

export interface GodDef {
  id: GodId;
  name: string;
  title: string;
  creed: string;
  powers: PowerDef[];
}

export interface PowerDef {
  id: PowerId;
  name: string;
  cost: number;
  blurb: string;
}

export const GODS: readonly GodDef[] = [
  {
    id: "lark",
    name: "Lark",
    title: "the Open Hand",
    creed: "Meadows open, marchers take heart, and thorns slow a road.",
    powers: [
      {
        id: "seedbed",
        name: "Seedbed",
        cost: RITE_COST_SMALL,
        blurb: "A wood becomes meadow.",
      },
      {
        id: "hearthwarm",
        name: "Hearthwarm",
        cost: RITE_COST_MID,
        blurb: "One of your marchers grows stronger.",
      },
      {
        id: "briar",
        name: "Briar",
        cost: RITE_COST_GREAT,
        blurb: "A meadow grows into slowing wood.",
      },
    ],
  },
  {
    id: "kiln",
    name: "Kiln",
    title: "the Warm Stone",
    creed: "Water becomes ground, the marsh shakes, and a field can burn to scrub.",
    powers: [
      {
        id: "shore",
        name: "Shore",
        cost: RITE_COST_SMALL,
        blurb: "Water beside land becomes meadow.",
      },
      {
        id: "tremor",
        name: "Tremor",
        cost: RITE_COST_MID,
        blurb: "Marchers nearby are shaken, and the center meadow turns to wood.",
      },
      {
        id: "cinder",
        name: "Cinder",
        cost: RITE_COST_GREAT,
        blurb: "A patch scorches to wood and burns enemy marchers.",
      },
    ],
  },
  {
    id: "mere",
    name: "Mere",
    title: "the Still Water",
    creed: "A meadow can sink, a pool can be claimed, and a marcher can be drawn toward the deep.",
    powers: [
      {
        id: "cut",
        name: "Cut",
        cost: RITE_COST_SMALL,
        blurb: "A meadow sinks into water. Anyone standing there is pushed aside.",
      },
      {
        id: "drain",
        name: "Drain",
        cost: RITE_COST_MID,
        blurb: "Water touching your land becomes meadow you hold.",
      },
      {
        id: "undertow",
        name: "Undertow",
        cost: RITE_COST_GREAT,
        blurb: "An enemy marcher in the open is pulled toward water, or wounded if they cannot move.",
      },
    ],
  },
];

export function godById(id: GodId): GodDef {
  const god = GODS.find((candidate) => candidate.id === id);
  if (!god) throw new Error(`Unknown god ${id}`);
  return god;
}

export function powerById(id: PowerId): PowerDef & { godId: GodId } {
  for (const god of GODS) {
    const power = god.powers.find((candidate) => candidate.id === id);
    if (power) return { ...power, godId: god.id };
  }
  throw new Error(`Unknown rite ${id}`);
}

export function rivalGod(godId: GodId): GodId {
  if (godId === "lark") return "kiln";
  if (godId === "kiln") return "mere";
  return "lark";
}

export function beliefOf(godId: GodId, thinkMs = RITE_FIRST_MS): Pick<
  Kingdom,
  "godId" | "faith" | "riteWait" | "riteThinkMs"
> {
  return {
    godId,
    faith: STARTING_FAITH,
    riteWait: {},
    riteThinkMs: thinkMs,
  };
}

/** Faith the villages add at the next dawn. A hard tax stills the prayer. */
export function faithGain(population: number, taxRate: number): number {
  const tax = clampTax(taxRate);
  const devotion = (TAX_MAX - tax) / TAX_MAX;
  return Math.floor(Math.max(0, population) * devotion * FAITH_PER_VILLAGER);
}

export function riteFootprint(powerId: PowerId, x: number, y: number): Array<{ x: number; y: number }> {
  if (powerId === "tremor" || powerId === "cinder") {
    return [
      { x, y },
      { x: x + 1, y },
      { x: x - 1, y },
      { x, y: y + 1 },
      { x, y: y - 1 },
    ];
  }
  return [{ x, y }];
}

export interface CastFailure {
  ok: false;
  reason: string;
}

export interface CastSuccess {
  ok: true;
}

export function castPower(
  state: GameState,
  kingdomId: string,
  powerId: PowerId,
  x: number,
  y: number,
): CastSuccess | CastFailure {
  const kingdom = kingdomById(state, kingdomId);
  if (!kingdom || !kingdom.alive || state.status !== "playing") {
    return { ok: false, reason: "The prayer has nowhere to land." };
  }
  const power = powerById(powerId);
  if (power.godId !== kingdom.godId) {
    return { ok: false, reason: `${godById(kingdom.godId).name} does not answer that rite.` };
  }
  const wait = kingdom.riteWait[powerId] ?? 0;
  if (wait > 0) {
    return { ok: false, reason: `${power.name} is still settling.` };
  }
  if (kingdom.faith < power.cost) {
    return { ok: false, reason: `${power.name} wants ${power.cost} faith.` };
  }
  const reason = refuse(state, kingdom, powerId, x, y);
  if (reason) return { ok: false, reason };
  applyRite(state, kingdom, powerId, x, y);
  kingdom.faith -= power.cost;
  kingdom.riteWait[powerId] = RITE_COOLDOWN_MS;
  pushLog(state, `${kingdom.name} calls ${power.name}.`);
  for (const spot of riteFootprint(powerId, x, y)) {
    if (!getTile(state, spot.x, spot.y)) continue;
    state.flashes.push({ x: spot.x, y: spot.y, ms: 640, kind: "rite" });
  }
  return { ok: true };
}

export function chooseDivineCast(
  state: GameState,
  kingdomId: string,
): { powerId: PowerId; x: number; y: number } | null {
  const kingdom = kingdomById(state, kingdomId);
  if (!kingdom || !kingdom.alive || state.status !== "playing") return null;
  const affordable = godById(kingdom.godId).powers
    .map((power) => power.id)
    .reverse()
    .filter((powerId) => {
      const power = powerById(powerId);
      if (kingdom.faith < power.cost) return false;
      if ((kingdom.riteWait[powerId] ?? 0) > 0) return false;
      return true;
    });
  // Prefer a rite that leaves enough faith for a small one later, so the
  // bowl is not emptied by two great rites in a row.
  const reserved = affordable.filter((powerId) => {
    const cost = powerById(powerId).cost;
    return cost === RITE_COST_SMALL || kingdom.faith - cost >= RITE_COST_SMALL;
  });
  const order = reserved.length > 0 ? reserved : affordable;
  for (const powerId of order) {
    for (const spot of candidates(state, kingdom, powerId)) {
      if (!refuse(state, kingdom, powerId, spot.x, spot.y)) {
        return { powerId, x: spot.x, y: spot.y };
      }
    }
  }
  return null;
}

export function considerDivine(state: GameState, kingdomId: string): void {
  const choice = chooseDivineCast(state, kingdomId);
  if (!choice) return;
  castPower(state, kingdomId, choice.powerId, choice.x, choice.y);
}

function candidates(
  state: GameState,
  kingdom: Kingdom,
  powerId: PowerId,
): Array<{ x: number; y: number }> {
  const foes = state.units.filter((unit) => unit.kingdomId !== kingdom.id);
  const friends = unitsOf(state, kingdom.id);
  if (powerId === "hearthwarm") {
    return friends
      .filter((unit) => unit.strength < MAX_STRENGTH)
      .sort((a, b) => a.strength - b.strength)
      .map((unit) => ({ x: unit.x, y: unit.y }));
  }
  if (powerId === "seedbed") {
    return closestToEnemy(
      state,
      kingdom,
      state.tiles.filter((tile) => tile.terrain === "wood"),
    );
  }
  if (powerId === "briar") {
    return foes
      .map((unit) => getTile(state, unit.x, unit.y))
      .filter((tile): tile is Tile => !!tile && tile.terrain === "meadow" && !tile.isHearth)
      .map((tile) => ({ x: tile.x, y: tile.y }));
  }
  if (powerId === "shore") {
    const home = ownHearth(state, kingdom.id);
    return state.tiles
      .filter((tile) => tile.terrain === "water" && besideLand(state, tile))
      .sort((a, b) => (home ? manhattan(a, home) - manhattan(b, home) : 0))
      .slice(0, 16)
      .map((tile) => ({ x: tile.x, y: tile.y }));
  }
  if (powerId === "tremor" || powerId === "cinder") {
    return foes
      .filter((unit) => !onOwnHearth(state, unit))
      .map((unit) => ({ x: unit.x, y: unit.y }));
  }
  if (powerId === "cut") {
    const hearth = ownHearth(state, kingdom.id);
    return state.tiles
      .filter((tile) => tile.terrain === "meadow" && !tile.isHearth)
      .filter((tile) => !hearth || manhattan(tile, hearth) > 2)
      .filter((tile) => foes.some((unit) => manhattan(tile, unit) <= 12))
      .sort((a, b) => nearestFoe(foes, a) - nearestFoe(foes, b))
      .slice(0, 12)
      .map((tile) => ({ x: tile.x, y: tile.y }));
  }
  if (powerId === "drain") {
    return state.tiles
      .filter((tile) => tile.terrain === "water" && besideOwnLand(state, kingdom.id, tile))
      .map((tile) => ({ x: tile.x, y: tile.y }));
  }
  return foes
    .filter((unit) => !onOwnHearth(state, unit))
    .map((unit) => ({ x: unit.x, y: unit.y }));
}

function refuse(
  state: GameState,
  kingdom: Kingdom,
  powerId: PowerId,
  x: number,
  y: number,
): string | null {
  const tile = getTile(state, x, y);
  if (!tile) return "That is off the marsh.";
  if (powerId === "seedbed") {
    if (tile.terrain !== "wood") return "Seedbed wants a wood.";
    return null;
  }
  if (powerId === "hearthwarm") {
    const unit = unitAt(state, x, y);
    if (!unit || unit.kingdomId !== kingdom.id) return "Hearthwarm wants one of your marchers.";
    if (unit.strength >= MAX_STRENGTH) return "That marcher is already as strong as they can be.";
    return null;
  }
  if (powerId === "briar") {
    if (tile.isHearth) return "A hearth will not take the thorn.";
    if (tile.terrain !== "meadow") return "Briar wants an open meadow.";
    return null;
  }
  if (powerId === "shore") {
    if (tile.terrain !== "water") return "Shore wants open water.";
    if (!besideLand(state, tile)) return "That water has no shore to climb.";
    return null;
  }
  if (powerId === "tremor" || powerId === "cinder") {
    const spots = riteFootprint(powerId, x, y)
      .map((spot) => getTile(state, spot.x, spot.y))
      .filter((spot): spot is Tile => !!spot);
    const units = spots.flatMap((spot) => {
      const unit = unitAt(state, spot.x, spot.y);
      return unit ? [unit] : [];
    });
    const meadow = spots.some((spot) => !spot.isHearth && spot.terrain === "meadow");
    if (powerId === "cinder") {
      const enemy = units.some((unit) => unit.kingdomId !== kingdom.id);
      if (!enemy && !meadow) return "Cinder wants an enemy or an open meadow.";
      return null;
    }
    if (units.length === 0 && !meadow) return "Tremor wants marchers or an open meadow.";
    return null;
  }
  if (powerId === "cut") {
    if (tile.isHearth) return "A hearth will not sink.";
    if (tile.terrain !== "meadow") return "Cut wants an open meadow.";
    const unit = unitAt(state, x, y);
    if (unit && !shoveTile(state, unit)) return "Someone is standing there with nowhere to step.";
    return null;
  }
  if (powerId === "drain") {
    if (tile.terrain !== "water") return "Drain wants water.";
    if (!besideOwnLand(state, kingdom.id, tile)) return "That water does not touch your land.";
    return null;
  }
  const unit = unitAt(state, x, y);
  if (!unit || unit.kingdomId === kingdom.id) return "Undertow wants an enemy marcher.";
  if (onOwnHearth(state, unit)) return "A hearth holds its own against the pull.";
  return null;
}

function applyRite(state: GameState, kingdom: Kingdom, powerId: PowerId, x: number, y: number): void {
  const tile = getTile(state, x, y);
  if (!tile) return;
  if (powerId === "seedbed") {
    tile.terrain = "meadow";
    return;
  }
  if (powerId === "hearthwarm") {
    const unit = unitAt(state, x, y);
    if (unit) unit.strength = Math.min(MAX_STRENGTH, unit.strength + WARMTH);
    return;
  }
  if (powerId === "briar") {
    tile.terrain = "wood";
    return;
  }
  if (powerId === "shore") {
    tile.terrain = "meadow";
    tile.ownerId = null;
    return;
  }
  if (powerId === "tremor" || powerId === "cinder") {
    const wound = powerId === "cinder" ? WOUND_CINDER : WOUND_TREMOR;
    for (const spot of riteFootprint(powerId, x, y)) {
      const ground = getTile(state, spot.x, spot.y);
      if (!ground) continue;
      const unit = unitAt(state, spot.x, spot.y);
      if (unit && (powerId === "tremor" || unit.kingdomId !== kingdom.id)) {
        unit.strength = Math.max(1, unit.strength - wound);
      }
      if (!ground.isHearth && ground.terrain !== "water") ground.terrain = "wood";
    }
    return;
  }
  if (powerId === "cut") {
    const unit = unitAt(state, x, y);
    if (unit) {
      const dest = shoveTile(state, unit);
      if (dest) moveUnit(unit, dest);
    }
    tile.terrain = "water";
    tile.ownerId = null;
    return;
  }
  if (powerId === "drain") {
    tile.terrain = "meadow";
    tile.ownerId = kingdom.id;
    return;
  }
  const unit = unitAt(state, x, y);
  if (!unit) return;
  const water = nearestWater(state, unit.x, unit.y, 6);
  const step = water ? stepToward(state, unit, water) : null;
  if (step) {
    moveUnit(unit, step);
    return;
  }
  unit.strength = Math.max(1, unit.strength - (water ? WOUND_UNDERTOW : WOUND_TREMOR));
}

function moveUnit(unit: Unit, tile: Tile): void {
  unit.x = tile.x;
  unit.y = tile.y;
  unit.path = [];
  unit.waitSteps = 0;
}

function shoveTile(state: GameState, unit: Unit): Tile | null {
  const options = landNeighbors(state, unit.x, unit.y);
  return options[0] ?? null;
}

function stepToward(state: GameState, unit: Unit, goal: Tile): Tile | null {
  const options = landNeighbors(state, unit.x, unit.y);
  options.sort((a, b) => manhattan(a, goal) - manhattan(b, goal));
  const better = options.find((tile) => manhattan(tile, goal) < manhattan(unit, goal));
  return better ?? null;
}

function landNeighbors(state: GameState, x: number, y: number): Tile[] {
  const tiles: Tile[] = [];
  for (const [dx, dy] of DIRS) {
    const tile = getTile(state, x + dx, y + dy);
    if (!tile || tile.terrain === "water") continue;
    if (unitAt(state, tile.x, tile.y)) continue;
    tiles.push(tile);
  }
  return tiles;
}

function besideLand(state: GameState, tile: Tile): boolean {
  return DIRS.some(([dx, dy]) => {
    const next = getTile(state, tile.x + dx, tile.y + dy);
    return !!next && next.terrain !== "water";
  });
}

function besideOwnLand(state: GameState, kingdomId: string, tile: Tile): boolean {
  return DIRS.some(([dx, dy]) => getTile(state, tile.x + dx, tile.y + dy)?.ownerId === kingdomId);
}

function ownHearth(state: GameState, kingdomId: string): Tile | undefined {
  return state.tiles.find((tile) => tile.isHearth && tile.ownerId === kingdomId);
}

function onOwnHearth(state: GameState, unit: Unit): boolean {
  const tile = getTile(state, unit.x, unit.y);
  return !!tile && tile.isHearth && tile.ownerId === unit.kingdomId;
}

function nearestFoe(units: Unit[], tile: Tile): number {
  if (units.length === 0) return 0;
  return Math.min(...units.map((unit) => manhattan(unit, tile)));
}

function nearestWater(state: GameState, x: number, y: number, maxDist: number): Tile | null {
  let best: Tile | null = null;
  let bestDist = maxDist + 1;
  for (const tile of state.tiles) {
    if (tile.terrain !== "water") continue;
    const dist = manhattan({ x, y }, tile);
    if (dist < bestDist) {
      best = tile;
      bestDist = dist;
    }
  }
  return bestDist <= maxDist ? best : null;
}

function closestToEnemy(state: GameState, kingdom: Kingdom, tiles: Tile[]): Array<{ x: number; y: number }> {
  const hearth = state.tiles.find(
    (tile) => tile.isHearth && tile.ownerId && tile.ownerId !== kingdom.id,
  );
  const sorted = tiles.slice().sort((a, b) => {
    if (!hearth) return 0;
    return manhattan(a, hearth) - manhattan(b, hearth);
  });
  return sorted.map((tile) => ({ x: tile.x, y: tile.y }));
}

export function addDawnFaith(kingdom: Kingdom): void {
  kingdom.faith = Math.min(FAITH_CAP, kingdom.faith + faithGain(kingdom.population, kingdom.taxRate));
}
