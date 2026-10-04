import { describe, expect, it } from "vitest";
import { modelOptionLabel, modelPriceLabel } from "./model-label";

describe("modelOptionLabel", () => {
  it("adds the token price and context size to the name", () => {
    expect(
      modelOptionLabel({
        id: "a",
        name: "Gemini",
        price: { inputPerMillionTokens: 0.19999999999999998, outputPerMillionTokens: 12 },
        contextTokens: 1_048_576,
      }),
    ).toBe("Gemini · $0.2 in / $12 out per 1M tokens · 1M context");
  });

  it("shows only the name when the price and context are unknown", () => {
    expect(modelOptionLabel({ id: "a", name: "Sonnet" })).toBe("Sonnet");
  });

  it("names the unit for image and speech prices", () => {
    expect(modelPriceLabel({ perImage: 0.04 })).toBe("$0.04 per image");
    expect(modelPriceLabel({ perMillionCharacters: 30 })).toBe("$30 per 1M characters");
  });
});
