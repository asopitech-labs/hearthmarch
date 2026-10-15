import { describe, expect, it } from "vitest";
import { chooseMarchTarget } from "../src/game/ai.ts";
import { orderUnit } from "../src/game/commands.ts";
import { DAY_MS } from "../src/game/config.ts";
import { unitsOf } from "../src/game/query.ts";
import { createSkirmish, tick } from "../src/game/sim.ts";

describe("session length", () => {
  it("a focused march ends in a sitting, not a minute and not an afternoon", () => {
    const state = createSkirmish();
    let days = 0;
    const limit = 500;
    while (state.status === "playing" && days < limit) {
      for (const unit of unitsOf(state, "ashvale")) {
        if (unit.path.length > 0) continue;
        const dest = chooseMarchTarget(state, unit);
        if (dest) orderUnit(state, unit.id, dest.x, dest.y);
      }
      tick(state, DAY_MS);
      days += 1;
    }
    const minutes = (days * DAY_MS) / 60000;
    console.log(`focused session day ${state.day} status ${state.status} minutes ${minutes.toFixed(1)}`);
    expect(state.status === "won" || state.status === "lost").toBe(true);
    expect(minutes).toBeGreaterThan(14);
    expect(minutes).toBeLessThan(35);
  });
});