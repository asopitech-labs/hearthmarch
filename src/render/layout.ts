export const LAYOUT = {
  width: 960,
  height: 660,
  originX: 64,
  originY: 62,
  tile: 52,
};

export function worldSize(mapWidth: number, mapHeight: number): { width: number; height: number } {
  return {
    width: LAYOUT.originX + mapWidth * LAYOUT.tile + LAYOUT.originX,
    height: LAYOUT.originY + mapHeight * LAYOUT.tile + LAYOUT.originY,
  };
}

export function tileCenter(x: number, y: number): { x: number; y: number } {
  return {
    x: LAYOUT.originX + (x + 0.5) * LAYOUT.tile,
    y: LAYOUT.originY + (y + 0.5) * LAYOUT.tile,
  };
}

export function tileAtPoint(
  px: number,
  py: number,
  mapWidth: number,
  mapHeight: number,
): { x: number; y: number } | null {
  const x = Math.floor((px - LAYOUT.originX) / LAYOUT.tile);
  const y = Math.floor((py - LAYOUT.originY) / LAYOUT.tile);
  if (x < 0 || y < 0 || x >= mapWidth || y >= mapHeight) return null;
  return { x, y };
}

export function eventToLogical(
  canvas: HTMLCanvasElement,
  ev: { clientX: number; clientY: number },
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const width = rect.width || 1;
  const height = rect.height || 1;
  return {
    x: ((ev.clientX - rect.left) / width) * LAYOUT.width,
    y: ((ev.clientY - rect.top) / height) * LAYOUT.height,
  };
}
