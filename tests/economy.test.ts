import { describe, expect, it } from "vitest";
import { clampTax, dailyYield, taxBand } from "../src/game/economy.ts";

describe("dailyYield", () => {
  it("gives villagers and no gold at 0%", () => {
    const yieldAtZero = dailyYield(13, 0);
    expect(yieldAtZero.gold).toBe(0);
    expect(yieldAtZero.population).toBeGreaterThan(0);
  });

  it("gives gold and no villagers at 30%", () => {
    const yieldAtFull = dailyYield(13, 30);
    expect(yieldAtFull.population).toBe(0);
    expect(yieldAtFull.gold).toBeGreaterThan(0);
  });

  it("sits between the two extremes at 15%", () => {
    const low = dailyYield(13, 0);
    const mid = dailyYield(13, 15);
    const high = dailyYield(13, 30);
    expect(mid.population).toBeGreaterThan(0);
    expect(mid.population).toBeLessThan(low.population);
    expect(mid.gold).toBeGreaterThan(0);
    expect(mid.gold).toBeLessThan(high.gold);
  });

  it("pays more from a larger kingdom", () => {
    const small = dailyYield(4, 12);
    const large = dailyYield(20, 12);
    expect(large.gold).toBeGreaterThan(small.gold);
    expect(large.population).toBeGreaterThan(small.population);
  });

  it("clamps wild tax rates", () => {
    expect(clampTax(-4)).toBe(0);
    expect(clampTax(99)).toBe(30);
    expect(clampTax(Number.NaN)).toBe(0);
    expect(dailyYield(10, 80)).toEqual(dailyYield(10, 30));
  });
});

describe("taxBand", () => {
  it("splits the rate into gentle, measured, and hard", () => {
    expect(taxBand(0)).toBe("gentle");
    expect(taxBand(8)).toBe("gentle");
    expect(taxBand(9)).toBe("measured");
    expect(taxBand(18)).toBe("measured");
    expect(taxBand(19)).toBe("hard");
    expect(taxBand(30)).toBe("hard");
  });
});
