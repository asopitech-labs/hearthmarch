import { DAY_MS, LEVY_COST, TAX_MAX } from "../game/config.ts";
import { canLevy, levy, setTax } from "../game/commands.ts";
import { dailyYield, taxHint } from "../game/economy.ts";
import { getTile, humanKingdom, rivalKingdoms, territoryCount, unitsOf } from "../game/query.ts";
import type { GameState, Kingdom, Unit } from "../game/types.ts";

export interface HudView {
  paused: boolean;
  speed: number;
  selectedId: number | null;
  note: string;
}

export interface HudHandlers {
  onPause: () => void;
  onSpeed: () => void;
  onRestart: () => void;
}

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  return element as T;
}

function placePhrase(state: GameState, unit: Unit, humanId: string): string {
  const tile = getTile(state, unit.x, unit.y);
  if (!tile) return "somewhere in the marsh";
  if (tile.isHearth) {
    return tile.ownerId === unit.kingdomId ? "on your hearth" : "on a foreign hearth";
  }
  if (tile.terrain === "wood") return "in the trees";
  if (tile.ownerId === null) return "on open marsh";
  if (tile.ownerId === humanId) return "on your ground";
  return "on enemy ground";
}

function fillKingdomStats(
  root: ParentNode,
  kingdom: Kingdom,
  state: GameState,
  prefix: string,
): void {
  const gold = root.querySelector(`[data-field="${prefix}-gold"]`);
  const pop = root.querySelector(`[data-field="${prefix}-pop"]`);
  const tiles = root.querySelector(`[data-field="${prefix}-tiles"]`);
  const units = root.querySelector(`[data-field="${prefix}-units"]`);
  const tax = root.querySelector(`[data-field="${prefix}-tax"]`);
  if (gold) gold.textContent = String(kingdom.gold);
  if (pop) pop.textContent = String(Math.floor(kingdom.population));
  if (tiles) tiles.textContent = String(territoryCount(state, kingdom.id));
  if (units) units.textContent = String(unitsOf(state, kingdom.id).length);
  if (tax) tax.textContent = `${kingdom.taxRate}%`;
}

export function mountHud(handlers: HudHandlers): {
  update: (state: GameState, view: HudView) => void;
} {
  const pauseButton = requireElement<HTMLButtonElement>("#pause");
  const speedButton = requireElement<HTMLButtonElement>("#speed");
  const restartButton = requireElement<HTMLButtonElement>("#restart");
  const curtainRestart = requireElement<HTMLButtonElement>("#curtain-restart");
  const taxInput = requireElement<HTMLInputElement>("#tax");
  const levyButton = requireElement<HTMLButtonElement>("#levy");
  const rivals = requireElement<HTMLElement>("#rivals");

  let currentState = (): GameState | null => null;

  pauseButton.addEventListener("click", handlers.onPause);
  speedButton.addEventListener("click", handlers.onSpeed);
  restartButton.addEventListener("click", handlers.onRestart);
  curtainRestart.addEventListener("click", handlers.onRestart);

  taxInput.min = "0";
  taxInput.max = String(TAX_MAX);
  taxInput.step = "1";
  taxInput.addEventListener("input", () => {
    const state = currentState();
    const human = state ? humanKingdom(state) : undefined;
    if (!state || !human) return;
    setTax(state, human.id, Number(taxInput.value));
  });

  levyButton.addEventListener("click", () => {
    const state = currentState();
    const human = state ? humanKingdom(state) : undefined;
    if (!state || !human) return;
    levy(state, human.id);
  });

  function syncRivals(state: GameState): void {
    const cpus = rivalKingdoms(state);
    const stamp = cpus.map((kingdom) => kingdom.id).join("|");
    if (rivals.dataset.stamp !== stamp) {
      rivals.dataset.stamp = stamp;
      rivals.replaceChildren();
      for (const kingdom of cpus) {
        const card = document.createElement("article");
        card.className = "card";
        card.dataset.kingdom = kingdom.id;
        card.innerHTML = `
          <h2 class="card-title"><span class="swatch"></span><span data-field="name"></span></h2>
          <p class="role">Computer kingdom</p>
          <dl class="stats">
            <div><dt>Tax</dt><dd data-field="rival-tax"></dd></div>
            <div><dt>Gold</dt><dd data-field="rival-gold"></dd></div>
            <div><dt>Villagers</dt><dd data-field="rival-pop"></dd></div>
            <div><dt>Tiles</dt><dd data-field="rival-tiles"></dd></div>
            <div><dt>Marchers</dt><dd data-field="rival-units"></dd></div>
          </dl>
          <p class="fine" data-field="fate"></p>
        `;
        rivals.append(card);
      }
    }

    for (const kingdom of cpus) {
      const card = rivals.querySelector(`[data-kingdom="${kingdom.id}"]`);
      if (!card) continue;
      card.classList.toggle("fallen", !kingdom.alive);
      const swatch = card.querySelector(".swatch");
      if (swatch instanceof HTMLElement) swatch.style.background = kingdom.ink;
      const name = card.querySelector("[data-field='name']");
      if (name) name.textContent = kingdom.name;
      fillKingdomStats(card, kingdom, state, "rival");
      const fate = card.querySelector("[data-field='fate']");
      if (fate) {
        fate.textContent = kingdom.alive
          ? "They set their own tax, raise marchers, and push toward your hearth."
          : "Their hearth has fallen.";
      }
    }
  }

  return {
    update(state: GameState, view: HudView) {
      currentState = () => state;
      const human = humanKingdom(state);
      const playerCard = requireElement<HTMLElement>("#player-card");
      if (human) {
        playerCard.classList.toggle("fallen", !human.alive);
        const swatch = requireElement<HTMLElement>("#player-swatch");
        swatch.style.background = human.ink;
        requireElement("#player-name").textContent = human.name;
        fillKingdomStats(playerCard, human, state, "player");
        const selected = state.units.find((unit) => unit.id === view.selectedId) ?? null;
        const selectedLine = requireElement("#player-selected");
        if (!human.alive) {
          selectedLine.textContent = "The hearth is lost.";
        } else if (view.note) {
          selectedLine.textContent = view.note;
        } else if (unitsOf(state, human.id).length === 0 && state.status === "playing") {
          selectedLine.textContent = "No marchers in the field. Lower the tax, or call a levy, before the hearth stands empty.";
        } else if (selected) {
          selectedLine.textContent = `Strength ${selected.strength}, ${placePhrase(state, selected, human.id)}. Click a tile to send them.`;
        } else {
          selectedLine.textContent = "Click one of your marchers, then click the ground you want held.";
        }

        const tiles = territoryCount(state, human.id);
        const gained = dailyYield(tiles, human.taxRate);
        requireElement("#tax-readout").textContent = `${human.taxRate}%`;
        requireElement("#tax-hint").textContent = taxHint(human.taxRate);
        requireElement("#forecast").textContent =
          tiles === 0
            ? "No ground, no dues."
            : `Each dawn: about +${gained.gold} gold and +${gained.population.toFixed(1)} villagers.`;
        if (document.activeElement !== taxInput) taxInput.value = String(human.taxRate);
        taxInput.disabled = state.status !== "playing" || !human.alive;
        levyButton.disabled = !canLevy(state, human.id);
        const levyLabel = `Call a levy (${LEVY_COST} gold)`;
        if (levyButton.textContent !== levyLabel) levyButton.textContent = levyLabel;
      }

      syncRivals(state);

      requireElement("#day-label").textContent = `Day ${state.day}`;
      const fill = requireElement<HTMLElement>("#dawn-fill");
      const progress = state.status === "playing" ? Math.min(1, state.clockMs / DAY_MS) : 1;
      fill.style.width = `${Math.round(progress * 100)}%`;

      pauseButton.textContent = view.paused ? "Resume" : "Pause";
      pauseButton.setAttribute("aria-pressed", view.paused ? "true" : "false");
      pauseButton.disabled = state.status !== "playing";
      speedButton.textContent = `Pace ${view.speed}×`;
      speedButton.disabled = state.status !== "playing";

      const curtain = requireElement<HTMLElement>("#curtain");
      const curtainTitle = requireElement("#curtain-title");
      const curtainCopy = requireElement("#curtain-copy");
      const statusLive = requireElement("#status-live");
      if (state.status === "playing") {
        curtain.hidden = true;
        statusLive.textContent = view.paused ? "Paused" : "Playing";
      } else if (state.status === "won") {
        curtain.hidden = false;
        const name = human?.name ?? "Your kingdom";
        curtainTitle.textContent = "The reed banners come down";
        curtainCopy.textContent = `${name} holds the marsh. The rival hearth is yours, and so is what was left in their coffer.`;
        statusLive.textContent = "Victory";
      } else {
        curtain.hidden = false;
        const rival = rivalKingdoms(state).find((kingdom) => kingdom.alive) ?? rivalKingdoms(state)[0];
        curtainTitle.textContent = "Your hearth goes quiet";
        curtainCopy.textContent = `${rival?.name ?? "The rival"} keeps the marsh. The villages will pay a different lord in the morning.`;
        statusLive.textContent = "Defeat";
      }

      const log = requireElement<HTMLOListElement>("#log");
      const signature = state.log.join("\n");
      if (log.dataset.signature !== signature) {
        log.dataset.signature = signature;
        log.replaceChildren();
        for (const line of state.log) {
          const item = document.createElement("li");
          item.textContent = line;
          log.append(item);
        }
      }
    },
  };
}
