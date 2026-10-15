import { describe, expect, it } from "vitest";
import { orderUnits } from "../src/game/commands.ts";
import { getTile } from "../src/game/query.ts";
import { createSkirmish } from "../src/game/sim.ts";
import type { GameState } from "../src/game/types.ts";
import { interpretOrderClick, interpretSelectClick, POINTER_NOTES } from "../src/view/pointer.ts";

function playerUnits(state: GameState) {
  return state.units.filter((unit) => unit.kingdomId === "ashvale");
}

describe("interpretSelectClick", () => {
  it("selects your marcher and does not change the match", () => {
    const state = createSkirmish();
    const captain = playerUnits(state)[0]!;
    const before = state.units.map((unit) => unit.path.length);
    const intent = interpretSelectClick(state, { x: captain.x, y: captain.y });
    expect(intent).toEqual({ kind: "select", unitId: captain.id });
    expect(state.units.map((unit) => unit.path.length)).toEqual(before);
  });

  it("clears the selection when the ground is empty", () => {
    const state = createSkirmish();
    expect(interpretSelectClick(state, { x: 3, y: 3 })).toEqual({ kind: "clear" });
    expect(interpretSelectClick(state, null)).toEqual({ kind: "clear" });
  });

  it("ignores the map when the match is over", () => {
    const state = createSkirmish();
    state.status = "lost";
    const captain = playerUnits(state)[0]!;
    expect(interpretSelectClick(state, { x: captain.x, y: captain.y })).toEqual({ kind: "none" });
  });
});

describe("interpretOrderClick", () => {
  it("orders the selection onto open ground", () => {
    const state = createSkirmish();
    const militia = playerUnits(state).find((unit) => unit.strength === 10)!;
    const dest = { x: militia.x, y: militia.y - 2 };
    const tile = getTile(state, dest.x, dest.y)!;
    tile.terrain = "meadow";
    tile.isHearth = false;
    const intent = interpretOrderClick(state, [militia.id], dest);
    expect(intent).toEqual({ kind: "order", x: dest.x, y: dest.y });
    expect(militia.path).toHaveLength(0);
    expect(orderUnits(state, [militia.id], dest.x, dest.y)).toBe(1);
    expect(militia.path.length).toBeGreaterThan(0);
  });

  it("sends two marchers to neighboring squares", () => {
    const state = createSkirmish();
    const ids = playerUnits(state).map((unit) => unit.id);
    const anchor = playerUnits(state)[0]!;
    const dest = getTile(state, anchor.x, anchor.y + 3)!;
    dest.terrain = "meadow";
    dest.isHearth = false;
    expect(orderUnits(state, ids, dest.x, dest.y)).toBe(2);
    const ends = playerUnits(state).map((unit) => unit.path.at(-1));
    expect(ends.every((end) => end)).toBe(true);
    expect(new Set(ends.map((end) => `${end!.x},${end!.y}`)).size).toBe(2);
  });

  it("refuses water with the marsh note", () => {
    const state = createSkirmish();
    const captain = playerUnits(state)[0]!;
    const water = state.tiles.find((tile) => tile.terrain === "water");
    if (!water) throw new Error("the marsh has no water");
    const intent = interpretOrderClick(state, [captain.id], { x: water.x, y: water.y });
    expect(intent).toEqual({ kind: "note", text: POINTER_NOTES.water });
    expect(orderUnits(state, [captain.id], water.x, water.y)).toBe(0);
  });

  it("refuses a meadow that cannot be reached", () => {
    const state = createSkirmish();
    const captain = playerUnits(state)[0]!;
    const pocket = { x: 0, y: 0 };
    for (const [x, y] of [
      [1, 0],
      [0, 1],
    ] as const) {
      const tile = getTile(state, x, y);
      if (!tile) throw new Error("missing neighbor");
      tile.terrain = "water";
    }
    const intent = interpretOrderClick(state, [captain.id], pocket);
    expect(intent).toEqual({ kind: "note", text: POINTER_NOTES.blocked });
    expect(orderUnits(state, [captain.id], pocket.x, pocket.y)).toBe(0);
  });

  it("does nothing when nobody is selected", () => {
    const state = createSkirmish();
    expect(interpretOrderClick(state, [], { x: 3, y: 3 })).toEqual({ kind: "none" });
  });
});
