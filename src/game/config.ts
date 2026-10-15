/** Tax is an integer percent. 0 favors villages; 30 favors the coffer. */
export const TAX_MAX = 30;

/** Real time between dawns, when taxes are paid and villages grow. */
export const DAY_MS = 4000;

export const MOVE_MS = 1200;

export const WOOD_MOVE_MS = 1800;

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
 * spends it at once.
 */
export const HEARTH_BONUS = 8;

export const MAX_UNITS = 6;

/** Share of the loser's strength (or the attacker's, if they lose) dealt to the winner. */
export const COMBAT_RATIO = 0.65;

export const LOG_LIMIT = 7;

export const SLICE_MS = 100;
