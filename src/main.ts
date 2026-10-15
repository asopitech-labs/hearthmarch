import "@fontsource/literata/400.css";
import "@fontsource/literata/400-italic.css";
import "@fontsource/literata/700.css";
import "@fontsource/patrick-hand/400.css";
import "./style.css";
import { startBoard } from "./view/board.ts";

const canvas = document.querySelector<HTMLCanvasElement>("#map");
const stage = document.querySelector<HTMLElement>(".stage");
if (!canvas || !stage) {
  throw new Error("Hearthmarch is missing its map");
}

void startBoard(canvas).catch(() => {
  stage.insertAdjacentHTML(
    "beforeend",
    '<p class="error">This browser could not open a drawing surface.</p>',
  );
});
