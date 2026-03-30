import { describe, expect, test } from "bun:test";
import {
  normalizeCardImageFormData,
  parseCardImageConfigDocument,
  serializeCardImageConfigDocument,
} from "./cardImage";

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
