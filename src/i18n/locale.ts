import { en, type MessageKey } from "./en.ts";
import { ja } from "./ja.ts";

export type LocaleId = "en" | "ja";

export const STORAGE_KEY = "hearthmarch.locale";

const listeners = new Set<() => void>();

export function localeFromLanguages(langs: readonly string[]): LocaleId {
  for (const lang of langs) {
    if (lang.toLowerCase().startsWith("ja")) return "ja";
  }
  return "en";
}

function browserLanguages(): readonly string[] {
  const nav = globalThis.navigator;
  if (!nav) return ["en"];
  if (nav.languages && nav.languages.length > 0) return nav.languages;
  if (nav.language) return [nav.language];
  return ["en"];
}

function readStored(): LocaleId | null {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return null;
    const stored = storage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "ja") return stored;
  } catch {
    return null;
  }
  return null;
}

let current: LocaleId = readStored() ?? localeFromLanguages(browserLanguages());

export function getLocale(): LocaleId {
  return current;
}

export function setLocale(next: LocaleId, persist = true): void {
  current = next;
  if (persist) {
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, next);
    } catch {
      /* private mode, or tests without storage */
    }
  }
  for (const listener of listeners) listener();
}

export function onLocale(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function t(key: MessageKey, args: Record<string, string | number> = {}): string {
  const template = (current === "ja" ? ja : en)[key];
  return template.replace(/\{(\w+)\}/g, (token, name: string) => {
    const value = args[name];
    return value === undefined ? token : String(value);
  });
}

export function canvasFont(px: number): string {
  if (current === "ja") {
    return `${px}px Yomogi, "Zen Maru Gothic", "Hiragino Maru Gothic ProN", "Yu Gothic", sans-serif`;
  }
  return `${px}px "Patrick Hand", "Segoe Print", cursive`;
}
