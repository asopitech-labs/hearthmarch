import { describe, expect, it } from "vitest";
import { findPath } from "../src/game/path.ts";
import { createSkirmish } from "../src/game/sim.ts";
import { MAP_HEIGHT, MAP_WIDTH } from "../src/game/map.ts";
import { tileCenter } from "../src/render/layout.ts";
import { clampCamera, screenToWorld, visibleWorldRect, worldToScreen, zoomAt, ZOOM_MAX, ZOOM_MIN } from "../src/view/camera.ts";
import { toggleMember, unitsInWorldRect } from "../src/view/select.ts";

describe("the wide marsh", () => {
  it("is much larger than one screen and still has a land road between the hearths", () => {
    const state = createSkirmish();
    expect(state.width).toBe(MAP_WIDTH);
    expect(state.height).toBe(MAP_HEIGHT);
    expect(state.width * state.height).toBeGreaterThan(16 * 11 * 4);
    const terrains = new Set(state.tiles.map((tile) => tile.terrain));
    expect(terrains.has("meadow")).toBe(true);
    expect(terrains.has("wood")).toBe(true);
    expect(terrains.has("water")).toBe(true);
    const player = state.tiles.find((tile) => tile.isHearth && tile.ownerId === "ashvale")!;
    const cpu = state.tiles.find((tile) => tile.isHearth && tile.ownerId === "reedmoor")!;
    const unit = state.units.find((item) => item.kingdomId === "ashvale")!;
    unit.x = player.x;
    unit.y = player.y;
    const path = findPath(state, unit, cpu);
    expect(path).not.toBeNull();
    expect(path!.length).toBeGreaterThan(50);
  });
});

describe("camera", () => {
  const world = { width: 3000, height: 2000 };

  it("clamps pan and zoom", () => {
    const camera = clampCamera({ x: -100, y: 9000, zoom: 8 }, world.width, world.height);
    expect(camera.zoom).toBe(ZOOM_MAX);
    expect(camera.x).toBeGreaterThan(0);
    expect(camera.y).toBeLessThan(world.height);
  });

  it("zooms toward the cursor and round-trips a world point", () => {
    const start = clampCamera({ x: 1500, y: 1000, zoom: 1 }, world.width, world.height);
    const next = zoomAt(start, 1.4, 200, 180, world.width, world.height);
    expect(next.zoom).toBeCloseTo(1.4);
    const worldPoint = screenToWorld(start, 200, 180);
    const screen = worldToScreen(next, worldPoint.x, worldPoint.y);
    expect(screen.x).toBeCloseTo(200);
    expect(screen.y).toBeCloseTo(180);
    const min = zoomAt(start, 0.1, 480, 330, world.width, world.height);
    expect(min.zoom).toBe(ZOOM_MIN);
  });

  it("maps a minimap fraction onto the marsh", () => {
    const camera = clampCamera(
      { x: 0.25 * world.width, y: 0.75 * world.height, zoom: 1 },
      world.width,
      world.height,
    );
    expect(camera.x / world.width).toBeCloseTo(0.25, 1);
    expect(camera.y / world.height).toBeCloseTo(0.75, 1);
    const view = visibleWorldRect(camera);
    expect(view.right - view.left).toBeCloseTo(960);
  });
});

describe("selection", () => {
  it("toggles a marcher and boxes only your own", () => {
    const state = createSkirmish();
    const yours = state.units.filter((unit) => unit.kingdomId === "ashvale");
    const theirs = state.units.find((unit) => unit.kingdomId === "reedmoor")!;
    expect(toggleMember([], yours[0]!.id)).toEqual([yours[0]!.id]);
    expect(toggleMember([yours[0]!.id], yours[0]!.id)).toEqual([]);
    const center = tileCenter(yours[0]!.x, yours[0]!.y);
    const boxed = unitsInWorldRect(
      state.units,
      "ashvale",
      center.x - 200,
      center.y - 200,
      center.x + 200,
      center.y + 200,
    );
    expect(boxed).toContain(yours[0]!.id);
    expect(boxed).not.toContain(theirs.id);
  });
});
