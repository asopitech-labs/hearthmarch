import { describe, expect, it } from "vitest";
import { orderUnit } from "../src/game/commands.ts";
import { getTile } from "../src/game/query.ts";
import { createSkirmish } from "../src/game/sim.ts";
import type { GameState } from "../src/game/types.ts";
import { interpretTileClick, POINTER_NOTES } from "../src/view/pointer.ts";

function playerUnits(state: GameState) {
  return state.units.filter((unit) => unit.kingdomId === "ashvale");
}

describe("interpretTileClick", () => {
  it("selects your marcher and does not change the match", () => {
    const state = createSkirmish();
    const captain = playerUnits(state)[0]!;
    const before = state.units.map((unit) => unit.path.length);
    const intent = interpretTileClick(state, null, { x: captain.x, y: captain.y });
    expect(intent).toEqual({ kind: "select", unitId: captain.id });
    expect(state.units.map((unit) => unit.path.length)).toEqual(before);
  });

  it("switches selection when another of your marchers is clicked", () => {
    const state = createSkirmish();
    const [captain, militia] = playerUnits(state);
    const intent = interpretTileClick(state, captain!.id, { x: militia!.x, y: militia!.y });
    expect(intent).toEqual({ kind: "select", unitId: militia!.id });
  });

  it("orders a path onto open ground, and orderUnit accepts that order", () => {
    const state = createSkirmish();
    const militia = playerUnits(state).find((unit) => unit.x > 2)!;
    const dest = { x: militia.x, y: militia.y - 2 };
    const intent = interpretTileClick(state, militia.id, dest);
    expect(intent).toEqual({ kind: "order", unitId: militia.id, x: dest.x, y: dest.y });
    expect(militia.path).toHaveLength(0);
    expect(orderUnit(state, militia.id, dest.x, dest.y)).toBe(true);
    expect(militia.path.length).toBeGreaterThan(0);
  });

  it("refuses water with the marsh note", () => {
    const state = createSkirmish();
    const captain = playerUnits(state)[0]!;
    const water = state.tiles.find((tile) => tile.terrain === "water");
    if (!water) throw new Error("the marsh has no water");
    const intent = interpretTileClick(state, captain.id, { x: water.x, y: water.y });
    expect(intent).toEqual({ kind: "note", text: POINTER_NOTES.water });
    expect(orderUnit(state, captain.id, water.x, water.y)).toBe(false);
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
    const intent = interpretTileClick(state, captain.id, pocket);
    expect(intent).toEqual({ kind: "note", text: POINTER_NOTES.blocked });
    expect(orderUnit(state, captain.id, pocket.x, pocket.y)).toBe(false);
  });

  it("ignores the map when nothing is selected or the match is over", () => {
    const state = createSkirmish();
    expect(interpretTileClick(state, null, { x: 3, y: 3 })).toEqual({ kind: "none" });
    expect(interpretTileClick(state, null, null)).toEqual({ kind: "none" });
    state.status = "lost";
    const captain = playerUnits(state)[0]!;
    expect(interpretTileClick(state, captain.id, { x: captain.x, y: captain.y })).toEqual({
      kind: "none",
    });
  });
});
