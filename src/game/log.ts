import { LOG_LIMIT } from "./config.ts";
import type { GameState } from "./types.ts";

export function pushLog(state: GameState, text: string): void {
  state.log.push(`Day ${state.day}: ${text}`);
  if (state.log.length > LOG_LIMIT) {
    state.log.splice(0, state.log.length - LOG_LIMIT);
  }
}
