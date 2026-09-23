import { describe, expect, test } from "bun:test";
import { resolveFrameOptions } from "yugioh-card-ts/document";
import {
  CARD_IMAGE_RARE_OPTIONS,
  CARD_IMAGE_FORM_KEYS,
  applyCardImageRarityDefaults,
  createCardImageFormData,
  normalizeCardImageConfigDocument,
  normalizeCardImageFormData,
  parseCardImageConfigDocument,
  serializeCardImageConfigDocument,
} from "./layout";
import type { CardDataEntry } from "$lib/types";

describe("card image config document", () => {
  test("tracks automatic star defaults across model and rarity changes", () => {
    const normal = normalizeCardImageFormData({});
    expect(resolveFrameOptions(normal)).toEqual({
      cardBorderCoverForeground: false, levelAlign: "right", levelStyle: "level", showStars: true,
    });
    const master = applyCardImageRarityDefaults(normal, "grandmaster");
    expect(resolveFrameOptions(master)).toEqual({
      cardBorderCoverForeground: true, levelAlign: "right", levelStyle: "level-grandmaster", showStars: true,
    });
    for (const type of ["monster", "pendulum"]) {
      const xyz = normalizeCardImageFormData({ ...master, type, cardType: "xyz", pendulumType: "xyz-pendulum" });
      expect(resolveFrameOptions(xyz).levelAlign).toBe("left");
      expect(resolveFrameOptions(xyz).levelStyle).toBe("rank");
      const link = normalizeCardImageFormData({ ...xyz, cardType: "link", pendulumType: "link-pendulum" });
      expect(resolveFrameOptions(link).showStars).toBe(false);
    }
    expect(resolveFrameOptions(applyCardImageRarityDefaults(master, "")).cardBorderCoverForeground).toBe(false);
  });

  test("preserves explicit frame overrides in saved configs and preset changes", () => {
    const form = normalizeCardImageFormData({
      rare: "grandmaster", cardBorderCoverForeground: false, levelAlign: "center", levelStyle: "rank",
    });
    const parsed = parseCardImageConfigDocument(serializeCardImageConfigDocument({ form })).form;
    for (const key of ["cardBorderCoverForeground", "levelAlign", "levelStyle"] as const) {
      expect(CARD_IMAGE_FORM_KEYS).toContain(key);
      expect(parsed[key]).toBe(form[key]);
      expect(applyCardImageRarityDefaults(parsed, "o")[key]).toBe(form[key]);
    }
    const automatic = normalizeCardImageFormData({
      ...parsed, cardBorderCoverForeground: "auto", levelAlign: "auto", levelStyle: "auto",
    });
    expect(resolveFrameOptions(automatic).cardBorderCoverForeground).toBe(true);
    expect(resolveFrameOptions(automatic).levelStyle).toBe("level-grandmaster");
    const old = parseCardImageConfigDocument('{"rare":"grandmaster"}').form;
    expect(old.levelAlign).toBe("auto");
    expect(resolveFrameOptions(old).levelStyle).toBe("level-grandmaster");
    const invalid = parseCardImageConfigDocument('{"levelAlign":"invalid","levelStyle":"bad","cardBorderCoverForeground":"false"}').form;
    expect(invalid.levelAlign).toBe("auto");
    expect(invalid.levelStyle).toBe("auto");
    expect(invalid.cardBorderCoverForeground).toBe("auto");
  });

  test("exports the flat yugioh-card web format and parses it", () => {
    const raw = serializeCardImageConfigDocument({
      form: normalizeCardImageFormData({
        name: "Blue-Eyes White Dragon",
        password: "89631139",
        image: "data:image/png;base64,AAA",
        gradientStroke: false,
        foregroundImage: "data:image/png;base64,BBB",
        foregroundCoverAttribute: false,
        foregroundClipBelowEffectBox: true,
        rarityMaskImage: "data:image/png;base64,CCC",
        rarityMaskX: 640,
        rarityMaskScale: 0.8,
        rarityMaskEffectBox: false,
        rarityMaskArtwork: true,
        rarityMaskCoverName: true,
        rarityMaskCoverAttribute: true,
        rarityMaskCoverLevel: true,
        rare: "o",
      }),
    });
    const exported = JSON.parse(raw);

    const parsed = parseCardImageConfigDocument(raw);

    expect(exported.kind).toBe(undefined);
    expect(exported.form).toBe(undefined);
    expect(exported.name).toBe("Blue-Eyes White Dragon");
    expect(exported.arrowList).toEqual([]);
    expect(exported.rare).toBe("o");
    expect(parsed.form.name).toBe("Blue-Eyes White Dragon");
    expect(parsed.form.password).toBe("89631139");
    expect(parsed.form.image).toBe("data:image/png;base64,AAA");
    expect(parsed.form.gradientStroke).toBe(false);
    expect(parsed.form.foregroundImage).toBe("data:image/png;base64,BBB");
    expect(parsed.form.foregroundCoverAttribute).toBe(false);
    expect(parsed.form.foregroundClipBelowEffectBox).toBe(true);
    expect(parsed.form.rarityMaskImage).toBe("data:image/png;base64,CCC");
    expect(parsed.form.rarityMaskX).toBe(640);
    expect(parsed.form.rarityMaskScale).toBe(0.8);
    expect(parsed.form.rarityMaskEffectBox).toBe(false);
    expect(parsed.form.rarityMaskArtwork).toBe(true);
    expect(parsed.form.rarityMaskCoverName).toBe(true);
    expect(parsed.form.rarityMaskCoverAttribute).toBe(true);
    expect(parsed.form.rarityMaskCoverLevel).toBe(true);
    expect(parsed.form.rare).toBe("o");
    expect(parsed.exportScalePercent).toBeNull();
  });

  test("exposes the upstream out-frame rarity", () => {
    expect(CARD_IMAGE_RARE_OPTIONS.some(({ value }) => value === "o")).toBe(true);
    expect(CARD_IMAGE_RARE_OPTIONS.some(({ value }) => value === "pser2")).toBe(true);
  });

  test("uses upstream rendering defaults", () => {
    const form = normalizeCardImageFormData({});
    expect(form.gradientStroke).toBe(true);
    expect(form.foregroundCoverAttribute).toBe(true);
    expect(form.foregroundClipBelowEffectBox).toBe(false);
    expect(form.rarityMaskEffectBox).toBe(true);
    expect(form.rarityMaskArtwork).toBe(false);
    expect(form.rarityMaskCoverName).toBe(false);
    expect(form.rarityMaskCoverAttribute).toBe(false);
    expect(form.rarityMaskCoverLevel).toBe(false);
  });

  test("defaults out-frame rarity to an enabled colored effect box", () => {
    const imported = normalizeCardImageFormData({ rare: "o" });
    const selected = applyCardImageRarityDefaults(normalizeCardImageFormData({}), "o");
    const explicit = normalizeCardImageFormData({
      rare: "o",
      effectBlockEnabled: false,
      effectBlockBorderStyle: "none",
    });

    expect(imported.effectBlockEnabled).toBe(true);
    expect(imported.effectBlockBorderStyle).toBe("colored");
    expect(selected.effectBlockEnabled).toBe(true);
    expect(selected.effectBlockBorderStyle).toBe("colored");
    expect(explicit.effectBlockEnabled).toBe(false);
    expect(explicit.effectBlockBorderStyle).toBe("none");
  });

  test("restores effect box defaults when leaving out-frame rarity", () => {
    const selected = applyCardImageRarityDefaults(normalizeCardImageFormData({}), "o");
    const cleared = applyCardImageRarityDefaults(selected, "");

    expect(cleared.effectBlockEnabled).toBe(false);
    expect(cleared.effectBlockBorderStyle).toBe("default");
  });

  test("applies rarity once and preserves independent frames through config round trips", () => {
    const preset = applyCardImageRarityDefaults({}, "hr");
    expect([preset.cardBorderStyle, preset.artBorderStyle, preset.effectBorderStyle])
      .toEqual(["silver", "silver", "color"]);
    const custom = normalizeCardImageFormData({ ...preset, cardBorderStyle: "gold", effectBorderStyle: "default" });
    const parsed = parseCardImageConfigDocument(serializeCardImageConfigDocument({ form: custom }));
    expect(parsed.form.cardBorderStyle).toBe("gold");
    expect(parsed.form.artBorderStyle).toBe("silver");
    expect(parsed.form.effectBorderStyle).toBe("default");
    const reapplied = applyCardImageRarityDefaults(custom, "gser");
    expect([reapplied.cardBorderStyle, reapplied.artBorderStyle, reapplied.effectBorderStyle])
      .toEqual(["gold", "gold", "default"]);
    const pendulum = applyCardImageRarityDefaults({ type: "pendulum" }, "gser");
    expect([pendulum.artBorderStyle, pendulum.effectBorderStyle]).toEqual(["gold", "gold"]);
  });

  test("syncs out-frame, pser and grandmaster presets", () => {
    expect(CARD_IMAGE_RARE_OPTIONS.some(({ value }) => value === "grandmaster")).toBe(true);
    expect(applyCardImageRarityDefaults({}, "o").effectBorderStyle).toBe("color");
    expect(applyCardImageRarityDefaults({}, "pser").effectBorderStyle).toBe("default");
    const master = applyCardImageRarityDefaults({}, "grandmaster");
    expect([master.cardBorderStyle, master.artBorderStyle, master.effectBorderStyle, master.rarityEffect])
      .toEqual(["grandmaster", "color", "grandmaster", "none"]);
    const pendulum = applyCardImageRarityDefaults({ type: "pendulum" }, "o");
    expect([pendulum.artBorderStyle, pendulum.effectBorderStyle]).toEqual(["color", "color"]);
  });

  test("preserves independent effects and reapplies them only with a preset", () => {
    const preset = applyCardImageRarityDefaults({ type: "pendulum" }, "gser");
    expect(preset.rarityEffect).toBe("ser-pendulum");
    const custom = normalizeCardImageFormData({ ...preset, rarityEffect: "pser2" });
    const parsed = parseCardImageConfigDocument(serializeCardImageConfigDocument({ form: custom }));
    expect(parsed.form.rarityEffect).toBe("pser2");
    expect(parsed.form.cardBorderStyle).toBe(preset.cardBorderStyle);
    expect(normalizeCardImageFormData({ ...custom, rarityEffect: "none" }).rarityEffect).toBe("none");
    expect(applyCardImageRarityDefaults(custom, "hr").rarityEffect).toBe("hr");
    expect(normalizeCardImageFormData({ rare: "ur", type: "pendulum" }).rarityEffect).toBe("ur-pendulum");
  });

  test("accepts plain form json for compatibility", () => {
    const parsed = parseCardImageConfigDocument(JSON.stringify({
      name: "Dark Magician",
      password: "46986414",
      descriptionZoom: 1.3,
    }));

    expect(parsed.form.name).toBe("Dark Magician");
    expect(parsed.form.password).toBe("46986414");
    expect(parsed.form.descriptionZoom).toBe(1.3);
    expect(parsed.exportScalePercent).toBeNull();
  });

  test("still imports legacy DataEditorY wrapped configs", () => {
    const parsed = parseCardImageConfigDocument(JSON.stringify({
      kind: "dataeditory-card-image-config",
      version: 1,
      form: { name: "Decode Talker", arrowList: [1, 3, 5] },
      exportScalePercent: 52,
    }));

    expect(parsed.form.name).toBe("Decode Talker");
    expect(parsed.form.arrowList).toEqual([1, 3, 5]);
    expect(parsed.exportScalePercent).toBe(52);
  });

  test("normalizes shared document metadata", () => {
    const document = normalizeCardImageConfigDocument({
      form: { name: "Dark Magician" },
      meta: { cardCode: "46986414", cardName: "Dark Magician", exportedAt: 1 },
    });

    expect(document.kind).toBe("dataeditory-card-image-config");
    expect(document.version).toBe(1);
    expect(document.form.name).toBe("Dark Magician");
    expect(document.meta).toEqual({
      cardCode: 46986414,
      cardName: "Dark Magician",
      exportedAt: undefined,
    });
  });
});

describe("card image defaults", () => {
  test("maps basic monster card fields without external adapters", () => {
    const card: CardDataEntry = {
      code: 89631139,
      alias: 0,
      setcode: [],
      type: 0x1 | 0x10,
      attack: 3000,
      defense: 2500,
      level: 8,
      race: 0x2000,
      attribute: 0x10,
      category: 0,
      ot: 0,
      name: "Blue-Eyes White Dragon",
      desc: "This legendary dragon is a powerful engine of destruction.",
      strings: [],
      lscale: 0,
      rscale: 0,
      linkMarker: 0,
      ruleCode: 0,
    };

    const form = createCardImageFormData(card, "en");

    expect(form.name).toBe("Blue-Eyes White Dragon");
    expect(form.type).toBe("monster");
    expect(form.cardType).toBe("normal");
    expect(form.attribute).toBe("light");
    expect(form.monsterType).toBe("Dragon/Normal");
    expect(form.atk).toBe(3000);
    expect(form.def).toBe(2500);
    expect(form.password).toBe("89631139");
  });

  test("splits pendulum description and monster description", () => {
    const card: CardDataEntry = {
      code: 16178681,
      alias: 0,
      setcode: [],
      type: 0x1 | 0x20 | 0x1000000,
      attack: 1850,
      defense: 0,
      level: 4,
      race: 0x1000000,
      attribute: 0x08,
      category: 0,
      ot: 0,
      name: "Odd-Eyes Pendulum Dragon",
      desc: "←4 【灵摆】 4→\nOnce per turn: You can reduce battle damage.\n【怪兽效果】\nIf this card battles an opponent's monster, any battle damage it inflicts is doubled.",
      strings: [],
      lscale: 4,
      rscale: 4,
      linkMarker: 0,
      ruleCode: 0,
    };

    const form = createCardImageFormData(card, "sc");

    expect(form.type).toBe("pendulum");
    expect(form.pendulumType).toBe("effect-pendulum");
    expect(form.pendulumScale).toBe(4);
    expect(form.pendulumDescription).toContain("Once per turn");
    expect(form.description).toContain("battle damage");
  });
});
