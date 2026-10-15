import { DAY_MS, LEVY_COST, TAX_MAX } from "../game/config.ts";
import { canLevy, levy, setTax } from "../game/commands.ts";
import { dailyYield, taxBand } from "../game/economy.ts";
import { faithGain, godById, GODS } from "../game/faith.ts";
import { getTile, humanKingdom, rivalKingdoms, territoryCount, unitsOf } from "../game/query.ts";
import type { Notice, PlaceKey } from "../game/speech.ts";
import type { GameState, GodId, Kingdom, PowerId, Unit } from "../game/types.ts";
import { formatLog, formatNotice, godText, kingdomText, powerText } from "../i18n/format.ts";
import { getLocale, t } from "../i18n/locale.ts";

export interface HudView {
  paused: boolean;
  speed: number;
  selectedIds: number[];
  note: Notice | null;
  armedPower: PowerId | null;
  choosingGod: boolean;
}

export interface HudHandlers {
  onPause: () => void;
  onSpeed: () => void;
  onRestart: () => void;
  onChooseGod: (godId: GodId) => void;
  onRite: (powerId: PowerId) => void;
}

const LIVE = [
  "#pause",
  "#speed",
  "#day-label",
  "#levy",
  "#player-selected",
  "#status-live",
  "#player-name",
  "#tax-hint",
  "#forecast",
  "#curtain-title",
  "#curtain-copy",
];

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  return element as T;
}

function placePhrase(state: GameState, unit: Unit, humanId: string): PlaceKey {
  const tile = getTile(state, unit.x, unit.y);
  if (!tile) return "place.somewhere";
  if (tile.isHearth) {
    return tile.ownerId === unit.kingdomId ? "place.ownHearth" : "place.foreignHearth";
  }
  if (tile.terrain === "wood") return "place.wood";
  if (tile.ownerId === null) return "place.open";
  if (tile.ownerId === humanId) return "place.own";
  return "place.enemy";
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
  const faith = root.querySelector(`[data-field="${prefix}-faith"]`);
  if (faith) faith.textContent = String(Math.floor(kingdom.faith));
}

function fillGodButton(button: HTMLButtonElement, id: GodId): void {
  button.replaceChildren();
  const name = document.createElement("span");
  name.className = "god-name";
  name.textContent = godText(id, "name");
  const title = document.createElement("span");
  title.className = "god-title";
  title.textContent = godText(id, "title");
  const creed = document.createElement("span");
  creed.className = "god-creed";
  creed.textContent = godText(id, "creed");
  button.append(name, title, creed);
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
  const rites = requireElement<HTMLElement>("#rites");
  const godChoices = requireElement<HTMLElement>("#god-choices");
  const godGate = requireElement<HTMLElement>("#god-gate");

  for (const god of GODS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "god-choice";
    button.dataset.god = god.id;
    button.addEventListener("click", () => handlers.onChooseGod(god.id));
    godChoices.append(button);
  }

  let currentState = (): GameState | null => null;
  let godLocale = "";

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

  function syncGods(): void {
    const locale = getLocale();
    if (godLocale === locale) return;
    godLocale = locale;
    for (const button of godChoices.querySelectorAll<HTMLButtonElement>(".god-choice")) {
      const id = button.dataset.god;
      if (id === "lark" || id === "kiln" || id === "mere") fillGodButton(button, id);
    }
  }

  function syncRivals(state: GameState): void {
    const cpus = rivalKingdoms(state);
    const stamp = `${getLocale()}|${cpus.map((kingdom) => kingdom.id).join("|")}`;
    if (rivals.dataset.stamp !== stamp) {
      rivals.dataset.stamp = stamp;
      rivals.replaceChildren();
      for (const kingdom of cpus) {
        const card = document.createElement("article");
        card.className = "card";
        card.dataset.kingdom = kingdom.id;
        const title = document.createElement("h2");
        title.className = "card-title";
        const swatch = document.createElement("span");
        swatch.className = "swatch";
        const name = document.createElement("span");
        name.dataset.field = "name";
        title.append(swatch, name);
        const role = document.createElement("p");
        role.className = "role";
        role.textContent = t("role.cpu");
        const stats = document.createElement("dl");
        stats.className = "stats";
        for (const [key, field] of [
          ["stat.tax", "rival-tax"],
          ["stat.gold", "rival-gold"],
          ["stat.villagers", "rival-pop"],
          ["stat.tiles", "rival-tiles"],
          ["stat.marchers", "rival-units"],
          ["stat.faith", "rival-faith"],
        ] as const) {
          const row = document.createElement("div");
          const term = document.createElement("dt");
          term.textContent = t(key);
          const value = document.createElement("dd");
          value.dataset.field = field;
          row.append(term, value);
          stats.append(row);
        }
        const fate = document.createElement("p");
        fate.className = "fine";
        fate.dataset.field = "fate";
        card.append(title, role, stats, fate);
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
      if (name) name.textContent = kingdomText(kingdom.id);
      fillKingdomStats(card, kingdom, state, "rival");
      const fate = card.querySelector("[data-field='fate']");
      if (fate) {
        fate.textContent = kingdom.alive
          ? t("rival.fate", {
              god: godText(kingdom.godId, "name"),
              title: godText(kingdom.godId, "title"),
            })
          : t("rival.fallen");
      }
    }
  }

  function syncRites(state: GameState, human: Kingdom, armed: PowerId | null): void {
    const god = godById(human.godId);
    const stamp = `${getLocale()}|${god.id}`;
    if (rites.dataset.stamp !== stamp) {
      rites.dataset.stamp = stamp;
      rites.replaceChildren();
      for (const power of god.powers) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "rite";
        button.dataset.power = power.id;
        button.addEventListener("click", () => handlers.onRite(power.id));
        rites.append(button);
      }
    }
    god.powers.forEach((power, index) => {
      const button = rites.querySelector<HTMLButtonElement>(`[data-power="${power.id}"]`);
      if (!button) return;
      const wait = human.riteWait[power.id] ?? 0;
      const cooling = wait > 0;
      const name = powerText(power.id, "name");
      const label = cooling
        ? t("rite.wait", { name, seconds: Math.ceil(wait / 1000) })
        : t("rite.ready", { name, cost: power.cost });
      if (button.textContent !== label) button.textContent = label;
      button.disabled =
        state.status !== "playing" || !human.alive || cooling || human.faith < power.cost;
      button.setAttribute("aria-pressed", armed === power.id ? "true" : "false");
      button.title = t("rite.hint", { blurb: powerText(power.id, "blurb"), key: index + 1 });
    });
  }

  return {
    update(state: GameState, view: HudView) {
      currentState = () => state;
      for (const selector of LIVE) {
        const el = document.querySelector<HTMLElement>(selector);
        if (el) el.dataset.live = "1";
      }
      syncGods();
      const human = humanKingdom(state);
      const playerCard = requireElement<HTMLElement>("#player-card");
      if (human) {
        playerCard.classList.toggle("fallen", !human.alive);
        const swatch = requireElement<HTMLElement>("#player-swatch");
        swatch.style.background = human.ink;
        requireElement("#player-name").textContent = kingdomText(human.id);
        fillKingdomStats(playerCard, human, state, "player");
        const selected = state.units.filter((unit) => view.selectedIds.includes(unit.id));
        const selectedLine = requireElement("#player-selected");
        if (!human.alive) {
          selectedLine.textContent = t("select.lost");
        } else if (view.note) {
          selectedLine.textContent = formatNotice(view.note);
        } else if (unitsOf(state, human.id).length === 0 && state.status === "playing") {
          selectedLine.textContent = t("select.empty");
        } else if (view.armedPower) {
          selectedLine.textContent = t("select.armed", {
            power: powerText(view.armedPower, "name"),
            blurb: powerText(view.armedPower, "blurb"),
          });
        } else if (selected.length > 1) {
          selectedLine.textContent = t("select.many", { count: selected.length });
        } else if (selected.length === 1) {
          const unit = selected[0]!;
          selectedLine.textContent = t("select.one", {
            strength: unit.strength,
            place: t(placePhrase(state, unit, human.id)),
          });
        } else {
          selectedLine.textContent = t("select.none");
        }

        const tiles = territoryCount(state, human.id);
        const gained = dailyYield(tiles, human.taxRate);
        const prayers = faithGain(human.population, human.taxRate);
        requireElement("#tax-readout").textContent = `${human.taxRate}%`;
        const band = taxBand(human.taxRate);
        const hintKey = band === "gentle" ? "tax.gentle" : band === "measured" ? "tax.measured" : "tax.hard";
        requireElement("#tax-hint").textContent = t(hintKey);
        requireElement("#forecast").textContent =
          tiles === 0
            ? t("forecast.empty")
            : t("forecast", {
                gold: gained.gold,
                villagers: gained.population.toFixed(1),
                faith: prayers,
              });
        syncRites(state, human, view.armedPower);
        if (document.activeElement !== taxInput) taxInput.value = String(human.taxRate);
        taxInput.disabled = state.status !== "playing" || !human.alive;
        levyButton.disabled = !canLevy(state, human.id);
        const levyLabel = t("levy.button", { cost: LEVY_COST });
        if (levyButton.textContent !== levyLabel) levyButton.textContent = levyLabel;
      }

      syncRivals(state);

      requireElement("#day-label").textContent = t("day.label", { day: state.day });
      const fill = requireElement<HTMLElement>("#dawn-fill");
      const progress = state.status === "playing" ? Math.min(1, state.clockMs / DAY_MS) : 1;
      fill.style.width = `${Math.round(progress * 100)}%`;

      pauseButton.textContent = view.paused ? t("resume") : t("pause");
      pauseButton.setAttribute("aria-pressed", view.paused ? "true" : "false");
      pauseButton.disabled = state.status !== "playing";
      speedButton.textContent = t("pace", { speed: view.speed });
      speedButton.disabled = state.status !== "playing";

      const curtain = requireElement<HTMLElement>("#curtain");
      const curtainTitle = requireElement("#curtain-title");
      const curtainCopy = requireElement("#curtain-copy");
      const statusLive = requireElement("#status-live");
      godGate.hidden = !view.choosingGod;
      if (view.choosingGod) {
        curtain.hidden = true;
        statusLive.textContent = t("status.choose");
      } else if (state.status === "playing") {
        curtain.hidden = true;
        statusLive.textContent = view.paused ? t("status.paused") : t("status.playing");
      } else if (state.status === "won") {
        curtain.hidden = false;
        const name = human ? kingdomText(human.id) : t("kingdom.you");
        curtainTitle.textContent = t("banner.win.title");
        curtainCopy.textContent = t("banner.win.copy", { name });
        statusLive.textContent = t("status.victory");
      } else {
        curtain.hidden = false;
        const rival = rivalKingdoms(state).find((kingdom) => kingdom.alive) ?? rivalKingdoms(state)[0];
        curtainTitle.textContent = t("banner.loss.title");
        curtainCopy.textContent = t("banner.loss.copy", {
          name: rival ? kingdomText(rival.id) : t("kingdom.rival"),
        });
        statusLive.textContent = t("status.defeat");
      }

      const log = requireElement<HTMLOListElement>("#log");
      const lines = state.log.map((entry) => formatLog(entry));
      const signature = `${getLocale()}\n${lines.join("\n")}`;
      if (log.dataset.signature !== signature) {
        const pinned = log.scrollHeight - log.scrollTop - log.clientHeight < 28;
        log.dataset.signature = signature;
        log.replaceChildren();
        for (const line of lines) {
          const item = document.createElement("li");
          item.textContent = line;
          log.append(item);
        }
        if (pinned) log.scrollTop = log.scrollHeight;
      }
    },
  };
}
