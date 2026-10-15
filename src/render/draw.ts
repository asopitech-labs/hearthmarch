import { kingdomById } from "../game/query.ts";
import type { GameState, Kingdom, Tile } from "../game/types.ts";
import { LAYOUT, tileCenter } from "./layout.ts";

const INK = "#2f2923";

export interface DrawInput {
  state: GameState;
  selectedId: number | null;
  hover: { x: number; y: number } | null;
  preview: Array<{ x: number; y: number }> | null;
  time: number;
  reduceMotion: boolean;
}

let paper: HTMLCanvasElement | null = null;

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

function buildPaper(): HTMLCanvasElement {
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = LAYOUT.width * scale;
  canvas.height = LAYOUT.height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.scale(scale, scale);
  const rand = mulberry32(0x51a7);
  ctx.fillStyle = "#f3e7d0";
  ctx.fillRect(0, 0, LAYOUT.width, LAYOUT.height);

  for (let i = 0; i < 6; i++) {
    const x = rand() * LAYOUT.width;
    const y = rand() * LAYOUT.height;
    const radius = 70 + rand() * 150;
    const stain = ctx.createRadialGradient(x, y, 8, x, y, radius);
    stain.addColorStop(0, "rgba(186, 142, 86, 0.09)");
    stain.addColorStop(1, "rgba(186, 142, 86, 0)");
    ctx.fillStyle = stain;
    ctx.beginPath();
    ctx.ellipse(x, y, radius, radius * (0.55 + rand() * 0.4), rand() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < 1100; i++) {
    const x = rand() * LAYOUT.width;
    const y = rand() * LAYOUT.height;
    ctx.strokeStyle = `rgba(92, 68, 40, ${0.015 + rand() * 0.05})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 6 + rand() * 24, y + (rand() - 0.5) * 2.5);
    ctx.stroke();
  }

  for (let i = 0; i < 1600; i++) {
    ctx.fillStyle = `rgba(62, 46, 28, ${0.025 + rand() * 0.06})`;
    ctx.fillRect(rand() * LAYOUT.width, rand() * LAYOUT.height, 1.15, 1.15);
  }

  const vignette = ctx.createRadialGradient(
    LAYOUT.width / 2,
    LAYOUT.height / 2,
    LAYOUT.width * 0.2,
    LAYOUT.width / 2,
    LAYOUT.height / 2,
    LAYOUT.width * 0.72,
  );
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(92, 62, 32, 0.1)");
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, LAYOUT.width, LAYOUT.height);
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

function drawTiles(ctx: CanvasRenderingContext2D, state: GameState, time: number, still: boolean): void {
  for (const tile of state.tiles) {
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
    if (tile.terrain === "water") drawWaves(ctx, tile, time, still);
    else if (tile.terrain === "wood") drawTrees(ctx, tile);
    else drawGrass(ctx, tile);
    if (kingdom && tile.terrain !== "water") drawHatch(ctx, tile, kingdom);
    ctx.restore();
  }
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

function drawEdges(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const tile of state.tiles) {
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

  ctx.font = "15px 'Patrick Hand', cursive";
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
    ctx.strokeStyle = flash.kind === "combat" ? "#a14d45" : INK;
    ctx.lineWidth = flash.kind === "combat" ? 2 : 1.4;
    sketchCircle(ctx, center.x, center.y, 8 + t * 24, flash.x * 17 + flash.y);
    ctx.stroke();
    ctx.restore();
  }
}

function drawFrame(ctx: CanvasRenderingContext2D): void {
  const pad = 14;
  const wobble = (index: number) => (unitRand(index, 3, 9) - 0.5) * 3;
  const x = pad;
  const y = pad;
  const w = LAYOUT.width - pad * 2;
  const h = LAYOUT.height - pad * 2;
  ctx.beginPath();
  ctx.moveTo(x + wobble(1), y);
  ctx.lineTo(x + w + wobble(2), y + wobble(3));
  ctx.lineTo(x + w + wobble(4), y + h + wobble(5));
  ctx.lineTo(x + wobble(6), y + h + wobble(7));
  ctx.closePath();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.stroke();
}

export function drawMap(ctx: CanvasRenderingContext2D, input: DrawInput): void {
  const { state, selectedId, hover, preview, time, reduceMotion } = input;
  if (!paper) paper = buildPaper();

  ctx.clearRect(0, 0, LAYOUT.width, LAYOUT.height);
  ctx.drawImage(paper, 0, 0, LAYOUT.width, LAYOUT.height);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  drawTiles(ctx, state, time, reduceMotion);
  drawEdges(ctx, state);

  if (hover) {
    traceTile(ctx, hover.x, hover.y);
    ctx.save();
    ctx.clip();
    ctx.fillStyle = "rgba(47, 41, 35, 0.07)";
    ctx.fillRect(0, 0, LAYOUT.width, LAYOUT.height);
    ctx.restore();
    traceTile(ctx, hover.x, hover.y);
    ctx.strokeStyle = "rgba(47, 41, 35, 0.65)";
    ctx.lineWidth = 1.4;
    ctx.stroke();
  }

  for (const tile of state.tiles) {
    if (!tile.isHearth) continue;
    const kingdom = tile.ownerId ? kingdomById(state, tile.ownerId) : undefined;
    drawHearth(ctx, tile, kingdom?.ink ?? "#8d7352", time, reduceMotion);
  }

  const selected = state.units.find((unit) => unit.id === selectedId);
  if (selected && preview && preview.length > 0) {
    drawRoute(ctx, selected, preview, "rgba(47, 41, 35, 0.45)");
  } else if (selected && selected.path.length > 0) {
    drawRoute(ctx, selected, selected.path, "rgba(47, 41, 35, 0.72)");
  }

  const ordered = state.units
    .slice()
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .filter((unit) => unit.id !== selectedId);
  for (const unit of ordered) {
    drawMarcher(ctx, state, unit.id, time, reduceMotion, false);
  }
  if (selectedId !== null) drawMarcher(ctx, state, selectedId, time, reduceMotion, true);

  drawFlashes(ctx, state);
  drawFrame(ctx);

  ctx.fillStyle = INK;
  ctx.font = "28px 'Patrick Hand', cursive";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("Reed Marsh", 26, 40);
  ctx.textAlign = "right";
  ctx.font = "22px 'Patrick Hand', cursive";
  ctx.fillText(`Day ${state.day}`, LAYOUT.width - 26, 40);
  ctx.textAlign = "left";
}
