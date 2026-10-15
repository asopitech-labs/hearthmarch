import {
  Actor,
  Canvas,
  Color,
  DisplayMode,
  Engine,
  PointerButton,
  PointerScope,
  ScrollPreventionMode,
  vec,
} from "excalibur";
import { orderUnit } from "../game/commands.ts";
import { DAY_MS } from "../game/config.ts";
import { castPower, riteFootprint } from "../game/faith.ts";
import { findPath } from "../game/path.ts";
import { getTile, humanKingdom, territoryCount, unitAt, unitsOf } from "../game/query.ts";
import { createSkirmish, tick } from "../game/sim.ts";
import type { GameState, GodId, PowerId } from "../game/types.ts";
import { drawMap } from "../render/draw.ts";
import { LAYOUT, tileAtPoint, tileCenter } from "../render/layout.ts";
import { mountHud } from "../ui/hud.ts";
import { interpretTileClick } from "./pointer.ts";

const FRAME_CAP_MS = 50;

export async function startBoard(map: HTMLCanvasElement): Promise<void> {
  let state = createSkirmish();
  let paused = false;
  let speed = 1;
  let selectedId: number | null = null;
  let hover: { x: number; y: number } | null = null;
  let note = "";
  let noteUntil = 0;
  let choosingGod = true;
  let armedPower: PowerId | null = null;
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const hud = mountHud({
    onPause() {
      if (state.status === "playing" && !choosingGod) paused = !paused;
    },
    onSpeed() {
      speed = speed === 1 ? 2 : 1;
    },
    onRestart() {
      choosingGod = true;
      armedPower = null;
      paused = false;
      speed = 1;
      selectedId = null;
      hover = null;
      note = "";
    },
    onChooseGod(godId: GodId) {
      state = createSkirmish({ humanGod: godId });
      choosingGod = false;
      armedPower = null;
      paused = false;
      speed = 1;
      selectedId = null;
      hover = null;
      note = "";
    },
    onRite(powerId: PowerId) {
      if (choosingGod || state.status !== "playing") return;
      armedPower = armedPower === powerId ? null : powerId;
      if (armedPower) selectedId = null;
      note = "";
    },
  });

  const engine = new Engine({
    canvasElement: map,
    width: LAYOUT.width,
    height: LAYOUT.height,
    displayMode: DisplayMode.FitContainer,
    backgroundColor: Color.fromHex("#f3e7d0"),
    antialiasing: true,
    suppressPlayButton: true,
    suppressConsoleBootMessage: true,
    pointerScope: PointerScope.Canvas,
    grabWindowFocus: false,
    scrollPreventionMode: ScrollPreventionMode.None,
    enableCanvasContextMenu: false,
    configurePerformanceCanvas2DFallback: {
      allow: true,
      showPlayerMessage: false,
    },
  });

  // The camera focal point is the center of the view. Parking it on the
  // middle of the marsh keeps world (0, 0) at the canvas top-left, which is
  // the coordinate space drawMap and tileAtPoint already use. Zoom stays 1
  // until a later map is larger than the viewport.
  const camera = engine.currentScene.camera;
  camera.zoom = 1;
  camera.pos = vec(LAYOUT.width / 2, LAYOUT.height / 2);

  const surface = new Canvas({
    width: LAYOUT.width,
    height: LAYOUT.height,
    cache: false,
    quality: 2,
    smoothing: true,
    draw(ctx) {
      drawMap(ctx, {
        state,
        selectedId,
        hover,
        preview: previewPath(),
        riteMarks:
          armedPower && hover ? riteFootprint(armedPower, hover.x, hover.y) : [],
        time: performance.now(),
        reduceMotion: motion.matches,
      });
    },
  });

  const board = new Actor({
    name: "reed-marsh",
    pos: vec(0, 0),
    anchor: vec(0, 0),
    width: LAYOUT.width,
    height: LAYOUT.height,
  });
  board.graphics.use(surface, { anchor: vec(0, 0) });
  board.onPreUpdate = (_engine, elapsed) => {
    const now = performance.now();
    if (note && now > noteUntil) note = "";
    const dt = Math.min(FRAME_CAP_MS, elapsed);
    if (!choosingGod && !paused && state.status === "playing") tick(state, dt * speed);
    if (selectedId !== null && !state.units.some((unit) => unit.id === selectedId)) {
      selectedId = null;
    }
    hud.update(state, { paused, speed, selectedId, note, armedPower, choosingGod });
  };
  engine.add(board);

  engine.input.pointers.primary.on("move", (event) => {
    hover = tileAtPoint(event.worldPos.x, event.worldPos.y, state.width, state.height);
    const occupant = hover ? unitAt(state, hover.x, hover.y) : undefined;
    const human = humanKingdom(state);
    const own = occupant && human && occupant.kingdomId === human.id;
    map.style.cursor = own ? "pointer" : "crosshair";
  });

  engine.input.pointers.primary.on("down", (event) => {
    if (event.button === PointerButton.Right) {
      selectedId = null;
      armedPower = null;
      return;
    }
    if (choosingGod || event.button !== PointerButton.Left || state.status !== "playing") return;
    const tile = tileAtPoint(event.worldPos.x, event.worldPos.y, state.width, state.height);
    applyClick(tile);
  });

  map.addEventListener("pointerleave", () => {
    hover = null;
    map.style.cursor = "crosshair";
  });

  map.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    selectedId = null;
    armedPower = null;
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      selectedId = null;
      armedPower = null;
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

  await engine.start();
  camera.zoom = 1;
  camera.pos = vec(LAYOUT.width / 2, LAYOUT.height / 2);

  function previewPath(): Array<{ x: number; y: number }> | null {
    if (selectedId === null || !hover || state.status !== "playing") return null;
    const unit = state.units.find((candidate) => candidate.id === selectedId);
    if (!unit || (unit.x === hover.x && unit.y === hover.y)) return null;
    const tile = getTile(state, hover.x, hover.y);
    if (!tile || tile.terrain === "water") return null;
    return findPath(state, unit, hover);
  }

  function applyClick(tile: { x: number; y: number } | null): void {
    if (armedPower) {
      const human = humanKingdom(state);
      if (!human || !tile) return;
      const result = castPower(state, human.id, armedPower, tile.x, tile.y);
      if (result.ok) {
        note = "";
        armedPower = null;
        return;
      }
      note = result.reason;
      noteUntil = performance.now() + 1700;
      return;
    }
    const intent = interpretTileClick(state, selectedId, tile);
    if (intent.kind === "select") {
      selectedId = intent.unitId;
      note = "";
      return;
    }
    if (intent.kind === "order") {
      if (orderUnit(state, intent.unitId, intent.x, intent.y)) note = "";
      return;
    }
    if (intent.kind === "note") {
      note = intent.text;
      noteUntil = performance.now() + 1700;
    }
  }
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
      godId: kingdom.godId,
      faith: kingdom.faith,
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
