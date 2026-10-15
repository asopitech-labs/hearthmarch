import { LOG_LIMIT } from "./config.ts";
import type { LogKey, SpeechArgs } from "./speech.ts";
import type { GameState } from "./types.ts";

export function pushLog(state: GameState, key: LogKey, args: SpeechArgs = {}): void {
  state.log.push({ day: state.day, key, args });
  if (state.log.length > LOG_LIMIT) {
    state.log.splice(0, state.log.length - LOG_LIMIT);
  }
}
