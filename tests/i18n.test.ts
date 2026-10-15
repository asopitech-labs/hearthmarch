import { afterAll, describe, expect, it } from "vitest";
import { en } from "../src/i18n/en.ts";
import { formatLog, formatNotice } from "../src/i18n/format.ts";
import { ja } from "../src/i18n/ja.ts";
import { localeFromLanguages, setLocale, t } from "../src/i18n/locale.ts";

afterAll(() => {
  setLocale("en", false);
});

describe("catalogs", () => {
  it("gives every English key a non-empty Japanese line, and nothing extra", () => {
    const enKeys = Object.keys(en).sort();
    const jaKeys = Object.keys(ja).sort();
    expect(jaKeys).toEqual(enKeys);
    for (const key of enKeys) {
      expect(en[key as keyof typeof en].trim().length).toBeGreaterThan(0);
      expect(ja[key as keyof typeof ja].trim().length).toBeGreaterThan(0);
    }
  });
});

describe("localeFromLanguages", () => {
  it("chooses Japanese for any ja locale and English otherwise", () => {
    expect(localeFromLanguages(["ja"])).toBe("ja");
    expect(localeFromLanguages(["ja-JP", "en"])).toBe("ja");
    expect(localeFromLanguages(["en-US", "ja"])).toBe("ja");
    expect(localeFromLanguages(["JA"])).toBe("ja");
    expect(localeFromLanguages(["en-US"])).toBe("en");
    expect(localeFromLanguages(["fr-FR"])).toBe("en");
    expect(localeFromLanguages([])).toBe("en");
  });
});

describe("formatLog", () => {
  it("fills the day, kingdom, and rite in both languages", () => {
    const entry = {
      day: 12,
      key: "log.rite" as const,
      args: { kingdom: "ashvale", power: "shore" },
    };
    setLocale("en", false);
    const english = formatLog(entry);
    expect(english).toBe("Day 12: Ashvale calls Shore.");
    expect(english).not.toMatch(/\{/);

    setLocale("ja", false);
    const japanese = formatLog(entry);
    expect(japanese).toBe("12日目：杏の谷が渚を唱える。");
    expect(japanese).not.toMatch(/\{/);
  });

  it("fills a hearth banner line with both kingdoms and the gold", () => {
    const entry = {
      day: 57,
      key: "log.hearth" as const,
      args: { winner: "reedmoor", loser: "ashvale", gold: 2579 },
    };
    setLocale("en", false);
    expect(formatLog(entry)).toBe("Day 57: Reedmoor takes the hearth of Ashvale and 2579 gold.");
    setLocale("ja", false);
    expect(formatLog(entry)).toBe("57日目：葦の原が杏の谷の炉を落とし、金2579を奪った。");
  });

  it("names the gods a kingdom keeps, and a nameless marcher", () => {
    setLocale("en", false);
    expect(
      formatLog({
        day: 1,
        key: "log.keeps",
        args: { human: "ashvale", humanGod: "kiln", cpu: "reedmoor", cpuGod: "mere" },
      }),
    ).toBe("Day 1: Ashvale keeps Kiln. Reedmoor keeps Mere.");
    expect(
      formatLog({
        day: 3,
        key: "log.break",
        args: { attacker: "marcher", defender: "ashvale" },
      }),
    ).toContain("A marcher");

    setLocale("ja", false);
    expect(
      formatLog({
        day: 1,
        key: "log.keeps",
        args: { human: "ashvale", humanGod: "kiln", cpu: "reedmoor", cpuGod: "mere" },
      }),
    ).toBe("1日目：杏の谷は窯を守る。葦の原は水鏡を守る。");
    expect(
      formatLog({
        day: 3,
        key: "log.break",
        args: { attacker: "marcher", defender: "neighbor" },
      }),
    ).toBe("3日目：兵が、小競り合いで隣国を破った。");
  });
});

describe("banners and notices", () => {
  it("puts the kingdom name into win and loss copy", () => {
    setLocale("en", false);
    const win = t("banner.win.copy", { name: t("kingdom.ashvale") });
    expect(win).toContain("Ashvale");
    expect(win).not.toMatch(/\{name\}/);
    expect(t("banner.loss.title")).toBe("Your hearth goes quiet");

    setLocale("ja", false);
    const loss = t("banner.loss.copy", { name: t("kingdom.reedmoor") });
    expect(loss).toContain("葦の原");
    expect(loss).not.toMatch(/\{name\}/);
    expect(t("banner.win.title")).toBe("葦の旗が降りる");
    expect(t("banner.loss.title")).toBe("炉の火が消える");
  });

  it("formats a rite refusal with the rite name and the cost", () => {
    setLocale("en", false);
    expect(formatNotice({ key: "notice.cost", args: { power: "shore", cost: 12 } })).toBe(
      "Shore wants 12 faith.",
    );
    expect(formatNotice({ key: "notice.wrongGod", args: { god: "kiln" } })).toBe(
      "Kiln does not answer that rite.",
    );
    setLocale("ja", false);
    expect(formatNotice({ key: "notice.cost", args: { power: "shore", cost: 12 } })).toBe(
      "渚には祈りが12要る。",
    );
    expect(formatNotice({ key: "notice.wrongGod", args: { god: "kiln" } })).toBe(
      "窯は、その儀礼に応えない。",
    );
  });
});
