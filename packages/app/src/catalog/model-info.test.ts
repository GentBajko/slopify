import { describe, expect, it } from "vitest";
import { catalogueModelInfo } from "./model-info.js";
import { llmModelSchema, ttsModelSchema } from "./schema.js";

describe("catalogueModelInfo", () => {
  it("carries a language model's price, context size and thinking modes", () => {
    const model = llmModelSchema.parse({
      provider: "openrouter",
      id: "a/b",
      name: "A: B",
      source: "https://openrouter.ai/api/v1/models",
      pricing: { inputPerMillionTokens: 2, outputPerMillionTokens: 12, note: "verified" },
      llm: { contextTokens: 1_048_576, thinking: { high: { effort: "high" } } },
    });
    expect(catalogueModelInfo(model)).toEqual({
      id: "a/b",
      name: "A: B",
      thinkingModes: ["high"],
      price: { inputPerMillionTokens: 2, outputPerMillionTokens: 12 },
      contextTokens: 1_048_576,
    });
  });

  it("leaves the price out when models.yaml names none, so it reads as unknown", () => {
    const model = ttsModelSchema.parse({
      provider: "elevenlabs",
      id: "v3",
      name: "Eleven v3",
      source: "https://elevenlabs.io",
      tts: { maxCharacters: 5000, streaming: true },
    });
    expect(catalogueModelInfo(model)).toEqual({ id: "v3", name: "Eleven v3" });
  });
});
