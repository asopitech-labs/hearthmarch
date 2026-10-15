# Hearthmarch

A browser strategy game. Two kingdoms share a hand-drawn marsh. Time passes whether or not you give an order. The tax rate trades gold for villagers, villagers become marchers, and marchers claim tiles by standing on them. Take the rival hearth to win. Lose yours, and the marsh belongs to someone else.

Hearthmarch is an original game. The loop — a living clock, a tax that trades coin for people, and small units spreading territory — is inspired by early real-time kingdom games, especially Falcom's *Lord Monarch* (1991). It does not use that game's maps, art, or names.

This is the first playable milestone: you (Ashvale) against one computer kingdom (Reedmoor). Kingdoms are a list. Dawn, combat, and victory already walk that list, so later milestones can add more rivals without rewriting the clock.

## Run

```bash
npm install
npm run dev
```

Open http://127.0.0.1:43123

```bash
npm test
npm run build
```

`npm run build` typechecks and writes a static site to `dist/`. There is no backend. Serve `dist/` with any static file host if you want to play the built files.

## How to play

- Apricot ground is yours. Teal ground is Reedmoor's. Pale ground is unclaimed. Blue strokes are water, and water cannot be crossed. Scribbled canopies are woods, and woods slow a march.
- The marsh is wider than the window. Drag it, use WASD or the arrow keys, or click the small map to look around. The wheel, a pinch, and the + − buttons zoom. H looks back at your hearth.
- Each cottage is a hearth. Capture Reedmoor's hearth to win. If Reedmoor captures yours, you lose.
- Before the march, choose a god. Lark opens meadows and steadies marchers. Kiln lifts shores and shakes the ground. Mere sinks meadows and pulls marchers toward water. Reedmoor keeps one of the others.
- Drag **Tax**. At 0% the villages grow and gold does not. At 30% the coffer fills and the villages stop growing. In between, you get some of each. Faith, the prayer you spend on rites, grows with the villages and stops at 30% tax. When a kingdom's villagers reach the muster line, a marcher appears near its hearth.
- A rite spends faith. Press 1, 2, or 3, or click the rite, then click the marsh. Each rite rests for a few seconds after it lands.
- **Call a levy** spends gold to raise a marcher immediately.
- Left-click a marcher, or drag a box around several. Shift-click adds one. Right-click sends them. A dotted line shows the path. On a touch screen, tap a marcher, then tap the ground. They walk around water and around your other marchers, and claim every tile they step on. Stepping onto an enemy marcher starts a skirmish. The stronger side stays, wounded. Equal strength favors whoever already held the tile.
- A hearth shelters its defender. Fighting on a cottage is harder than fighting in the open.
- Reedmoor sets its own tax, raises marchers, calls rites through the match, and pushes toward your hearth. Standing still is a way to lose.
- Pause with the button or Space. F or the pace button switches to 2×. Start over deals the same marsh again.

Reedmoor's captain keeps the cottage for the first stretch of mornings, then marches. A focused game on this marsh runs on the order of fifteen to thirty minutes. See `docs/controls.md` for where the camera and the orders come from.

## Project layout

- `src/game` holds state, economy, pathfinding, combat, capture, and the computer kingdom. It does not touch the page or the engine.
- `src/render` draws the marsh with Canvas 2D. Terrain is cached and patched when a tile changes; each frame blits the visible region and redraws marchers, paths, and waves.
- `src/view` hosts that drawing in [Excalibur](https://excaliburjs.com/) 0.32.0: the frame loop, pan and zoom, the minimap, and pointer coordinates. See `docs/engine-choice.md` and `docs/controls.md`.
- `src/ui` is the tax slider and the rest of the page, outside the canvas.
- `tests` covers the rules, including how a click becomes a selection or an order, and how faith and rites resolve.
- `docs/gods.md` is the note on where the rites come from and how they fit the tax.
- `docs/controls.md` is the note on pan, zoom, selection, and orders.

A kingdom is `{ id, controlledBy: "human" | "cpu", ... }`. The match ends when every human kingdom is gone (a loss) or every computer kingdom is gone (a win).

In the browser console, `window.__hearthmarch.getState()` returns a plain snapshot of the current match.
