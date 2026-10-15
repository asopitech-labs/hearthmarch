import { describe, expect, it } from "vitest";
import { chooseMarchTarget, decideTax, runAi } from "../src/game/ai.ts";
import { levy, orderUnit, setPathTo, setTax } from "../src/game/commands.ts";
import { beliefOf } from "../src/game/faith.ts";
import { DAY_MS, MOVE_MS, SPAWN_AT, WOOD_MOVE_MS } from "../src/game/config.ts";
import { dailyYield } from "../src/game/economy.ts";
import { findPath } from "../src/game/path.ts";
import { getTile, kingdomById, territoryCount, unitsOf } from "../src/game/query.ts";
import { applyDawn, createSkirmish, judge, tick } from "../src/game/sim.ts";
import type { GameState, Unit } from "../src/game/types.ts";

function ashvale(state: GameState) {
  const kingdom = kingdomById(state, "ashvale");
  if (!kingdom) throw new Error("missing Ashvale");
  return kingdom;
}

function reedmoor(state: GameState) {
  const kingdom = kingdomById(state, "reedmoor");
  if (!kingdom) throw new Error("missing Reedmoor");
  return kingdom;
}

function playerUnit(state: GameState, strength?: number): Unit {
  const unit = state.units.find(
    (candidate) =>
      candidate.kingdomId === "ashvale" &&
      (strength === undefined || candidate.strength === strength),
  );
  if (!unit) throw new Error("missing player marcher");
  return unit;
}

describe("skirmish setup", () => {
  it("starts as one human kingdom against one computer kingdom", () => {
    const state = createSkirmish();
    expect(state.kingdoms).toHaveLength(2);
    expect(state.kingdoms.filter((kingdom) => kingdom.controlledBy === "human")).toHaveLength(1);
    expect(state.kingdoms.filter((kingdom) => kingdom.controlledBy === "cpu")).toHaveLength(1);
    expect(state.tiles.some((tile) => tile.terrain === "water")).toBe(true);
    expect(state.tiles.filter((tile) => tile.isHearth)).toHaveLength(2);
    expect(territoryCount(state, "ashvale")).toBeGreaterThan(8);
    expect(judge(state)).toBe("playing");
  });

  it("claims a disk of land around each hearth and never claims water", () => {
    const state = createSkirmish();
    for (const kingdomId of ["ashvale", "reedmoor"]) {
      const hearth = state.tiles.find((tile) => tile.isHearth && tile.ownerId === kingdomId);
      expect(hearth).toBeTruthy();
      let owned = 0;
      for (const tile of state.tiles) {
        if (tile.terrain === "water") {
          expect(tile.ownerId).toBeNull();
          continue;
        }
        const distance = Math.abs(tile.x - hearth!.x) + Math.abs(tile.y - hearth!.y);
        if (distance <= 2) {
          expect(tile.ownerId).toBe(kingdomId);
          owned += 1;
        }
      }
      expect(territoryCount(state, kingdomId)).toBe(owned);
    }
  });

  it("sends Reedmoor marching at the opening", () => {
    const state = createSkirmish();
    expect(unitsOf(state, "reedmoor").some((unit) => unit.path.length > 0)).toBe(true);
    expect(reedmoor(state).taxRate).toBe(
      decideTax({ gold: 30, population: 18, ownUnits: 2, rivalUnits: 2 }),
    );
  });
});

describe("tax and muster", () => {
  it("pays gold and freezes village growth at 30%", () => {
    const state = createSkirmish();
    setTax(state, "ashvale", 30);
    const gold = ashvale(state).gold;
    const population = ashvale(state).population;
    const tiles = territoryCount(state, "ashvale");
    applyDawn(state);
    expect(ashvale(state).gold).toBe(gold + dailyYield(tiles, 30).gold);
    expect(ashvale(state).population).toBe(population);
  });

  it("grows villages and pays no gold at 0%", () => {
    const state = createSkirmish();
    setTax(state, "ashvale", 0);
    const gold = ashvale(state).gold;
    const population = ashvale(state).population;
    const tiles = territoryCount(state, "ashvale");
    applyDawn(state);
    expect(ashvale(state).gold).toBe(gold);
    expect(ashvale(state).population).toBeCloseTo(population + dailyYield(tiles, 0).population);
  });

  it("refuses to set a computer kingdom's tax from the player's slider", () => {
    const state = createSkirmish();
    const before = reedmoor(state).taxRate;
    setTax(state, "reedmoor", 0);
    expect(reedmoor(state).taxRate).toBe(before);
    setTax(state, "ashvale", 99);
    expect(ashvale(state).taxRate).toBe(30);
    setTax(state, "ashvale", -3);
    expect(ashvale(state).taxRate).toBe(0);
  });

  it("musters a marcher when the villages fill", () => {
    const state = createSkirmish();
    setTax(state, "ashvale", 0);
    ashvale(state).population = SPAWN_AT - 1;
    const before = unitsOf(state, "ashvale").length;
    applyDawn(state);
    expect(unitsOf(state, "ashvale").length).toBe(before + 1);
    expect(ashvale(state).population).toBeLessThan(SPAWN_AT);
  });

  it("spends gold on a levy and refunds nothing when the hire succeeds", () => {
    const state = createSkirmish();
    expect(levy(state, "ashvale")).toBe(false);
    expect(ashvale(state).gold).toBe(30);
    ashvale(state).gold = 100;
    const before = unitsOf(state, "ashvale").length;
    expect(levy(state, "ashvale")).toBe(true);
    expect(ashvale(state).gold).toBe(10);
    expect(unitsOf(state, "ashvale").length).toBe(before + 1);
  });

  it("pays every living kingdom at dawn, including a third one", () => {
    const state = createSkirmish();
    state.kingdoms.push({
      id: "briar",
      name: "Briar",
      controlledBy: "cpu",
      gold: 0,
      population: 0,
      taxRate: 30,
      alive: true,
      ink: "#888888",
      wash: "rgba(0,0,0,0.2)",
      ...beliefOf("lark"),
    });
    const corner = getTile(state, 15, 0);
    expect(corner?.terrain).not.toBe("water");
    corner!.ownerId = "briar";
    applyDawn(state);
    expect(kingdomById(state, "briar")?.gold).toBe(dailyYield(1, 30).gold);
    expect(ashvale(state).gold).toBeGreaterThan(30);
  });
});

describe("movement and capture", () => {
  it("walks onto open marsh and claims it", () => {
    const state = createSkirmish();
    const unit = playerUnit(state, 10);
    expect(getTile(state, 5, 5)?.ownerId).toBeNull();
    expect(orderUnit(state, unit.id, 5, 5)).toBe(true);
    tick(state, 100);
    expect(unit.x).toBe(5);
    expect(unit.y).toBe(5);
    expect(getTile(state, 5, 5)?.ownerId).toBe("ashvale");
  });

  it("refuses a computer marcher and refuses water", () => {
    const state = createSkirmish();
    const cpu = unitsOf(state, "reedmoor")[0]!;
    const before = cpu.path.slice();
    expect(orderUnit(state, cpu.id, 10, 5)).toBe(false);
    expect(cpu.path).toEqual(before);
    const unit = playerUnit(state, 13);
    const water = state.tiles.find((tile) => tile.terrain === "water");
    expect(water).toBeTruthy();
    expect(orderUnit(state, unit.id, water!.x, water!.y)).toBe(false);
  });

  it("routes around water", () => {
    const state = createSkirmish();
    const unit = playerUnit(state, 13);
    unit.x = 2;
    unit.y = 3;
    const path = findPath(state, unit, { x: 14, y: 3 });
    expect(path).not.toBeNull();
    expect(path!.some((step) => getTile(state, step.x, step.y)?.terrain === "water")).toBe(false);
    expect(path!.at(-1)).toEqual({ x: 14, y: 3 });
  });

  it("does not let a marcher step into water even with a forged path", () => {
    const state = createSkirmish();
    const unit = playerUnit(state, 13);
    const water = state.tiles.find((tile) => tile.terrain === "water")!;
    unit.path = [{ x: water.x, y: water.y }];
    unit.moveMs = MOVE_MS;
    const x = unit.x;
    tick(state, 100);
    expect(unit.x).toBe(x);
    expect(water.ownerId).toBeNull();
  });

  it("takes longer to enter the trees", () => {
    const state = createSkirmish();
    const unit = playerUnit(state, 10);
    unit.x = 3;
    unit.y = 2;
    unit.path = [];
    expect(getTile(state, 3, 1)?.terrain).toBe("wood");
    expect(orderUnit(state, unit.id, 3, 1)).toBe(true);
    tick(state, WOOD_MOVE_MS - MOVE_MS - 50);
    expect(unit.y).toBe(2);
    tick(state, 200);
    expect(unit.y).toBe(1);
    expect(getTile(state, 3, 1)?.ownerId).toBe("ashvale");
  });

  it("claims an enemy tile by stepping on it", () => {
    const state = createSkirmish();
    state.units = state.units.filter((unit) => unit.kingdomId === "ashvale");
    const unit = playerUnit(state, 13);
    unit.x = 13;
    unit.y = 3;
    unit.path = [];
    expect(getTile(state, 13, 4)?.ownerId).toBe("reedmoor");
    expect(orderUnit(state, unit.id, 13, 4)).toBe(true);
    tick(state, 100);
    expect(unit.x).toBe(13);
    expect(unit.y).toBe(4);
    expect(getTile(state, 13, 4)?.ownerId).toBe("ashvale");
    expect(state.status).toBe("playing");
  });
});

describe("skirmishes and hearths", () => {
  it("lets the stronger attacker take the tile", () => {
    const state = createSkirmish();
    state.units = [];
    state.nextSeq = 10;
    const defender: Unit = {
      id: 1,
      seq: 1,
      kingdomId: "reedmoor",
      x: 13,
      y: 5,
      strength: 10,
      path: [],
      moveMs: 0,
      waitSteps: 0,
    };
    const attacker: Unit = {
      id: 2,
      seq: 2,
      kingdomId: "ashvale",
      x: 12,
      y: 5,
      strength: 12,
      path: [],
      moveMs: 0,
      waitSteps: 0,
    };
    state.units.push(defender, attacker);
    expect(orderUnit(state, attacker.id, 13, 5)).toBe(true);
    tick(state, 100);
    expect(state.units.some((unit) => unit.id === defender.id)).toBe(false);
    expect(attacker.x).toBe(13);
    expect(attacker.strength).toBe(Math.max(1, Math.round(12 - 10 * 0.65)));
    expect(getTile(state, 13, 5)?.ownerId).toBe("ashvale");
  });

  it("holds the tile when strengths are equal, and wounds the defender", () => {
    const state = createSkirmish();
    state.units = [];
    const defender: Unit = {
      id: 1,
      seq: 1,
      kingdomId: "reedmoor",
      x: 13,
      y: 5,
      strength: 10,
      path: [],
      moveMs: 0,
      waitSteps: 0,
    };
    const attacker: Unit = {
      id: 2,
      seq: 2,
      kingdomId: "ashvale",
      x: 12,
      y: 5,
      strength: 10,
      path: [],
      moveMs: 0,
      waitSteps: 0,
    };
    state.units.push(defender, attacker);
    orderUnit(state, attacker.id, 13, 5);
    tick(state, 100);
    expect(state.units.map((unit) => unit.id)).toEqual([1]);
    expect(defender.strength).toBe(Math.max(1, Math.round(10 - 10 * 0.65)));
    expect(getTile(state, 13, 5)?.ownerId).toBe("reedmoor");
  });

  it("gives a hearth a defensive bonus", () => {
    const state = createSkirmish();
    state.units = [];
    const hearth = state.tiles.find((tile) => tile.isHearth && tile.ownerId === "reedmoor")!;
    const defender: Unit = {
      id: 1,
      seq: 1,
      kingdomId: "reedmoor",
      x: hearth.x,
      y: hearth.y,
      strength: 10,
      path: [],
      moveMs: 0,
      waitSteps: 0,
    };
    const attacker: Unit = {
      id: 2,
      seq: 2,
      kingdomId: "ashvale",
      x: hearth.x - 1,
      y: hearth.y,
      strength: 12,
      path: [],
      moveMs: 0,
      waitSteps: 0,
    };
    state.units.push(defender, attacker);
    orderUnit(state, attacker.id, hearth.x, hearth.y);
    tick(state, 100);
    expect(state.units.map((unit) => unit.id)).toEqual([1]);
    expect(defender.x).toBe(hearth.x);
    expect(hearth.ownerId).toBe("reedmoor");
    expect(state.status).toBe("playing");
  });

  it("wins when the player takes the only rival hearth, and seizes the coffer", () => {
    const state = createSkirmish();
    state.units = state.units.filter((unit) => unit.kingdomId === "ashvale");
    const unit = playerUnit(state, 13);
    const hearth = state.tiles.find((tile) => tile.isHearth && tile.ownerId === "reedmoor")!;
    unit.x = hearth.x - 1;
    unit.y = hearth.y;
    unit.path = [];
    const seized = reedmoor(state).gold;
    const goldBefore = ashvale(state).gold;
    expect(orderUnit(state, unit.id, hearth.x, hearth.y)).toBe(true);
    tick(state, 100);
    expect(state.status).toBe("won");
    expect(state.winnerId).toBe("ashvale");
    expect(reedmoor(state).alive).toBe(false);
    expect(ashvale(state).gold).toBe(goldBefore + seized);
    expect(unitsOf(state, "reedmoor")).toHaveLength(0);
    expect(state.tiles.filter((tile) => tile.ownerId === "reedmoor")).toHaveLength(0);
    expect(hearth.ownerId).toBe("ashvale");
  });

  it("loses when a rival takes the player's hearth", () => {
    const state = createSkirmish();
    state.units = state.units.filter((unit) => unit.kingdomId === "reedmoor");
    const unit = unitsOf(state, "reedmoor")[0]!;
    const hearth = state.tiles.find((tile) => tile.isHearth && tile.ownerId === "ashvale")!;
    unit.x = hearth.x + 1;
    unit.y = hearth.y;
    unit.path = [];
    expect(setPathTo(state, unit, { x: hearth.x, y: hearth.y }, { eager: true })).toBe(true);
    tick(state, 100);
    expect(state.status).toBe("lost");
    expect(ashvale(state).alive).toBe(false);
  });

  it("keeps playing after one computer kingdom falls if another is still standing", () => {
    const state = createSkirmish();
    state.units = [];
    state.kingdoms.push({
      id: "briar",
      name: "Briar",
      controlledBy: "cpu",
      gold: 0,
      population: 0,
      taxRate: 0,
      alive: true,
      ink: "#666666",
      wash: "rgba(0,0,0,0.2)",
      ...beliefOf("mere"),
    });
    const reedHearth = state.tiles.find((tile) => tile.isHearth && tile.ownerId === "reedmoor")!;
    const player: Unit = {
      id: 7,
      seq: 7,
      kingdomId: "ashvale",
      x: reedHearth.x - 1,
      y: reedHearth.y,
      strength: 8,
      path: [],
      moveMs: 0,
      waitSteps: 0,
    };
    state.units.push(player);
    orderUnit(state, player.id, reedHearth.x, reedHearth.y);
    tick(state, 100);
    expect(reedmoor(state).alive).toBe(false);
    expect(state.status).toBe("playing");

    const ashHearth = state.tiles.find((tile) => tile.isHearth && tile.ownerId === "ashvale")!;
    const briar: Unit = {
      id: 8,
      seq: 8,
      kingdomId: "briar",
      x: ashHearth.x + 1,
      y: ashHearth.y,
      strength: 8,
      path: [],
      moveMs: 0,
      waitSteps: 0,
    };
    state.units.push(briar);
    setPathTo(state, briar, { x: ashHearth.x, y: ashHearth.y }, { eager: true });
    tick(state, 100);
    expect(state.status).toBe("lost");
  });
});

describe("computer kingdom", () => {
  it("lowers the tax when it needs people and can already afford a levy", () => {
    expect(decideTax({ gold: 100, population: 40, ownUnits: 1, rivalUnits: 3 })).toBe(3);
  });

  it("raises the tax when it needs people and cannot hire", () => {
    expect(decideTax({ gold: 0, population: 10, ownUnits: 1, rivalUnits: 3 })).toBe(22);
  });

  it("keeps the captain on the hearth at first and sends the other marcher to the frontier", () => {
    const state = createSkirmish();
    const captain = unitsOf(state, "reedmoor").find((unit) => unit.strength === 13)!;
    const militia = unitsOf(state, "reedmoor").find((unit) => unit.strength === 10)!;
    const captainTarget = chooseMarchTarget(state, captain);
    const militiaTarget = chooseMarchTarget(state, militia);
    expect(captainTarget).toBeNull();
    expect(militiaTarget).not.toBeNull();
    const frontier = getTile(state, militiaTarget!.x, militiaTarget!.y)!;
    expect(frontier.ownerId).not.toBe("reedmoor");
    expect(frontier.terrain).not.toBe("water");
    expect(frontier.isHearth).toBe(false);
  });

  it("moves or spreads without any player orders", () => {
    const state = createSkirmish();
    const before = unitsOf(state, "reedmoor").map((unit) => ({ id: unit.id, x: unit.x, y: unit.y }));
    const territory = territoryCount(state, "reedmoor");
    tick(state, DAY_MS * 3);
    const moved = unitsOf(state, "reedmoor").some((unit) => {
      const start = before.find((item) => item.id === unit.id);
      return !start || start.x !== unit.x || start.y !== unit.y;
    });
    expect(moved || territoryCount(state, "reedmoor") > territory).toBe(true);
  });

  it("reaches a win or a loss when both sides push", () => {
    const state = createSkirmish();
    let guard = 0;
    while (state.status === "playing" && guard < 80) {
      const foe = state.kingdoms.find((kingdom) => kingdom.controlledBy === "cpu" && kingdom.alive);
      const hearth = foe
        ? state.tiles.find((tile) => tile.isHearth && tile.ownerId === foe.id)
        : undefined;
      if (hearth) {
        for (const unit of state.units) {
          if (unit.kingdomId !== "ashvale" || unit.path.length > 0) continue;
          orderUnit(state, unit.id, hearth.x, hearth.y);
        }
      }
      tick(state, DAY_MS);
      guard += 1;
    }
    expect(state.status === "won" || state.status === "lost").toBe(true);
    expect(guard).toBeLessThan(80);
  });

  it("keeps issuing orders after a fresh think", () => {
    const state = createSkirmish();
    for (const unit of unitsOf(state, "reedmoor")) unit.path = [];
    runAi(state, "reedmoor");
    expect(unitsOf(state, "reedmoor").some((unit) => unit.path.length > 0)).toBe(true);
  });
});
