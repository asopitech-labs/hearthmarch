import "@fontsource/literata/400.css";
import "@fontsource/literata/400-italic.css";
import "@fontsource/literata/700.css";
import "@fontsource/patrick-hand/400.css";
import "./style.css";
import { orderUnit } from "./game/commands.ts";
import { DAY_MS } from "./game/config.ts";
import { findPath } from "./game/path.ts";
import { getTile, humanKingdom, territoryCount, unitAt, unitsOf } from "./game/query.ts";
import { createSkirmish, tick } from "./game/sim.ts";
import type { GameState } from "./game/types.ts";
import { drawMap } from "./render/draw.ts";
import { eventToLogical, LAYOUT, tileAtPoint, tileCenter } from "./render/layout.ts";
import { mountHud } from "./ui/hud.ts";

const canvas = document.querySelector<HTMLCanvasElement>("#map");
const stage = document.querySelector<HTMLElement>(".map-scroll");
if (!canvas || !stage) {
  throw new Error("Hearthmarch is missing its map");
}

const ctx = canvas.getContext("2d");
if (!ctx) {
  stage.insertAdjacentHTML(
    "beforeend",
    "<p class=\"error\">This browser could not open a drawing surface.</p>",
  );
} else {
  start(canvas, ctx);
}

function start(map: HTMLCanvasElement, context: CanvasRenderingContext2D): void {
  let state = createSkirmish();
  let paused = false;
  let speed = 1;
  let selectedId: number | null = null;
  let hover: { x: number; y: number } | null = null;
  let note = "";
  let noteUntil = 0;
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const hud = mountHud({
    onPause() {
      if (state.status === "playing") paused = !paused;
    },
    onSpeed() {
      speed = speed === 1 ? 2 : 1;
    },
    onRestart() {
      state = createSkirmish();
      paused = false;
      speed = 1;
      selectedId = null;
      hover = null;
      note = "";
    },
  });

  function previewPath(): Array<{ x: number; y: number }> | null {
    if (selectedId === null || !hover || state.status !== "playing") return null;
    const unit = state.units.find((candidate) => candidate.id === selectedId);
    if (!unit || (unit.x === hover.x && unit.y === hover.y)) return null;
    const tile = getTile(state, hover.x, hover.y);
    if (!tile || tile.terrain === "water") return null;
    return findPath(state, unit, hover);
  }

  function syncCanvas(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = map.clientWidth;
    const height = map.clientHeight;
    if (width < 2 || height < 2) return;
    const bitmapWidth = Math.round(width * dpr);
    const bitmapHeight = Math.round(height * dpr);
    if (map.width !== bitmapWidth || map.height !== bitmapHeight) {
      map.width = bitmapWidth;
      map.height = bitmapHeight;
    }
    context.setTransform(bitmapWidth / LAYOUT.width, 0, 0, bitmapHeight / LAYOUT.height, 0, 0);
  }

  map.addEventListener("pointermove", (event) => {
    const logical = eventToLogical(map, event);
    hover = tileAtPoint(logical.x, logical.y, state.width, state.height);
    const occupant = hover ? unitAt(state, hover.x, hover.y) : undefined;
    const human = humanKingdom(state);
    const own = occupant && human && occupant.kingdomId === human.id;
    map.style.cursor = own ? "pointer" : "crosshair";
  });

  map.addEventListener("pointerleave", () => {
    hover = null;
    map.style.cursor = "crosshair";
  });

  map.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    selectedId = null;
  });

  map.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || state.status !== "playing") return;
    const logical = eventToLogical(map, event);
    const tilePos = tileAtPoint(logical.x, logical.y, state.width, state.height);
    if (!tilePos) return;
    const occupant = unitAt(state, tilePos.x, tilePos.y);
    const human = humanKingdom(state);
    if (occupant && human && occupant.kingdomId === human.id) {
      selectedId = occupant.id;
      note = "";
      return;
    }
    if (selectedId === null) return;
    const moved = orderUnit(state, selectedId, tilePos.x, tilePos.y);
    if (moved) {
      note = "";
      return;
    }
    const tile = getTile(state, tilePos.x, tilePos.y);
    note = tile?.terrain === "water" ? "Water keeps its own counsel." : "No path there.";
    noteUntil = performance.now() + 1700;
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      selectedId = null;
      return;
    }
    const typing =
      event.target instanceof HTMLInputElement || event.target instanceof HTMLButtonElement;
    if (event.key === " " && !typing) {
      event.preventDefault();
      if (state.status === "playing") paused = !paused;
    }
  });

  window.__hearthmarch = {
    getState: () => snapshot(state),
    tileCenter,
    layout: { width: LAYOUT.width, height: LAYOUT.height },
  };

  let last = performance.now();
  const frame = (now: number) => {
    const dt = Math.min(50, now - last);
    last = now;
    if (note && now > noteUntil) note = "";
    if (!paused && state.status === "playing") tick(state, dt * speed);
    if (selectedId !== null && !state.units.some((unit) => unit.id === selectedId)) {
      selectedId = null;
    }
    syncCanvas();
    drawMap(context, {
      state,
      selectedId,
      hover,
      preview: previewPath(),
      time: now,
      reduceMotion: motion.matches,
    });
    hud.update(state, { paused, speed, selectedId, note });
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function snapshot(state: GameState) {
  return {
    status: state.status,
    day: state.day,
    clockMs: state.clockMs,
    dayMs: DAY_MS,
    winnerId: state.winnerId,
    log: [...state.log],
    kingdoms: state.kingdoms.map((kingdom) => ({
      id: kingdom.id,
      name: kingdom.name,
      controlledBy: kingdom.controlledBy,
      gold: kingdom.gold,
      population: kingdom.population,
      taxRate: kingdom.taxRate,
      alive: kingdom.alive,
      territory: territoryCount(state, kingdom.id),
      units: unitsOf(state, kingdom.id).length,
    })),
    tiles: state.tiles.map((tile) => ({
      x: tile.x,
      y: tile.y,
      ownerId: tile.ownerId,
      terrain: tile.terrain,
      isHearth: tile.isHearth,
    })),
    units: state.units.map((unit) => ({
      id: unit.id,
      kingdomId: unit.kingdomId,
      x: unit.x,
      y: unit.y,
      strength: unit.strength,
      pathLength: unit.path.length,
    })),
  };
}

declare global {
  interface Window {
    __hearthmarch?: {
      getState: () => ReturnType<typeof snapshot>;
      tileCenter: typeof tileCenter;
      layout: { width: number; height: number };
    };
  }
}
