import { describe, expect, it } from "vitest";
import { RITE_COST_SMALL, STARTING_FAITH } from "../src/game/config.ts";
import {
  addDawnFaith,
  castPower,
  chooseDivineCast,
  considerDivine,
  faithGain,
  godById,
} from "../src/game/faith.ts";
import { getTile, kingdomById, unitAt, unitsOf } from "../src/game/query.ts";
import { applyDawn, createSkirmish, tick } from "../src/game/sim.ts";
import type { GameState, GodId, PowerId } from "../src/game/types.ts";

function player(state: GameState) {
  const kingdom = kingdomById(state, "ashvale");
  if (!kingdom) throw new Error("missing Ashvale");
  return kingdom;
}

function wood(state: GameState) {
  const tile = state.tiles.find((candidate) => candidate.terrain === "wood");
  if (!tile) throw new Error("missing wood");
  return tile;
}

function cast(state: GameState, powerId: PowerId, x: number, y: number) {
  const result = castPower(state, "ashvale", powerId, x, y);
  expect(result.ok, "notice" in result ? result.notice.key : "").toBe(true);
}

describe("faith and the tax", () => {
  it("adds more faith when the villages keep more of the harvest", () => {
    expect(faithGain(18, 0)).toBeGreaterThan(faithGain(18, 10));
    expect(faithGain(18, 10)).toBeGreaterThan(0);
    expect(faithGain(18, 30)).toBe(0);
    expect(faithGain(0, 0)).toBe(0);
  });

  it("pays faith at dawn and withholds it at a hard tax", () => {
    const gentle = createSkirmish();
    player(gentle).taxRate = 0;
    const before = player(gentle).faith;
    applyDawn(gentle);
    expect(player(gentle).faith).toBe(before + faithGain(18, 0));

    const hard = createSkirmish();
    player(hard).taxRate = 30;
    const held = player(hard).faith;
    applyDawn(hard);
    expect(player(hard).faith).toBe(held);
  });
});

describe("rites", () => {
  it("refuses a rite the kingdom's god does not keep, and spends nothing", () => {
    const state = createSkirmish({ humanGod: "lark" });
    const faith = player(state).faith;
    const result = castPower(state, "ashvale", "shore", 6, 3);
    expect(result.ok).toBe(false);
    expect(player(state).faith).toBe(faith);
  });

  it("refuses a rite that costs more faith than the bowl holds", () => {
    const state = createSkirmish({ humanGod: "lark" });
    player(state).faith = 0;
    const result = castPower(state, "ashvale", "seedbed", wood(state).x, wood(state).y);
    expect(result.ok).toBe(false);
    expect(wood(state).terrain).toBe("wood");
  });

  it("opens a wood with Seedbed and steadies a marcher with Hearthwarm", () => {
    const state = createSkirmish({ humanGod: "lark" });
    const grove = wood(state);
    cast(state, "seedbed", grove.x, grove.y);
    expect(grove.terrain).toBe("meadow");
    const militia = unitsOf(state, "ashvale").find((unit) => unit.strength === 10)!;
    cast(state, "hearthwarm", militia.x, militia.y);
    expect(militia.strength).toBe(14);
  });

  it("tangles a meadow with Briar and then rests", () => {
    const state = createSkirmish({ humanGod: "lark" });
    const meadows = state.tiles.filter((tile) => tile.terrain === "meadow" && !tile.isHearth);
    const meadow = meadows[0]!;
    const other = meadows[1]!;
    cast(state, "briar", meadow.x, meadow.y);
    expect(meadow.terrain).toBe("wood");
    const again = castPower(state, "ashvale", "briar", other.x, other.y);
    expect(again.ok).toBe(false);
    expect(other.terrain).toBe("meadow");
  });

  it("will not sink a hearth", () => {
    const state = createSkirmish({ humanGod: "mere" });
    const hearth = state.tiles.find((tile) => tile.isHearth && tile.ownerId === "ashvale")!;
    const result = castPower(state, "ashvale", "cut", hearth.x, hearth.y);
    expect(result.ok).toBe(false);
    expect(hearth.terrain).toBe("meadow");
    expect(hearth.isHearth).toBe(true);
  });

  it("lifts a shore, shakes marchers, and scorches a field", () => {
    const state = createSkirmish({ humanGod: "kiln" });
    const pool = state.tiles.find((tile) => {
      if (tile.terrain !== "water") return false;
      return [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx, dy]) => {
        const next = getTile(state, tile.x + dx!, tile.y + dy!);
        return !!next && next.terrain !== "water";
      });
    })!;
    expect(pool.terrain).toBe("water");
    cast(state, "shore", pool.x, pool.y);
    expect(pool.terrain).toBe("meadow");

    const foe = unitsOf(state, "reedmoor").find((unit) => unit.strength === 10)!;
    const before = foe.strength;
    cast(state, "tremor", foe.x, foe.y);
    expect(foe.strength).toBeLessThan(before);
    expect(foe.strength).toBeGreaterThanOrEqual(1);

    const field = state.tiles.find((tile) => tile.terrain === "meadow" && !tile.isHearth)!;
    cast(state, "cinder", field.x, field.y);
    expect(field.terrain).toBe("wood");
    expect(field.isHearth).toBe(false);
  });

  it("cuts a meadow, drains water onto your land, and pulls a marcher", () => {
    const state = createSkirmish({ humanGod: "mere" });
    const owned = state.tiles.find((tile) => {
      if (tile.ownerId !== "ashvale" || tile.isHearth || tile.terrain !== "meadow") return false;
      const north = getTile(state, tile.x, tile.y - 1);
      return !!north && north.terrain !== "water";
    })!;
    const neighbor = getTile(state, owned.x, owned.y - 1);
    expect(neighbor?.terrain).not.toBe("water");
    cast(state, "cut", owned.x, owned.y);
    expect(getTile(state, owned.x, owned.y)?.terrain).toBe("water");
    expect(getTile(state, owned.x, owned.y)?.ownerId).toBeNull();

    const water = state.tiles.find((tile) => {
      if (tile.terrain !== "water") return false;
      return (
        getTile(state, tile.x + 1, tile.y)?.ownerId === "ashvale" ||
        getTile(state, tile.x - 1, tile.y)?.ownerId === "ashvale" ||
        getTile(state, tile.x, tile.y + 1)?.ownerId === "ashvale" ||
        getTile(state, tile.x, tile.y - 1)?.ownerId === "ashvale"
      );
    });
    expect(water).toBeTruthy();
    cast(state, "drain", water!.x, water!.y);
    expect(water!.terrain).toBe("meadow");
    expect(water!.ownerId).toBe("ashvale");

    const foe = unitsOf(state, "reedmoor").find((unit) => !getTile(state, unit.x, unit.y)?.isHearth)!;
    const from = { x: foe.x, y: foe.y };
    cast(state, "undertow", foe.x, foe.y);
    const moved = foe.x !== from.x || foe.y !== from.y;
    const wounded = foe.strength < 10 && foe.strength >= 1;
    expect(moved || wounded).toBe(true);
    expect(getTile(state, foe.x, foe.y)?.terrain).not.toBe("water");
  });

  it("pushes a marcher off a meadow before the water arrives", () => {
    const state = createSkirmish({ humanGod: "mere" });
    const militia = unitsOf(state, "ashvale").find((unit) => unit.strength === 10)!;
    const from = { x: militia.x, y: militia.y };
    cast(state, "cut", from.x, from.y);
    expect(getTile(state, from.x, from.y)?.terrain).toBe("water");
    expect(unitAt(state, from.x, from.y)).toBeUndefined();
    expect(militia.x !== from.x || militia.y !== from.y).toBe(true);
  });
});

describe("the computer's god", () => {
  it.each(["lark", "kiln", "mere"] as GodId[])("calls a rite for %s", (godId) => {
    const state = createSkirmish({ humanGod: "lark", cpuGod: godId });
    const reed = kingdomById(state, "reedmoor")!;
    reed.riteThinkMs = 0;
    const before = reed.faith;
    const choice = chooseDivineCast(state, "reedmoor");
    expect(choice).not.toBeNull();
    expect(godById(godId).powers.some((power) => power.id === choice!.powerId)).toBe(true);
    tick(state, 100);
    expect(reed.faith).toBeLessThan(before);
    expect(reed.faith).toBeLessThan(STARTING_FAITH);
  });

  it("keeps faith in the bowl so a later morning can still call a rite", () => {
    const state = createSkirmish({ humanGod: "lark", cpuGod: "kiln" });
    const reed = kingdomById(state, "reedmoor")!;
    considerDivine(state, "reedmoor");
    considerDivine(state, "reedmoor");
    expect(reed.faith).toBeGreaterThanOrEqual(RITE_COST_SMALL);
    expect(reed.faith).toBeLessThan(STARTING_FAITH - RITE_COST_SMALL);

    reed.faith = 0;
    reed.taxRate = 0;
    reed.population = 40;
    for (let morning = 0; morning < 4; morning++) addDawnFaith(reed);
    const filled = reed.faith;
    expect(filled).toBeGreaterThanOrEqual(RITE_COST_SMALL);
    considerDivine(state, "reedmoor");
    expect(reed.faith).toBeLessThan(filled);
  });
});
