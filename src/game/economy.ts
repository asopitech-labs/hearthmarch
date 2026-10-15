import { GOLD_PER_TAX_PER_TILE, POP_PER_TILE, TAX_MAX } from "./config.ts";

export function clampTax(rate: number): number {
  if (!Number.isFinite(rate)) return 0;
  return Math.min(TAX_MAX, Math.max(0, Math.round(rate)));
}

/**
 * One dawn of income for a kingdom.
 * Gold scales up with the tax rate. Population scales down, and stops at 30%.
 */
export function dailyYield(
  territory: number,
  taxRate: number,
): { gold: number; population: number } {
  const tiles = Math.max(0, territory);
  const tax = clampTax(taxRate);
  const gold = Math.floor(tiles * tax * GOLD_PER_TAX_PER_TILE);
  const population = tiles * ((TAX_MAX - tax) / TAX_MAX) * POP_PER_TILE;
  return { gold, population };
}

export function taxHint(rate: number): string {
  const tax = clampTax(rate);
  if (tax <= 8) {
    return "The villages keep almost everything. Spears come quickly, and the coffer stays thin.";
  }
  if (tax <= 18) {
    return "A measured due. Gold arrives, and the villages still raise a few marchers.";
  }
  return "The coffer fattens. Few households can spare anyone for the march.";
}
