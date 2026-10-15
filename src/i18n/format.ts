import type { GodId, PowerId } from "../game/types.ts";
import type { LogEntry, Notice } from "../game/speech.ts";
import { en, type MessageKey } from "./en.ts";
import { t } from "./locale.ts";

const KINGDOM_ARGS = new Set([
  "kingdom",
  "human",
  "cpu",
  "winner",
  "loser",
  "other",
  "attacker",
  "defender",
]);

const GOD_ARGS = new Set(["humanGod", "cpuGod", "god"]);

export function kingdomText(id: string): string {
  const key = `kingdom.${id}` as MessageKey;
  if (Object.prototype.hasOwnProperty.call(en, key)) return t(key);
  return id;
}

export function godText(id: GodId, field: "name" | "title" | "creed"): string {
  return t(`god.${id}.${field}` as MessageKey);
}

export function powerText(id: PowerId, field: "name" | "blurb"): string {
  return t(`power.${id}.${field}` as MessageKey);
}

function resolveArgs(args: Readonly<Record<string, string | number>>): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(args)) {
    if (typeof value === "number") {
      out[name] = value;
      continue;
    }
    if (KINGDOM_ARGS.has(name)) {
      out[name] = kingdomText(value);
      continue;
    }
    if (GOD_ARGS.has(name)) {
      out[name] = godText(value as GodId, "name");
      continue;
    }
    if (name === "power") {
      out[name] = powerText(value as PowerId, "name");
      continue;
    }
    out[name] = value;
  }
  return out;
}

export function formatLog(entry: LogEntry): string {
  const text = t(entry.key, resolveArgs(entry.args));
  return t("log.dayLine", { day: entry.day, text });
}

export function formatNotice(notice: Notice): string {
  return t(notice.key, resolveArgs(notice.args ?? {}));
}
