import { LEVY_COST } from "../game/config.ts";
import type { MessageKey } from "./en.ts";
import { getLocale, onLocale, setLocale, t, type LocaleId } from "./locale.ts";

function paint(key: string): string {
  return t(key as MessageKey);
}

/** Static copy. Nodes the match rewrites every frame carry data-live="1" and are left alone. */
export function applyDocument(): void {
  const locale = getLocale();
  document.documentElement.lang = locale;
  document.title = t("title");
  const meta = document.querySelector('meta[name="description"]');
  if (meta) meta.setAttribute("content", t("meta.description"));

  for (const el of document.querySelectorAll<HTMLElement>("[data-i18n]")) {
    if (el.dataset.live === "1") continue;
    const key = el.dataset.i18n;
    if (key) el.textContent = paint(key);
  }
  for (const el of document.querySelectorAll<HTMLElement>("[data-i18n-aria]")) {
    const key = el.dataset.i18nAria;
    if (key) el.setAttribute("aria-label", paint(key));
  }

  const day = document.querySelector<HTMLElement>("#day-label");
  if (day && day.dataset.live !== "1") day.textContent = t("day.label", { day: 1 });
  const speed = document.querySelector<HTMLElement>("#speed");
  if (speed && speed.dataset.live !== "1") speed.textContent = t("pace", { speed: 1 });
  const levy = document.querySelector<HTMLElement>("#levy");
  if (levy && levy.dataset.live !== "1") levy.textContent = t("levy.button", { cost: LEVY_COST });
  const status = document.querySelector<HTMLElement>("#status-live");
  if (status && status.dataset.live !== "1") status.textContent = t("status.choose");

  document.documentElement.dataset.i18n = "ready";
}

export function mountLocale(): void {
  applyDocument();
  onLocale(applyDocument);
  document.querySelector("#lang")?.addEventListener("click", () => {
    const next: LocaleId = getLocale() === "en" ? "ja" : "en";
    setLocale(next);
  });
}
