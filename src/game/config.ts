/** Tax is an integer percent. 0 favors villages; 30 favors the coffer. */
export const TAX_MAX = 30;

/**
 * Real time between dawns. A day is long enough that tax, faith, and a
 * march across the wide marsh all matter in the same sitting.
 */
export const DAY_MS = 22000;

export const MOVE_MS = 12000;

export const WOOD_MOVE_MS = 16500;

/** Villagers required before a kingdom musters a marcher on its own. */
export const SPAWN_AT = 56;

/** Villagers added per owned tile when the tax is 0. */
export const POP_PER_TILE = 1.4;

/** Gold added per owned tile per tax percent. */
export const GOLD_PER_TAX_PER_TILE = 0.22;

export const LEVY_COST = 90;

export const LEVY_STRENGTH = 8;

export const SPAWN_STRENGTH = 8;

export const MAX_STRENGTH = 18;

export const REGEN = 1;

/**
 * A marcher standing on their own hearth fights as if they were this much
 * stronger. The bonus is not stored on the unit, so leaving the hearth
 * spends it at once. One attacker still ties a healthy garrison. Friendly
 * marchers on the four neighboring tiles add their strength to that blow.
 */
export const HEARTH_BONUS = 8;

export const MAX_UNITS = 8;

/** Share of the loser's strength (or the attacker's, if they lose) dealt to the winner. */
export const COMBAT_RATIO = 0.65;

/**
 * Lines kept in the field log. A sitting writes a few hundred notes, and
 * the panel scrolls, so the opening rites stay readable at the end.
 */
export const LOG_LIMIT = 640;

export const SLICE_MS = 100;

/** Faith a kingdom starts with. Enough for one of each of its rites. */
export const STARTING_FAITH = 68;

export const FAITH_CAP = 90;

/**
 * Faith added per villager at 0% tax. The day's tax scales this down,
 * and 30% tax adds none.
 */
export const FAITH_PER_VILLAGER = 0.22;

export const RITE_COOLDOWN_MS = 2800;

/** How often a computer kingdom looks for another rite. */
export const RITE_THINK_MS = 9000;

/** Delay before the computer's first rite, so the opening is readable. */
export const RITE_FIRST_MS = 5000;

export const RITE_COST_SMALL = 12;
export const RITE_COST_MID = 22;
export const RITE_COST_GREAT = 34;

export const WARMTH = 4;
export const WOUND_TREMOR = 3;
export const WOUND_CINDER = 4;
export const WOUND_UNDERTOW = 5;
