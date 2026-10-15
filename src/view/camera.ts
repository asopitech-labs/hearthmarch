import { LAYOUT } from "../render/layout.ts";

/** Close enough to read a cottage. Far enough that a phone still sees a neighborhood. */
export const ZOOM_MIN = 0.55;
export const ZOOM_MAX = 1.65;

export interface Camera {
  /** World-pixel point kept at the middle of the view. */
  x: number;
  y: number;
  zoom: number;
}

export function screenToWorld(
  camera: Camera,
  screenX: number,
  screenY: number,
  viewWidth = LAYOUT.width,
  viewHeight = LAYOUT.height,
): { x: number; y: number } {
  return {
    x: (screenX - viewWidth / 2) / camera.zoom + camera.x,
    y: (screenY - viewHeight / 2) / camera.zoom + camera.y,
  };
}

export function worldToScreen(
  camera: Camera,
  worldX: number,
  worldY: number,
  viewWidth = LAYOUT.width,
  viewHeight = LAYOUT.height,
): { x: number; y: number } {
  return {
    x: (worldX - camera.x) * camera.zoom + viewWidth / 2,
    y: (worldY - camera.y) * camera.zoom + viewHeight / 2,
  };
}

export function clampCamera(
  camera: Camera,
  worldWidth: number,
  worldHeight: number,
  viewWidth = LAYOUT.width,
  viewHeight = LAYOUT.height,
): Camera {
  const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, camera.zoom));
  const halfW = viewWidth / (2 * zoom);
  const halfH = viewHeight / (2 * zoom);
  const x =
    worldWidth <= halfW * 2 ? worldWidth / 2 : Math.min(worldWidth - halfW, Math.max(halfW, camera.x));
  const y =
    worldHeight <= halfH * 2
      ? worldHeight / 2
      : Math.min(worldHeight - halfH, Math.max(halfH, camera.y));
  return { x, y, zoom };
}

/** Zoom while keeping the world point under the cursor fixed. */
export function zoomAt(
  camera: Camera,
  nextZoom: number,
  screenX: number,
  screenY: number,
  worldWidth: number,
  worldHeight: number,
  viewWidth = LAYOUT.width,
  viewHeight = LAYOUT.height,
): Camera {
  const before = screenToWorld(camera, screenX, screenY, viewWidth, viewHeight);
  const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, nextZoom));
  return clampCamera(
    {
      x: before.x - (screenX - viewWidth / 2) / zoom,
      y: before.y - (screenY - viewHeight / 2) / zoom,
      zoom,
    },
    worldWidth,
    worldHeight,
    viewWidth,
    viewHeight,
  );
}

export function visibleWorldRect(
  camera: Camera,
  viewWidth = LAYOUT.width,
  viewHeight = LAYOUT.height,
): { left: number; top: number; right: number; bottom: number } {
  const halfW = viewWidth / (2 * camera.zoom);
  const halfH = viewHeight / (2 * camera.zoom);
  return {
    left: camera.x - halfW,
    top: camera.y - halfH,
    right: camera.x + halfW,
    bottom: camera.y + halfH,
  };
}
