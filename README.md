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
- Each cottage is a hearth. Capture Reedmoor's hearth to win. If Reedmoor captures yours, you lose.
- Drag **Tax**. At 0% the villages grow and gold does not. At 30% the coffer fills and the villages stop growing. In between, you get some of each. When a kingdom's villagers reach the muster line, a marcher appears near its hearth.
- **Call a levy** spends gold to raise a marcher immediately.
- Click one of your marchers, then click a tile. They walk there, around water and around your other marchers, and claim every tile they step on. Stepping onto an enemy marcher starts a skirmish. The stronger side stays, wounded. Equal strength favors whoever already held the tile.
- A hearth shelters its defender. Fighting on a cottage is harder than fighting in the open.
- Reedmoor sets its own tax, raises marchers, spreads into open marsh, and pushes toward your hearth. Standing still is a way to lose.
- Pause with the button or Space. Pace 2× hurries the clock. Start over deals the same marsh again.

Reedmoor's captain keeps the cottage for the first few mornings, then marches. A focused attack is a short skirmish, on the order of a minute or two. Later maps can be much larger. The economy and the kingdom list are what a longer match would stretch.

## Project layout

- `src/game` holds state, economy, pathfinding, combat, capture, and the computer kingdom. It does not touch the page or the engine.
- `src/render` draws the marsh with Canvas 2D. The pencil strokes are unchanged.
- `src/view` hosts that drawing in [Excalibur](https://excaliburjs.com/) 0.32.0: the frame loop, the camera (zoom 1, focused on this marsh), and pointer coordinates. See `docs/engine-choice.md` for why.
- `src/ui` is the tax slider and the rest of the page, outside the canvas.
- `tests` covers the rules, including how a click becomes a selection or an order.

A kingdom is `{ id, controlledBy: "human" | "cpu", ... }`. The match ends when every human kingdom is gone (a loss) or every computer kingdom is gone (a win).

In the browser console, `window.__hearthmarch.getState()` returns a plain snapshot of the current match.
