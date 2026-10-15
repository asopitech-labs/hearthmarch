# Engine choice

Checked on 15 October 2026 against the npm registry and the current docs for each library. Versions below are the stable releases that day, not pre-release tags.

Hearthmarch needs a TypeScript game that ships as a static Vite site, with no paid services. The match is a tile grid, many marchers, and a real-time clock that keeps running for a long session. The look is procedural pencil on paper, drawn with Canvas 2D. Later maps will be larger than the screen, with more than one computer kingdom, so the view needs a camera that can scroll and zoom, and pointer positions that survive that camera. The page also has a real DOM tax slider and has to stay usable on a narrow screen.

## Candidates

| Engine | Stable version | License | What it actually is |
| --- | --- | --- | --- |
| Excalibur | 0.32.0 (23 Dec 2025) | BSD-2-Clause | TypeScript 2D engine: loop, scene, camera, pointers, and a Canvas bitmap adapter |
| Phaser | 4.2.1 (9 Jul 2026) | MIT | Large HTML5 framework. Phaser 4 is a WebGL-first rewrite |
| PixiJS | 8.22.0 (10 Oct 2026) | MIT | WebGL/WebGPU renderer. No game loop, camera, or rules |
| Kaplay | 3001.0.19 (12 May 2026) | MIT | Jam-style library with a global `kaplay()` scene |
| Plain Canvas 2D | the browser | — | What the first milestone already uses |

Also looked at and set aside: melonJS 20.8.0 (MIT, 6 Oct 2026) is a full engine aimed at tile maps, but the project is JavaScript with typings rather than TypeScript-first, and its scene model is built around sprite tilemaps we would not use. LittleJS 1.27.0 (MIT) is a small immediate-mode kit without a camera or a TypeScript-first API. Kontra 10.0.2 (MIT) last published in August 2024.

Excalibur’s latest git tag on npm that day was `0.33.0-alpha.247` (21 Sep 2026). The game pins the stable `0.32.0` release.

## Decision

**Excalibur 0.32.0.**

The pieces this game will actually grow into are a world camera and pointer coordinates in that world. Excalibur’s screen docs describe resolution (logical pixels) separately from the CSS viewport, and `DisplayMode.FitContainer` keeps a fixed logical resolution while the canvas fills its parent. Pointer events expose `worldPos`, which already applies the camera. The camera’s focus defaults to the center of the resolution so world `(0, 0)` is the top-left of the view; moving the focus later is how a larger marsh will scroll, and `camera.zoom` is how it will zoom. None of that is wired to a zoom control in this milestone. The logical map stays 960×660 at zoom 1, which is the current game.

The hand-drawn map does not move onto WebGL primitives. Excalibur’s `Canvas` graphic is a documented adapter: a `draw(ctx: CanvasRenderingContext2D)` callback is rasterized to a bitmap and uploaded. The docs call that path low-performance because it re-rasterizes every draw. One 960×660 marsh (drawn at quality 2, so the bitmap is 1920×1320) is a small price for keeping the existing pencil strokes. The kingdom rules never import the engine.

The page around the map stays ordinary DOM. `suppressPlayButton` starts the clock without a click-to-play overlay. `pointerScope: Canvas` keeps pointer capture on the map. `ScrollPreventionMode.None` leaves page scrolling alone. `grabWindowFocus: false` leaves the tax slider in charge of the keyboard.

## Why not the others

**Phaser 4.2.1.** MIT, free, and it has an official Vite + TypeScript template, a camera, and tilemaps. Phaser 4 is a large WebGL framework (arcade physics, tweens, a scene graph, its own input and UI habits). This game would use the camera and the loop, then keep fighting the rest: the pencil map would be a texture rewritten every frame, and the tax slider, levy button, and field notes are already HTML. The v4 rewrite is also young relative to the 3.x line. That is a lot of framework for one bitmap and a clock.

**PixiJS 8.22.0.** MIT and excellent at sprites, but it is a renderer. A clock, a camera, pointer-to-world, and pause/pace would all be new code. Rebuilding the wobbly strokes in `Graphics` would risk the look. Blitting the existing canvas into a Pixi sprite would not move the loop onto an engine.

**Kaplay 3001.0.19.** MIT, and it does have `camPos` / `camScale`. The API is a global jam scene, which sits awkwardly next to a DOM HUD and a simulation that already lives in plain modules. The stable line has not moved since May 2026. Fine for a short sketch, a weak host for a 30–60 minute match that will grow more kingdoms.

**Plain Canvas.** It already draws this milestone correctly, and it is the smallest dependency. It does not provide a camera, world coordinates, or a resize policy. The next map is larger than the viewport and needs scroll and zoom. Building that by hand is the engine work Excalibur already did. Staying on a raw `requestAnimationFrame` loop would not meet the request to move rendering, input, and the frame loop onto an engine. The pencil *drawing* stays Canvas 2D; only the host changes.

## What the migration keeps

- `src/game` has no engine import. Economy, pathing, combat, capture, and the computer kingdom are unchanged.
- `src/render/draw.ts` is still the pencil map. Excalibur calls it from a `Canvas` graphic.
- Clicks are interpreted by `interpretTileClick` in `src/view/pointer.ts` (select your marcher, order a path, or a short note). The view applies that decision. Tests cover the decision without starting an engine.
- The tax slider, levy button, pause, pace, and field notes stay HTML.
