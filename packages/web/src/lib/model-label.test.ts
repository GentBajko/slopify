import { describe, expect, it } from "vitest";
import { modelChoiceLabel, modelOptionLabel, modelPriceLabel } from "./model-label";

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

describe("modelChoiceLabel", () => {
  it("names a text model plainly, without token prices or context size", () => {
    expect(
      modelChoiceLabel({
        id: "g",
        name: "Google: Gemini 3.8 Flash",
        price: { inputPerMillionTokens: 0.75, outputPerMillionTokens: 3.75 },
        contextTokens: 1_048_576,
      }),
    ).toBe("Google: Gemini 3.8 Flash");
  });

  it("keeps a price a person reads as one: per image or per minute", () => {
    expect(modelChoiceLabel({ id: "f", name: "FLUX.2", price: { perImage: 0.04 } })).toBe(
      "FLUX.2 · $0.04 per image",
    );
    expect(modelChoiceLabel({ id: "v", name: "Voice", price: { perMillionCharacters: 30 } })).toBe(
      "Voice",
    );
  });
});
