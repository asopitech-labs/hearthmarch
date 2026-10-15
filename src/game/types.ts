export type Terrain = "meadow" | "wood" | "water";

export type Controller = "human" | "cpu";

export type GameStatus = "playing" | "won" | "lost";

export interface Tile {
  x: number;
  y: number;
  terrain: Terrain;
  ownerId: string | null;
  isHearth: boolean;
}

export interface Unit {
  id: number;
  seq: number;
  kingdomId: string;
  x: number;
  y: number;
  strength: number;
  path: Array<{ x: number; y: number }>;
  moveMs: number;
  waitSteps: number;
}

export interface Kingdom {
  id: string;
  name: string;
  controlledBy: Controller;
  gold: number;
  population: number;
  /** Integer percent from 0 through 30. */
  taxRate: number;
  alive: boolean;
  /** Pencil color for cloaks, banners, and hatches. */
  ink: string;
  /** Translucent wash laid over owned ground. */
  wash: string;
}

export interface Flash {
  x: number;
  y: number;
  ms: number;
  kind: "combat" | "capture" | "spawn";
}

/**
 * All kingdoms live in one list. Milestone 1 puts a single human kingdom
 * and a single computer kingdom on the map; dawn, combat, and victory
 * already walk the whole list.
 */
export interface GameState {
  width: number;
  height: number;
  tiles: Tile[];
  kingdoms: Kingdom[];
  units: Unit[];
  day: number;
  clockMs: number;
  status: GameStatus;
  winnerId: string | null;
  log: string[];
  flashes: Flash[];
  nextSeq: number;
}
