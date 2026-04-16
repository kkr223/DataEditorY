import { describe, expect, test } from "bun:test";
import {
  createCardImageFormData,
  normalizeCardImageFormData,
  parseCardImageConfigDocument,
  serializeCardImageConfigDocument,
} from "./layout";
import type { CardDataEntry } from "$lib/types";

describe("card image config document", () => {
  test("serializes and parses normalized config data", () => {
    const raw = serializeCardImageConfigDocument({
      form: normalizeCardImageFormData({
        name: "Blue-Eyes White Dragon",
        password: "89631139",
        image: "data:image/png;base64,AAA",
        foregroundImage: "data:image/png;base64,BBB",
      }),
      exportScalePercent: 43,
      cardCode: 89631139,
      cardName: "Blue-Eyes White Dragon",
    });

    const parsed = parseCardImageConfigDocument(raw);

    expect(parsed.form.name).toBe("Blue-Eyes White Dragon");
    expect(parsed.form.password).toBe("89631139");
    expect(parsed.form.image).toBe("data:image/png;base64,AAA");
    expect(parsed.form.foregroundImage).toBe("data:image/png;base64,BBB");
    expect(parsed.exportScalePercent).toBe(43);
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
