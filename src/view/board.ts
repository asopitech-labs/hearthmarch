import {
  Actor,
  Canvas,
  Color,
  DisplayMode,
  Engine,
  PointerScope,
  ScrollPreventionMode,
  vec,
} from "excalibur";
import { orderUnits } from "../game/commands.ts";
import { DAY_MS } from "../game/config.ts";
import { castPower, godById, riteFootprint } from "../game/faith.ts";
import { findPath } from "../game/path.ts";
import { getTile, humanKingdom, territoryCount, unitAt, unitsOf } from "../game/query.ts";
import { createSkirmish, tick } from "../game/sim.ts";
import type { GameState, GodId, PowerId } from "../game/types.ts";
import { drawView, measureFrameTimes, resetViewCache, viewSurfaces, type DrawInput } from "../render/draw.ts";
import { LAYOUT, tileAtPoint, tileCenter, worldSize } from "../render/layout.ts";
import { mountHud } from "../ui/hud.ts";
import { clampCamera, screenToWorld, visibleWorldRect, zoomAt, type Camera } from "./camera.ts";
import { interpretOrderClick, interpretSelectClick } from "./pointer.ts";
import { toggleMember, unitsInWorldRect } from "./select.ts";

const FRAME_CAP_MS = 50;
const DRAG_SLOP = 8;
const PAN_SPEED = 540;

export async function startBoard(map: HTMLCanvasElement): Promise<void> {
  let state = createSkirmish();
  let paused = false;
  let speed = 1;
  let selectedIds: number[] = [];
  let hover: { x: number; y: number } | null = null;
  let note = "";
  let noteUntil = 0;
  let choosingGod = true;
  let armedPower: PowerId | null = null;
  let previews: DrawInput["previews"] = [];
  let box: DrawInput["box"] = null;
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const world = () => worldSize(state.width, state.height);

  let camera: Camera = clampCamera(
    { x: world().width / 2, y: world().height / 2, zoom: 1 },
    world().width,
    world().height,
  );

  const keys = new Set<string>();
  let pointerInside = false;
  let pointerLocal = { x: LAYOUT.width / 2, y: LAYOUT.height / 2 };
  let pointerKind = "mouse";
  const contacts = new Map<number, { x: number; y: number }>();
  let gesture: "none" | "pending" | "pan" | "box" | "pinch" = "none";
  let gestureStart = { x: 0, y: 0 };
  let pinchDistance = 0;
  let lastTapAt = 0;
  let lastTapUnit = -1;

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
      selectedIds = [];
      hover = null;
      note = "";
      previews = [];
    },
    onChooseGod(godId: GodId) {
      state = createSkirmish({ humanGod: godId });
      resetViewCache();
      choosingGod = false;
      armedPower = null;
      paused = false;
      speed = 1;
      selectedIds = [];
      hover = null;
      note = "";
      previews = [];
      lookAtHearth("ashvale");
    },
    onRite(powerId: PowerId) {
      if (choosingGod || state.status !== "playing") return;
      armedPower = armedPower === powerId ? null : powerId;
      if (armedPower) selectedIds = [];
      note = "";
      previews = [];
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

  const exCamera = engine.currentScene.camera;
  exCamera.zoom = 1;
  exCamera.pos = vec(LAYOUT.width / 2, LAYOUT.height / 2);

  const surface = new Canvas({
    width: LAYOUT.width,
    height: LAYOUT.height,
    cache: false,
    quality: 2,
    smoothing: true,
    draw(ctx) {
      drawView(ctx, {
        state,
        selectedIds,
        hover,
        previews,
        riteMarks: armedPower && hover ? riteFootprint(armedPower, hover.x, hover.y) : [],
        time: performance.now(),
        reduceMotion: motion.matches,
        camera,
        box,
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
    selectedIds = selectedIds.filter((id) => state.units.some((unit) => unit.id === id));
    if (!choosingGod) nudgeCamera(dt);
    hud.update(state, { paused, speed, selectedIds, note, armedPower, choosingGod });
    paintMinimap();
  };
  engine.add(board);

  const minimap = document.querySelector<HTMLCanvasElement>("#minimap");
  const zoomIn = document.querySelector<HTMLButtonElement>("#zoom-in");
  const zoomOut = document.querySelector<HTMLButtonElement>("#zoom-out");
  const selectAll = document.querySelector<HTMLButtonElement>("#select-all");

  zoomIn?.addEventListener("click", () => {
    camera = zoomAt(camera, camera.zoom * 1.15, LAYOUT.width / 2, LAYOUT.height / 2, world().width, world().height);
  });
  zoomOut?.addEventListener("click", () => {
    camera = zoomAt(camera, camera.zoom / 1.15, LAYOUT.width / 2, LAYOUT.height / 2, world().width, world().height);
  });
  selectAll?.addEventListener("click", () => selectInView());

  minimap?.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
    minimap.setPointerCapture(event.pointerId);
    jumpMinimap(event);
  });
  minimap?.addEventListener("pointermove", (event) => {
    if (!minimap.hasPointerCapture(event.pointerId)) return;
    jumpMinimap(event);
  });

  map.addEventListener("contextmenu", (event) => event.preventDefault());
  map.addEventListener("pointerdown", onPointerDown);
  map.addEventListener("pointermove", onPointerMove);
  map.addEventListener("pointerup", onPointerUp);
  map.addEventListener("pointercancel", onPointerUp);
  map.addEventListener("pointerleave", () => {
    pointerInside = false;
    if (gesture !== "pan" && gesture !== "box" && gesture !== "pinch") hover = null;
  });
  map.addEventListener("pointerenter", () => {
    pointerInside = true;
  });
  map.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      const local = localPoint(event);
      const factor = event.deltaY > 0 ? 1 / 1.12 : 1.12;
      camera = zoomAt(camera, camera.zoom * factor, local.x, local.y, world().width, world().height);
    },
    { passive: false },
  );

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", (event) => {
    keys.delete(event.key.toLowerCase());
  });
  window.addEventListener("blur", () => keys.clear());

  window.__hearthmarch = {
    getState: () => snapshot(state),
    tileCenter,
    layout: { width: LAYOUT.width, height: LAYOUT.height },
    camera: () => ({ ...camera, worldWidth: world().width, worldHeight: world().height }),
    selection: () => selectedIds.slice(),
    bench: () => measureFrameTimes(state),
  };

  lookAtHearth("ashvale");
  await engine.start();
  exCamera.zoom = 1;
  exCamera.pos = vec(LAYOUT.width / 2, LAYOUT.height / 2);

  function lookAtHearth(kingdomId: string): void {
    const hearth = state.tiles.find((tile) => tile.isHearth && tile.ownerId === kingdomId);
    if (!hearth) return;
    const center = tileCenter(hearth.x, hearth.y);
    camera = clampCamera({ x: center.x, y: center.y, zoom: camera.zoom }, world().width, world().height);
  }

  function localPoint(event: { clientX: number; clientY: number }): { x: number; y: number } {
    const rect = map.getBoundingClientRect();
    const width = rect.width || 1;
    const height = rect.height || 1;
    return {
      x: ((event.clientX - rect.left) / width) * LAYOUT.width,
      y: ((event.clientY - rect.top) / height) * LAYOUT.height,
    };
  }

  function tileUnder(local: { x: number; y: number }): { x: number; y: number } | null {
    const point = screenToWorld(camera, local.x, local.y);
    return tileAtPoint(point.x, point.y, state.width, state.height);
  }

  function refreshHover(local: { x: number; y: number }): void {
    const next = tileUnder(local);
    const changed = next?.x !== hover?.x || next?.y !== hover?.y;
    hover = next;
    const human = humanKingdom(state);
    const occupant = hover ? unitAt(state, hover.x, hover.y) : undefined;
    const own = occupant && human && occupant.kingdomId === human.id;
    map.style.cursor = gesture === "pan" ? "grabbing" : own ? "pointer" : "crosshair";
    if (!changed) return;
    if (!hover || armedPower || selectedIds.length === 0 || state.status !== "playing") {
      previews = [];
      return;
    }
    const ground = getTile(state, hover.x, hover.y);
    if (!ground || ground.terrain === "water") {
      previews = [];
      return;
    }
    previews = [];
    for (const id of selectedIds) {
      const unit = state.units.find((candidate) => candidate.id === id);
      if (!unit) continue;
      if (unit.x === hover.x && unit.y === hover.y) continue;
      const path = findPath(state, unit, hover);
      if (!path || path.length === 0) continue;
      previews.push({ unitId: unit.id, x: unit.x, y: unit.y, path });
    }
  }

  function nudgeCamera(dt: number): void {
    let dx = 0;
    let dy = 0;
    if (keys.has("arrowleft") || keys.has("a")) dx -= 1;
    if (keys.has("arrowright") || keys.has("d")) dx += 1;
    if (keys.has("arrowup") || keys.has("w")) dy -= 1;
    if (keys.has("arrowdown") || keys.has("s")) dy += 1;
    if (pointerInside && pointerKind === "mouse" && gesture === "none") {
      const margin = 22;
      if (pointerLocal.x < margin) dx -= 1;
      if (pointerLocal.x > LAYOUT.width - margin) dx += 1;
      if (pointerLocal.y < margin) dy -= 1;
      if (pointerLocal.y > LAYOUT.height - margin) dy += 1;
    }
    if (dx === 0 && dy === 0) return;
    const step = (PAN_SPEED * dt) / 1000 / camera.zoom;
    camera = clampCamera(
      { x: camera.x + dx * step, y: camera.y + dy * step, zoom: camera.zoom },
      world().width,
      world().height,
    );
  }

  function onPointerDown(event: PointerEvent): void {
    if (choosingGod) return;
    pointerKind = event.pointerType;
    const local = localPoint(event);
    pointerLocal = local;
    contacts.set(event.pointerId, local);
    map.setPointerCapture(event.pointerId);
    if (contacts.size >= 2) {
      gesture = "pinch";
      pinchDistance = contactSpan();
      box = null;
      return;
    }
    if (event.button === 1) {
      gesture = "pan";
      gestureStart = local;
      return;
    }
    if (event.button === 2) {
      gesture = "none";
      commandAt(local);
      return;
    }
    if (event.button === 0 || event.pointerType === "touch") {
      gesture = "pending";
      gestureStart = local;
    }
  }

  function onPointerMove(event: PointerEvent): void {
    pointerKind = event.pointerType;
    pointerInside = true;
    const local = localPoint(event);
    pointerLocal = local;
    const previous = contacts.get(event.pointerId);
    contacts.set(event.pointerId, local);
    if (gesture === "pinch" && contacts.size >= 2) {
      const span = contactSpan();
      if (pinchDistance > 0 && span > 0) {
        camera = zoomAt(
          camera,
          camera.zoom * (span / pinchDistance),
          LAYOUT.width / 2,
          LAYOUT.height / 2,
          world().width,
          world().height,
        );
      }
      pinchDistance = span;
      return;
    }
    if (!previous) return;
    const moved = Math.hypot(local.x - gestureStart.x, local.y - gestureStart.y);
    if (gesture === "pending" && moved > DRAG_SLOP) {
      gesture = event.pointerType === "touch" || event.button === 1 ? "pan" : armedPower ? "pan" : "box";
    }
    if (gesture === "pan") {
      camera = clampCamera(
        {
          x: camera.x - (local.x - previous.x) / camera.zoom,
          y: camera.y - (local.y - previous.y) / camera.zoom,
          zoom: camera.zoom,
        },
        world().width,
        world().height,
      );
      refreshHover(local);
      return;
    }
    if (gesture === "box") {
      box = {
        x: Math.min(gestureStart.x, local.x),
        y: Math.min(gestureStart.y, local.y),
        w: Math.abs(local.x - gestureStart.x),
        h: Math.abs(local.y - gestureStart.y),
      };
      return;
    }
    refreshHover(local);
  }

  function onPointerUp(event: PointerEvent): void {
    const local = localPoint(event);
    contacts.delete(event.pointerId);
    if (gesture === "box" && box) {
      finishBox(event.shiftKey);
    } else if (gesture === "pending") {
      clickAt(local, event);
    }
    if (contacts.size < 2 && gesture === "pinch") gesture = "none";
    if (contacts.size === 0) {
      gesture = "none";
      box = null;
    }
    refreshHover(local);
  }

  function finishBox(shift: boolean): void {
    if (!box) return;
    const a = screenToWorld(camera, box.x, box.y);
    const b = screenToWorld(camera, box.x + box.w, box.y + box.h);
    const human = humanKingdom(state);
    if (!human) return;
    const picked = unitsInWorldRect(state.units, human.id, a.x, a.y, b.x, b.y);
    selectedIds = shift ? unique([...selectedIds, ...picked]) : picked;
    armedPower = null;
    note = "";
  }

  function clickAt(local: { x: number; y: number }, event: PointerEvent): void {
    const tile = tileUnder(local);
    if (armedPower) {
      castAt(tile);
      return;
    }
    const intent = interpretSelectClick(state, tile);
    if (intent.kind === "select") {
      const now = performance.now();
      const repeated = event.detail === 2 || (event.pointerType === "touch" && now - lastTapAt < 350 && lastTapUnit === intent.unitId);
      lastTapAt = now;
      lastTapUnit = intent.unitId;
      if (repeated) {
        selectInView();
        return;
      }
      selectedIds = event.shiftKey ? toggleMember(selectedIds, intent.unitId) : [intent.unitId];
      note = "";
      return;
    }
    if (event.pointerType === "touch" && selectedIds.length > 0 && tile) {
      commandAt(local);
      return;
    }
    if (intent.kind === "clear") selectedIds = [];
  }

  function commandAt(local: { x: number; y: number }): void {
    if (armedPower) {
      armedPower = null;
      note = "";
      return;
    }
    const tile = tileUnder(local);
    const intent = interpretOrderClick(state, selectedIds, tile);
    if (intent.kind === "order") {
      const sent = orderUnits(state, selectedIds, intent.x, intent.y);
      note = sent > 0 ? "" : "No path there.";
      if (note) noteUntil = performance.now() + 1700;
      previews = [];
      return;
    }
    if (intent.kind === "note") {
      note = intent.text;
      noteUntil = performance.now() + 1700;
    }
  }

  function castAt(tile: { x: number; y: number } | null): void {
    const human = humanKingdom(state);
    if (!human || !tile || !armedPower) return;
    const result = castPower(state, human.id, armedPower, tile.x, tile.y);
    if (result.ok) {
      note = "";
      armedPower = null;
      return;
    }
    note = result.reason;
    noteUntil = performance.now() + 1700;
  }

  function selectInView(): void {
    const human = humanKingdom(state);
    if (!human) return;
    const rect = visibleWorldRect(camera);
    selectedIds = unitsInWorldRect(state.units, human.id, rect.left, rect.top, rect.right, rect.bottom);
    note = "";
  }

  function contactSpan(): number {
    const points = [...contacts.values()];
    if (points.length < 2) return 0;
    return Math.hypot(points[0]!.x - points[1]!.x, points[0]!.y - points[1]!.y);
  }

  function jumpMinimap(event: PointerEvent): void {
    if (!minimap) return;
    const rect = minimap.getBoundingClientRect();
    const u = Math.min(1, Math.max(0, (event.clientX - rect.left) / (rect.width || 1)));
    const v = Math.min(1, Math.max(0, (event.clientY - rect.top) / (rect.height || 1)));
    const size = world();
    camera = clampCamera(
      { x: u * size.width, y: v * size.height, zoom: camera.zoom },
      size.width,
      size.height,
    );
  }

  function paintMinimap(): void {
    if (!minimap) return;
    const ctx = minimap.getContext("2d");
    if (!ctx) return;
    const width = minimap.width;
    const height = minimap.height;
    const size = world();
    ctx.fillStyle = "#f3e7d0";
    ctx.fillRect(0, 0, width, height);
    const surfaces = viewSurfaces();
    if (surfaces) {
      ctx.drawImage(surfaces.ground, 0, 0, size.width, size.height, 0, 0, width, height);
    }
    for (const unit of state.units) {
      const kingdom = state.kingdoms.find((item) => item.id === unit.kingdomId);
      const center = tileCenter(unit.x, unit.y);
      ctx.fillStyle = kingdom?.ink ?? "#2f2923";
      ctx.fillRect((center.x / size.width) * width - 1.5, (center.y / size.height) * height - 1.5, 3, 3);
    }
    const view = visibleWorldRect(camera);
    ctx.strokeStyle = "#2f2923";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(
      (view.left / size.width) * width,
      (view.top / size.height) * height,
      ((view.right - view.left) / size.width) * width,
      ((view.bottom - view.top) / size.height) * height,
    );
  }

  function onKeyDown(event: KeyboardEvent): void {
    const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement;
    if (typing) return;
    keys.add(event.key.toLowerCase());
    if (event.repeat) return;
    if (event.key === "Escape") {
      selectedIds = [];
      armedPower = null;
      previews = [];
      return;
    }
    if (choosingGod) return;
    if (event.key === " " && state.status === "playing") {
      event.preventDefault();
      paused = !paused;
      return;
    }
    if (event.key.toLowerCase() === "f" && state.status === "playing") {
      speed = speed === 1 ? 2 : 1;
      return;
    }
    if (event.key.toLowerCase() === "h") {
      lookAtHearth("ashvale");
      return;
    }
    if (event.key === "-" || event.key === "_") {
      camera = zoomAt(camera, camera.zoom / 1.15, LAYOUT.width / 2, LAYOUT.height / 2, world().width, world().height);
      return;
    }
    if (event.key === "=" || event.key === "+") {
      camera = zoomAt(camera, camera.zoom * 1.15, LAYOUT.width / 2, LAYOUT.height / 2, world().width, world().height);
      return;
    }
    if (event.key.toLowerCase() === "e") {
      selectInView();
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
    }
    const human = humanKingdom(state);
    if (!human || state.status !== "playing") return;
    const index = Number(event.key) - 1;
    if (!Number.isInteger(index) || index < 0) return;
    const power = godById(human.godId).powers[index];
    if (!power) return;
    armedPower = armedPower === power.id ? null : power.id;
    if (armedPower) selectedIds = [];
    note = "";
    previews = [];
  }
}

function unique(ids: number[]): number[] {
  return [...new Set(ids)];
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
      camera: () => Camera & { worldWidth: number; worldHeight: number };
      selection: () => number[];
      bench: () => { fullMs: number; cachedMs: number; tiles: number };
    };
  }
}
