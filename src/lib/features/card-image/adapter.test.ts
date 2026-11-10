import { describe, expect, test } from "bun:test";
import type { CardDataEntry } from "#lib/types/index.ts";
import { RACE_MAP, SUBTYPE_MAP, TYPE_MAP } from "#lib/domain/card/taxonomy.ts";
import { convertCardDataToCardImageData } from "./adapter";
import { createCardImageFormData, upgradeCardImageMonsterType } from "./layout";

const card = {
  code: 12345678, name: "Test", desc: "", type: TYPE_MAP.monster | SUBTYPE_MAP.effect,
  attack: 2000, defense: 1500, level: 4, race: RACE_MAP.warrior, attribute: 0x10,
  lscale: 0, rscale: 0, linkMarker: 0,
} as CardDataEntry;

describe("Japanese monster type ruby", () => {
  test("annotates the species, suffix and effect classification", () => {
    const data = convertCardDataToCardImageData(card, { language: "jp" });
    expect(data.monsterType).toBe("[戦(せん)][士(し)][族(ぞく)]／[効(こう)][果(か)]");
  });

  test("keeps katakana species intact and annotates normal and fusion classifications", () => {
    expect(convertCardDataToCardImageData({ ...card, race: RACE_MAP.dragon, type: TYPE_MAP.monster | SUBTYPE_MAP.normal }, { language: "jp" }).monsterType)
      .toBe("ドラゴン[族(ぞく)]／[通(つう)][常(じょう)]");
    const fusion = convertCardDataToCardImageData({ ...card, type: card.type | SUBTYPE_MAP.fusion | SUBTYPE_MAP.pendulum }, { language: "jp" });
    expect(fusion.type).toBe("pendulum");
    expect(fusion.monsterType).toBe("[戦(せん)][士(し)][族(ぞく)]／[融(ゆう)][合(ごう)]／ペンデュラム／[効(こう)][果(か)]");
  });

  test("every Japanese species has annotated kanji without affecting other languages", () => {
    for (const race of Object.values(RACE_MAP)) {
      const text = convertCardDataToCardImageData({ ...card, race }, { language: "jp" }).monsterType!;
      expect(text).toContain("[族(ぞく)]");
      expect(/\p{Script=Han}/u.test(text.replace(/\[[^()[\]]+\([^()[\]]+\)\]/g, ""))).toBe(false);
    }
    expect(convertCardDataToCardImageData(card, { language: "en" }).monsterType).toBe("Warrior/Effect");
    expect(convertCardDataToCardImageData(card, { language: "sc" }).monsterType).toBe("战士族/效果");
    expect(convertCardDataToCardImageData({ ...card, type: TYPE_MAP.spell }, { language: "jp" }).monsterType).toBe("");
  });

  test("upgrades a saved legacy default and preserves custom or annotated text", () => {
    const defaults = createCardImageFormData(card, "jp");
    const legacy = { ...defaults, monsterType: "戦士／効果", image: "custom-image", name: "Custom name" };
    const upgraded = upgradeCardImageMonsterType(legacy, card);
    expect(upgraded.monsterType).toBe(defaults.monsterType);
    expect(upgraded.image).toBe(legacy.image);
    expect(upgraded.name).toBe(legacy.name);
    expect(upgradeCardImageMonsterType(defaults, card)).toBe(defaults);
    const custom = { ...defaults, monsterType: "戦士／カスタム" };
    expect(upgradeCardImageMonsterType(custom, card)).toBe(custom);
    const english = createCardImageFormData(card, "en");
    expect(upgradeCardImageMonsterType(english, card)).toBe(english);
  });
});
