import { tileCenter } from "../render/layout.ts";

export function toggleMember(ids: number[], id: number): number[] {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
}

export function unitsInWorldRect(
  units: ReadonlyArray<{ id: number; kingdomId: string; x: number; y: number }>,
  kingdomId: string,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number[] {
  const left = Math.min(x0, x1);
  const right = Math.max(x0, x1);
  const top = Math.min(y0, y1);
  const bottom = Math.max(y0, y1);
  const picked: number[] = [];
  for (const unit of units) {
    if (unit.kingdomId !== kingdomId) continue;
    const center = tileCenter(unit.x, unit.y);
    if (center.x >= left && center.x <= right && center.y >= top && center.y <= bottom) {
      picked.push(unit.id);
    }
  }
  return picked;
}
