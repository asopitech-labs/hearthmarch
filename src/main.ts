import "@fontsource/literata/400.css";
import "@fontsource/literata/400-italic.css";
import "@fontsource/literata/700.css";
import "@fontsource/patrick-hand/400.css";
import "@fontsource/yomogi/latin-400.css";
import "@fontsource/yomogi/japanese-400.css";
import "@fontsource/zen-maru-gothic/latin-400.css";
import "@fontsource/zen-maru-gothic/japanese-400.css";
import "./style.css";
import { mountLocale } from "./i18n/dom.ts";
import { t } from "./i18n/locale.ts";
import { startBoard } from "./view/board.ts";

mountLocale();

const canvas = document.querySelector<HTMLCanvasElement>("#map");
const stage = document.querySelector<HTMLElement>(".stage");
if (!canvas || !stage) {
  throw new Error("Hearthmarch is missing its map");
}

function warmFonts(): Promise<void> {
  if (!("fonts" in document)) return Promise.resolve();
  const loads = Promise.all([
    document.fonts.load("28px Yomogi"),
    document.fonts.load('16px "Zen Maru Gothic"'),
    document.fonts.load("28px 'Patrick Hand'"),
  ]).then(() => document.fonts.ready);
  const cap = new Promise<void>((resolve) => {
    window.setTimeout(resolve, 2500);
  });
  return Promise.race([loads.then(() => undefined), cap]);
}

void warmFonts()
  .then(() => startBoard(canvas))
  .catch(() => {
    const error = document.createElement("p");
    error.className = "error";
    error.textContent = t("error.canvas");
    stage.append(error);
  });
