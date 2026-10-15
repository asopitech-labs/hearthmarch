import { getTile, kingdomById } from "../game/query.ts";
import type { GameState, Kingdom, Tile } from "../game/types.ts";
import { canvasFont, t } from "../i18n/locale.ts";
import type { Camera } from "../view/camera.ts";
import { visibleWorldRect } from "../view/camera.ts";
import { LAYOUT, tileCenter, worldSize } from "./layout.ts";

const INK = "#2f2923";

export interface DrawInput {
  state: GameState;
  selectedIds: number[];
  hover: { x: number; y: number } | null;
  previews: Array<{ unitId: number; x: number; y: number; path: Array<{ x: number; y: number }> }>;
  /** Tiles a prepared rite would touch. */
  riteMarks: Array<{ x: number; y: number }>;
  time: number;
  reduceMotion: boolean;
  camera: Camera;
  /** Screen-space drag box. */
  box: { x: number; y: number; w: number; h: number } | null;
}

function hash(x: number, y: number, salt: number): number {
  let n = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(salt | 0, 1440671379);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return (n ^ (n >>> 16)) >>> 0;
}

function unitRand(x: number, y: number, salt: number): number {
  return (hash(x, y, salt) % 10000) / 10000;
}

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;
    let t = Math.imul(value ^ (value >>> 15), 1 | value);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildPaper(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width);
  canvas.height = Math.ceil(height);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const rand = mulberry32(0x51a7);
  ctx.fillStyle = "#f3e7d0";
  ctx.fillRect(0, 0, width, height);

  const stains = Math.max(6, Math.round((width * height) / 180000));
  for (let i = 0; i < stains; i++) {
    const x = rand() * width;
    const y = rand() * height;
    const radius = 70 + rand() * 150;
    const stain = ctx.createRadialGradient(x, y, 8, x, y, radius);
    stain.addColorStop(0, "rgba(186, 142, 86, 0.09)");
    stain.addColorStop(1, "rgba(186, 142, 86, 0)");
    ctx.fillStyle = stain;
    ctx.beginPath();
    ctx.ellipse(x, y, radius, radius * (0.55 + rand() * 0.4), rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  const fibers = Math.min(5200, Math.round((width * height) / 1400));
  for (let i = 0; i < fibers; i++) {
    const x = rand() * width;
    const y = rand() * height;
    ctx.strokeStyle = `rgba(92, 68, 40, ${0.015 + rand() * 0.05})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 6 + rand() * 24, y + (rand() - 0.5) * 2.5);
    ctx.stroke();
  }

  const specks = Math.min(7000, Math.round((width * height) / 1100));
  for (let i = 0; i < specks; i++) {
    ctx.fillStyle = `rgba(62, 46, 28, ${0.025 + rand() * 0.06})`;
    ctx.fillRect(rand() * width, rand() * height, 1.15, 1.15);
  }

  const vignette = ctx.createRadialGradient(
    width / 2,
    height / 2,
    width * 0.2,
    width / 2,
    height / 2,
    width * 0.72,
  );
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(92, 62, 32, 0.1)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);
  return canvas;
}

function corner(cx: number, cy: number): [number, number] {
  const jx = (unitRand(cx, cy, 1) - 0.5) * 6;
  const jy = (unitRand(cx, cy, 2) - 0.5) * 6;
  return [LAYOUT.originX + cx * LAYOUT.tile + jx, LAYOUT.originY + cy * LAYOUT.tile + jy];
}

function traceTile(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  const p0 = corner(x, y);
  const p1 = corner(x + 1, y);
  const p2 = corner(x + 1, y + 1);
  const p3 = corner(x, y + 1);
  ctx.beginPath();
  ctx.moveTo(p0[0], p0[1]);
  ctx.lineTo(p1[0], p1[1]);
  ctx.lineTo(p2[0], p2[1]);
  ctx.lineTo(p3[0], p3[1]);
  ctx.closePath();
}

function sketchCircle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  seed: number,
): void {
  const steps = 9;
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) {
    const angle = (i / steps) * Math.PI * 2;
    const wobble = 1 + (unitRand(seed, i, 2) - 0.5) * 0.16;
    const x = cx + Math.cos(angle) * radius * wobble;
    const y = cy + Math.sin(angle) * radius * wobble * 0.92;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function drawGrass(ctx: CanvasRenderingContext2D, tile: Tile): void {
  const reeds = hash(tile.x, tile.y, 4) % 5 === 0;
  const marks = 3 + (hash(tile.x, tile.y, 5) % 3);
  ctx.lineWidth = 1;
  for (let i = 0; i < marks; i++) {
    const px = LAYOUT.originX + tile.x * LAYOUT.tile + 8 + unitRand(tile.x, tile.y, 10 + i) * (LAYOUT.tile - 16);
    const py = LAYOUT.originY + tile.y * LAYOUT.tile + 12 + unitRand(tile.x, tile.y, 20 + i) * (LAYOUT.tile - 22);
    const height = reeds ? 12 : 7;
    ctx.strokeStyle = reeds ? "rgba(78, 112, 72, 0.45)" : "rgba(110, 96, 58, 0.32)";
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + (unitRand(tile.x, tile.y, 30 + i) - 0.5) * 4, py - height);
    ctx.stroke();
  }
}

function drawTrees(ctx: CanvasRenderingContext2D, tile: Tile): void {
  const cx = LAYOUT.originX + (tile.x + 0.5) * LAYOUT.tile;
  const cy = LAYOUT.originY + (tile.y + 0.58) * LAYOUT.tile;
  ctx.lineWidth = 1.35;
  ctx.strokeStyle = "#55683f";
  const blobs: Array<[number, number, number]> = [
    [cx - 8, cy - 1, 11],
    [cx + 8, cy, 10],
    [cx, cy - 10, 12],
  ];
  blobs.forEach(([x, y, radius], index) => {
    ctx.fillStyle = index === 2 ? "rgba(122, 146, 74, 0.92)" : "rgba(138, 158, 86, 0.9)";
    sketchCircle(ctx, x, y, radius, hash(tile.x, tile.y, 8 + index));
    ctx.fill();
    ctx.stroke();
  });
  ctx.strokeStyle = "#5a4632";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx, cy + 2);
  ctx.lineTo(cx + 1, cy + 14);
  ctx.stroke();
}

function drawWaves(ctx: CanvasRenderingContext2D, tile: Tile, time: number, still: boolean): void {
  const left = LAYOUT.originX + tile.x * LAYOUT.tile + 5;
  const right = left + LAYOUT.tile - 10;
  const top = LAYOUT.originY + tile.y * LAYOUT.tile + 12;
  ctx.strokeStyle = "rgba(70, 118, 136, 0.75)";
  ctx.lineWidth = 1.25;
  for (let i = 0; i < 4; i++) {
    const y = top + i * 9;
    const phase = still ? tile.x + i : time / 520 + tile.x * 0.45 + i;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.quadraticCurveTo((left + right) / 2, y + Math.sin(phase) * 2.6, right, y + 0.6);
    ctx.stroke();
  }
}

function drawHatch(ctx: CanvasRenderingContext2D, tile: Tile, kingdom: Kingdom): void {
  ctx.save();
  ctx.strokeStyle = kingdom.ink;
  ctx.globalAlpha = 0.16;
  ctx.lineWidth = 1;
  const x0 = LAYOUT.originX + tile.x * LAYOUT.tile;
  const y0 = LAYOUT.originY + tile.y * LAYOUT.tile;
  for (let i = 0; i < 3; i++) {
    const offset = 12 + i * 13;
    ctx.beginPath();
    ctx.moveTo(x0 + offset, y0 + 8);
    ctx.lineTo(x0 + offset - 12, y0 + LAYOUT.tile - 8);
    ctx.stroke();
  }
  ctx.restore();
}

function paintStaticTile(ctx: CanvasRenderingContext2D, state: GameState, tile: Tile): void {
  const kingdom = tile.ownerId ? kingdomById(state, tile.ownerId) : undefined;
  traceTile(ctx, tile.x, tile.y);
  if (tile.terrain === "water") ctx.fillStyle = "#d7e7ee";
  else if (tile.terrain === "wood") ctx.fillStyle = "#d5e0b8";
  else ctx.fillStyle = "#efe3c6";
  ctx.fill();
  if (kingdom && tile.terrain !== "water") {
    ctx.fillStyle = kingdom.wash;
    ctx.fill();
  }

  ctx.save();
  traceTile(ctx, tile.x, tile.y);
  ctx.clip();
  if (tile.terrain === "wood") drawTrees(ctx, tile);
  else if (tile.terrain !== "water") drawGrass(ctx, tile);
  if (kingdom && tile.terrain !== "water") drawHatch(ctx, tile, kingdom);
  ctx.restore();
  paintTileEdges(ctx, state, tile);
}

function ownersDiffer(state: GameState, tile: Tile, nx: number, ny: number): boolean {
  if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) return true;
  const other = state.tiles[ny * state.width + nx];
  if (!other) return true;
  if (tile.terrain === "water" && other.terrain === "water") return false;
  if (tile.terrain === "water" || other.terrain === "water") return true;
  return tile.ownerId !== other.ownerId;
}

function drawEdge(
  ctx: CanvasRenderingContext2D,
  a: [number, number],
  b: [number, number],
  strong: boolean,
): void {
  const mx = (a[0] + b[0]) / 2 + (unitRand(Math.round(a[0]), Math.round(a[1]), strong ? 3 : 5) - 0.5) * 2.4;
  const my = (a[1] + b[1]) / 2 + (unitRand(Math.round(b[0]), Math.round(b[1]), 6) - 0.5) * 2.4;
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.quadraticCurveTo(mx, my, b[0], b[1]);
  ctx.strokeStyle = strong ? "rgba(47, 41, 35, 0.82)" : "rgba(47, 41, 35, 0.2)";
  ctx.lineWidth = strong ? 1.65 : 0.8;
  ctx.stroke();
}

function paintTileEdges(ctx: CanvasRenderingContext2D, state: GameState, tile: Tile): void {
  const north = corner(tile.x, tile.y);
  const east = corner(tile.x + 1, tile.y);
  const south = corner(tile.x, tile.y + 1);
  const southEast = corner(tile.x + 1, tile.y + 1);
  if (tile.x === 0) {
    drawEdge(ctx, north, south, ownersDiffer(state, tile, tile.x - 1, tile.y));
  }
  if (tile.y === 0) {
    drawEdge(ctx, north, east, ownersDiffer(state, tile, tile.x, tile.y - 1));
  }
  drawEdge(ctx, east, southEast, ownersDiffer(state, tile, tile.x + 1, tile.y));
  drawEdge(ctx, south, southEast, ownersDiffer(state, tile, tile.x, tile.y + 1));
}

function drawHearth(ctx: CanvasRenderingContext2D, tile: Tile, ink: string, time: number, still: boolean): void {
  const center = tileCenter(tile.x, tile.y);
  const bob = still ? 0 : Math.sin(time / 700 + tile.x) * 0.35;
  ctx.save();
  ctx.translate(0, bob);
  ctx.fillStyle = "rgba(47,41,35,0.12)";
  ctx.beginPath();
  ctx.ellipse(center.x, center.y + 16, 16, 4.2, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#f7efe0";
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(center.x - 13, center.y + 12);
  ctx.lineTo(center.x - 12, center.y - 1);
  ctx.lineTo(center.x + 13, center.y);
  ctx.lineTo(center.x + 12, center.y + 13);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.moveTo(center.x - 18, center.y + 1);
  ctx.quadraticCurveTo(center.x - 4, center.y - 8, center.x, center.y - 16);
  ctx.quadraticCurveTo(center.x + 6, center.y - 6, center.x + 18, center.y + 1);
  ctx.quadraticCurveTo(center.x, center.y - 3, center.x - 18, center.y + 1);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = INK;
  ctx.fillRect(center.x - 3, center.y + 3, 6, 10);

  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(center.x + 8, center.y - 1);
  ctx.lineTo(center.x + 9, center.y - 20);
  ctx.stroke();
  ctx.fillStyle = ink;
  ctx.beginPath();
  ctx.moveTo(center.x + 9, center.y - 19);
  ctx.lineTo(center.x + 19, center.y - 15);
  ctx.lineTo(center.x + 9, center.y - 12);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  const puff = still ? 0.35 : (time / 900 + tile.x) % 1;
  ctx.fillStyle = `rgba(90, 86, 80, ${0.28 * (1 - puff)})`;
  ctx.beginPath();
  ctx.arc(center.x + 5, center.y - 18 - puff * 14, 2.1 + puff * 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawRoute(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  points: Array<{ x: number; y: number }>,
  color: string,
): void {
  if (points.length === 0) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.35;
  ctx.setLineDash([1, 6]);
  ctx.beginPath();
  const start = tileCenter(from.x, from.y);
  ctx.moveTo(start.x, start.y);
  for (const point of points) {
    const center = tileCenter(point.x, point.y);
    ctx.lineTo(center.x, center.y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  for (const point of points) {
    const center = tileCenter(point.x, point.y);
    ctx.beginPath();
    ctx.arc(center.x, center.y, 2.1, 0, Math.PI * 2);
    ctx.fill();
  }
  const last = points[points.length - 1];
  if (last) {
    const center = tileCenter(last.x, last.y);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(center.x - 5, center.y - 5);
    ctx.lineTo(center.x + 5, center.y + 5);
    ctx.moveTo(center.x + 5, center.y - 5);
    ctx.lineTo(center.x - 5, center.y + 5);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMarcher(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  unitId: number,
  time: number,
  still: boolean,
  selected: boolean,
): void {
  const unit = state.units.find((candidate) => candidate.id === unitId);
  if (!unit) return;
  const kingdom = kingdomById(state, unit.kingdomId);
  const center = tileCenter(unit.x, unit.y);
  const moving = unit.path.length > 0;
  const bob = still ? 0 : Math.sin(time / 180 + unit.seq) * (moving ? 1.7 : 0.4);
  const cx = center.x;
  const cy = center.y + bob;

  const human = kingdom?.controlledBy === "human";
  if (selected || (human && !moving)) {
    ctx.save();
    ctx.strokeStyle = selected ? INK : "rgba(47,41,35,0.35)";
    ctx.lineWidth = selected ? 1.6 : 1.1;
    ctx.setLineDash(selected ? [4, 4] : [2, 5]);
    sketchCircle(ctx, center.x, center.y + 2, selected ? 18 : 16, unit.seq + 4);
    ctx.stroke();
    ctx.restore();
  }

  ctx.fillStyle = "rgba(47,41,35,0.13)";
  ctx.beginPath();
  ctx.ellipse(cx, center.y + 14, 9, 3.3, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(247, 239, 224, 0.88)";
  ctx.beginPath();
  ctx.ellipse(cx, center.y + 11, 8, 3.4, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = kingdom?.ink ?? "#888";
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.45;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 10);
  ctx.quadraticCurveTo(cx + 12, cy + 2, cx + 7, cy + 12);
  ctx.lineTo(cx - 7, cy + 12);
  ctx.quadraticCurveTo(cx - 12, cy + 1, cx, cy - 10);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#f2d0b4";
  ctx.beginPath();
  ctx.arc(cx, cy - 13, 5.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(cx - 1.7, cy - 13.2, 0.7, 0, Math.PI * 2);
  ctx.arc(cx + 1.8, cy - 13.2, 0.7, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#5c4632";
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(cx + 8, cy - 20);
  ctx.lineTo(cx + 10, cy + 12);
  ctx.stroke();
  ctx.fillStyle = "#e7e1d4";
  ctx.beginPath();
  ctx.moveTo(cx + 8, cy - 20);
  ctx.lineTo(cx + 13, cy - 15);
  ctx.lineTo(cx + 7, cy - 14);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.font = canvasFont(15);
  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(String(unit.strength), cx, center.y + 24);
}

function drawFlashes(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const flash of state.flashes) {
    const center = tileCenter(flash.x, flash.y);
    const life = flash.kind === "combat" ? 820 : 640;
    const t = 1 - Math.max(0, flash.ms) / life;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - t);
    ctx.strokeStyle =
      flash.kind === "combat" ? "#a14d45" : flash.kind === "rite" ? "#c4a15a" : INK;
    ctx.lineWidth = flash.kind === "combat" ? 2 : 1.4;
    sketchCircle(ctx, center.x, center.y, 8 + t * 24, flash.x * 17 + flash.y);
    ctx.stroke();
    ctx.restore();
  }
}

function tileStamp(tile: Tile): number {
  const terrain = tile.terrain === "water" ? 1 : tile.terrain === "wood" ? 2 : 3;
  let owner = 0;
  if (tile.ownerId) {
    for (let i = 0; i < tile.ownerId.length; i++) {
      owner = (owner * 33 + tile.ownerId.charCodeAt(i)) & 255;
    }
    owner += 1;
  }
  return terrain + owner * 8 + (tile.isHearth ? 4096 : 0);
}

class GroundCache {
  readonly paper: HTMLCanvasElement;
  readonly ground: HTMLCanvasElement;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly mapW: number;
  readonly mapH: number;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly stamp: Uint16Array;
  generation = 0;

  constructor(mapW: number, mapH: number) {
    const world = worldSize(mapW, mapH);
    this.mapW = mapW;
    this.mapH = mapH;
    this.worldWidth = world.width;
    this.worldHeight = world.height;
    this.paper = buildPaper(world.width, world.height);
    this.ground = document.createElement("canvas");
    this.ground.width = Math.ceil(world.width);
    this.ground.height = Math.ceil(world.height);
    const ctx = this.ground.getContext("2d");
    if (!ctx) throw new Error("Could not paint the marsh");
    this.ctx = ctx;
    this.stamp = new Uint16Array(mapW * mapH);
    this.stamp.fill(0xffff);
  }

  /** Repaint tiles whose terrain or owner changed. Returns how many were painted. */
  sync(state: GameState): number {
    const dirty: number[] = [];
    for (let i = 0; i < state.tiles.length; i++) {
      const stamp = tileStamp(state.tiles[i]!);
      if (stamp !== this.stamp[i]) {
        dirty.push(i);
        this.stamp[i] = stamp;
      }
    }
    if (dirty.length === 0) return 0;
    const paint = new Set<number>();
    for (const index of dirty) {
      const tile = state.tiles[index]!;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = tile.x + dx;
          const ny = tile.y + dy;
          if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) continue;
          paint.add(ny * state.width + nx);
        }
      }
    }
    const pad = 10;
    for (const index of paint) {
      const tile = state.tiles[index]!;
      this.ctx.clearRect(
        LAYOUT.originX + tile.x * LAYOUT.tile - pad,
        LAYOUT.originY + tile.y * LAYOUT.tile - pad,
        LAYOUT.tile + pad * 2,
        LAYOUT.tile + pad * 2,
      );
    }
    this.ctx.lineJoin = "round";
    this.ctx.lineCap = "round";
    for (const index of paint) paintStaticTile(this.ctx, state, state.tiles[index]!);
    this.generation += 1;
    return paint.size;
  }

  invalidate(): void {
    this.stamp.fill(0xffff);
  }
}

let cache: GroundCache | null = null;

export function resetViewCache(): void {
  cache = null;
}

export function viewSurfaces(): {
  paper: HTMLCanvasElement;
  ground: HTMLCanvasElement;
  worldWidth: number;
  worldHeight: number;
  generation: number;
} | null {
  if (!cache) return null;
  return {
    paper: cache.paper,
    ground: cache.ground,
    worldWidth: cache.worldWidth,
    worldHeight: cache.worldHeight,
    generation: cache.generation,
  };
}

function blitVisible(
  ctx: CanvasRenderingContext2D,
  image: HTMLCanvasElement,
  camera: Camera,
  worldWidth: number,
  worldHeight: number,
): void {
  const zoom = camera.zoom;
  let sx = camera.x - LAYOUT.width / (2 * zoom);
  let sy = camera.y - LAYOUT.height / (2 * zoom);
  let sw = LAYOUT.width / zoom;
  let sh = LAYOUT.height / zoom;
  let dx = 0;
  let dy = 0;
  let dw = LAYOUT.width;
  let dh = LAYOUT.height;
  if (sx < 0) {
    const cut = -sx;
    dx += (cut / sw) * dw;
    dw -= (cut / sw) * dw;
    sw -= cut;
    sx = 0;
  }
  if (sy < 0) {
    const cut = -sy;
    dy += (cut / sh) * dh;
    dh -= (cut / sh) * dh;
    sh -= cut;
    sy = 0;
  }
  if (sx + sw > worldWidth) {
    const overflow = sx + sw - worldWidth;
    dw -= (overflow / sw) * dw;
    sw -= overflow;
  }
  if (sy + sh > worldHeight) {
    const overflow = sy + sh - worldHeight;
    dh -= (overflow / sh) * dh;
    sh -= overflow;
  }
  if (sw <= 1 || sh <= 1 || dw <= 1 || dh <= 1) return;
  ctx.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
}

function withWorld(ctx: CanvasRenderingContext2D, camera: Camera, draw: () => void): void {
  ctx.save();
  const matrix = ctx.getTransform();
  const scale = matrix.a || 1;
  const zoom = camera.zoom;
  ctx.setTransform(
    scale * zoom,
    0,
    0,
    scale * zoom,
    matrix.e + scale * (LAYOUT.width / 2 - camera.x * zoom),
    matrix.f + scale * (LAYOUT.height / 2 - camera.y * zoom),
  );
  draw();
  ctx.restore();
}

function tileWindow(state: GameState, camera: Camera): { x0: number; y0: number; x1: number; y1: number } {
  const rect = visibleWorldRect(camera);
  return {
    x0: Math.max(0, Math.floor((rect.left - LAYOUT.originX) / LAYOUT.tile) - 1),
    y0: Math.max(0, Math.floor((rect.top - LAYOUT.originY) / LAYOUT.tile) - 1),
    x1: Math.min(state.width - 1, Math.ceil((rect.right - LAYOUT.originX) / LAYOUT.tile) + 1),
    y1: Math.min(state.height - 1, Math.ceil((rect.bottom - LAYOUT.originY) / LAYOUT.tile) + 1),
  };
}

function paintDynamic(ctx: CanvasRenderingContext2D, input: DrawInput): void {
  const { state, selectedIds, hover, previews, riteMarks, time, reduceMotion, camera } = input;
  const selected = new Set(selectedIds);
  const window = tileWindow(state, camera);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  for (let y = window.y0; y <= window.y1; y++) {
    for (let x = window.x0; x <= window.x1; x++) {
      const tile = state.tiles[y * state.width + x];
      if (tile?.terrain === "water") drawWaves(ctx, tile, time, reduceMotion);
    }
  }

  if (hover && hover.x >= 0 && hover.y >= 0 && hover.x < state.width && hover.y < state.height) {
    traceTile(ctx, hover.x, hover.y);
    ctx.save();
    ctx.clip();
    ctx.fillStyle = "rgba(47, 41, 35, 0.07)";
    const center = tileCenter(hover.x, hover.y);
    ctx.fillRect(center.x - LAYOUT.tile, center.y - LAYOUT.tile, LAYOUT.tile * 2, LAYOUT.tile * 2);
    ctx.restore();
    traceTile(ctx, hover.x, hover.y);
    ctx.strokeStyle = "rgba(47, 41, 35, 0.65)";
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }

  for (const mark of riteMarks) {
    if (!getTile(state, mark.x, mark.y)) continue;
    traceTile(ctx, mark.x, mark.y);
    ctx.strokeStyle = "rgba(196, 161, 90, 0.9)";
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }

  for (let y = window.y0; y <= window.y1; y++) {
    for (let x = window.x0; x <= window.x1; x++) {
      const tile = state.tiles[y * state.width + x];
      if (!tile?.isHearth) continue;
      const kingdom = tile.ownerId ? kingdomById(state, tile.ownerId) : undefined;
      drawHearth(ctx, tile, kingdom?.ink ?? "#8d7352", time, reduceMotion);
    }
  }

  const previewUnits = new Set(previews.map((preview) => preview.unitId));
  for (const preview of previews) {
    if (preview.path.length === 0) continue;
    drawRoute(ctx, preview, preview.path, "rgba(47, 41, 35, 0.45)");
  }
  for (const unit of state.units) {
    if (!selected.has(unit.id) || unit.path.length === 0 || previewUnits.has(unit.id)) continue;
    drawRoute(ctx, unit, unit.path, "rgba(47, 41, 35, 0.72)");
  }

  const ordered = state.units
    .filter((unit) => {
      if (selected.has(unit.id)) return false;
      return unit.x >= window.x0 && unit.x <= window.x1 && unit.y >= window.y0 && unit.y <= window.y1;
    })
    .sort((a, b) => a.y - b.y || a.x - b.x);
  for (const unit of ordered) drawMarcher(ctx, state, unit.id, time, reduceMotion, false);
  for (const id of selectedIds) drawMarcher(ctx, state, id, time, reduceMotion, true);
  drawFlashes(ctx, state);
}

function paintChrome(ctx: CanvasRenderingContext2D, input: DrawInput): void {
  if (input.box && input.box.w > 0 && input.box.h > 0) {
    ctx.save();
    ctx.strokeStyle = "rgba(47, 41, 35, 0.85)";
    ctx.fillStyle = "rgba(216, 122, 50, 0.12)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.fillRect(input.box.x, input.box.y, input.box.w, input.box.h);
    ctx.strokeRect(input.box.x, input.box.y, input.box.w, input.box.h);
    ctx.restore();
  }
  ctx.fillStyle = INK;
  ctx.font = canvasFont(28);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(t("map.name"), 26, 40);
  ctx.textAlign = "right";
  ctx.font = canvasFont(22);
  ctx.fillText(t("day.label", { day: input.state.day }), LAYOUT.width - 26, 40);
  ctx.textAlign = "left";
}

function ensureCache(state: GameState): GroundCache {
  if (!cache || cache.mapW !== state.width || cache.mapH !== state.height) {
    cache = new GroundCache(state.width, state.height);
  }
  return cache;
}

export function drawView(ctx: CanvasRenderingContext2D, input: DrawInput): void {
  const surfaces = ensureCache(input.state);
  surfaces.sync(input.state);
  ctx.clearRect(0, 0, LAYOUT.width, LAYOUT.height);
  blitVisible(ctx, surfaces.paper, input.camera, surfaces.worldWidth, surfaces.worldHeight);
  blitVisible(ctx, surfaces.ground, input.camera, surfaces.worldWidth, surfaces.worldHeight);
  withWorld(ctx, input.camera, () => paintDynamic(ctx, input));
  paintChrome(ctx, input);
}

export interface FrameSample {
  fullMs: number;
  cachedMs: number;
  tiles: number;
}

/** Time a full terrain rebuild against a frame that only blits the cache. */
export function measureFrameTimes(state: GameState): FrameSample {
  const sample = new GroundCache(state.width, state.height);
  const canvas = document.createElement("canvas");
  canvas.width = LAYOUT.width;
  canvas.height = LAYOUT.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { fullMs: 0, cachedMs: 0, tiles: state.tiles.length };
  const camera: Camera = {
    x: sample.worldWidth / 2,
    y: sample.worldHeight / 2,
    zoom: 1,
  };
  const input: DrawInput = {
    state,
    selectedIds: [],
    hover: null,
    previews: [],
    riteMarks: [],
    time: 0,
    reduceMotion: true,
    camera,
    box: null,
  };
  const frames = 6;
  const fullStart = performance.now();
  for (let i = 0; i < frames; i++) {
    sample.invalidate();
    sample.sync(state);
    ctx.clearRect(0, 0, LAYOUT.width, LAYOUT.height);
    blitVisible(ctx, sample.paper, camera, sample.worldWidth, sample.worldHeight);
    blitVisible(ctx, sample.ground, camera, sample.worldWidth, sample.worldHeight);
    withWorld(ctx, camera, () => paintDynamic(ctx, input));
  }
  const fullMs = (performance.now() - fullStart) / frames;
  sample.sync(state);
  const cachedStart = performance.now();
  for (let i = 0; i < frames; i++) {
    sample.sync(state);
    ctx.clearRect(0, 0, LAYOUT.width, LAYOUT.height);
    blitVisible(ctx, sample.paper, camera, sample.worldWidth, sample.worldHeight);
    blitVisible(ctx, sample.ground, camera, sample.worldWidth, sample.worldHeight);
    withWorld(ctx, camera, () => paintDynamic(ctx, input));
  }
  const cachedMs = (performance.now() - cachedStart) / frames;
  return { fullMs, cachedMs, tiles: state.tiles.length };
}
