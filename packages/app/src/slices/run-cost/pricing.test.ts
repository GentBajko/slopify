import { describe, expect, it } from "vitest";
import type { Catalogue } from "../../catalog/schema.js";
import type { MeteredCall } from "../../kernel/runner/meter.js";
import { apiEquivalentOf, priceCall, tokenCost } from "./pricing.js";

const source = "https://example.com/pricing";
const base = { enabled: true, deprecated: false, source, keywords: [] };
const llm = { webSearch: false };
const catalogue: Catalogue = {
  schemaVersion: 1,
  updatedAt: "2026-09-26",
  providers: {},
  llm: [
    {
      ...base,
      provider: "openrouter",
      id: "anthropic/claude-sonnet-4.6",
      name: "Claude Sonnet 4.6",
      pricing: { inputPerMillionTokens: 3, outputPerMillionTokens: 15 },
      llm,
    },
    {
      ...base,
      provider: "openrouter",
      id: "anthropic/claude-sonnet-4.10",
      name: "Claude Sonnet 4.10",
      pricing: { inputPerMillionTokens: 4, outputPerMillionTokens: 20 },
      llm,
    },
    {
      ...base,
      provider: "openrouter",
      id: "openai/gpt-5.6-sol",
      name: "GPT-5.6 Sol",
      pricing: {
        inputPerMillionTokens: 2,
        outputPerMillionTokens: 10,
        cachedInputPerMillionTokens: 0.2,
      },
      llm,
    },
    {
      ...base,
      provider: "openrouter",
      id: "google/gemini-3.8-flash",
      name: "Gemini 3.8 Flash",
      pricing: { inputPerMillionTokens: 0.75, outputPerMillionTokens: 3.75 },
      llm,
    },
  ],
  tts: [
    {
      ...base,
      provider: "elevenlabs",
      id: "eleven_v3",
      name: "Eleven v3",
      pricing: { perMillionCharacters: 100 },
      tts: { maxCharacters: 5000, streaming: true },
    },
    {
      ...base,
      provider: "inworld",
      id: "per-minute",
      name: "Per minute",
      pricing: { perMinute: 0.5 },
      tts: { maxCharacters: 5000, streaming: true },
    },
  ],
  image: [
    {
      ...base,
      provider: "google-image",
      id: "gemini-3.1-flash-image",
      name: "Flash image",
      pricing: { perImage: 0.101 },
      image: { aspectRatios: ["16:9"] },
    },
    {
      ...base,
      provider: "fal",
      id: "clip",
      name: "Clip",
      keywords: ["video"],
      pricing: { perImage: 0.35 },
      image: { aspectRatios: ["16:9"] },
    },
  ],
};

function call(over: Partial<MeteredCall>): MeteredCall {
  return {
    projectId: "p1",
    stage: "article",
    kind: "llm",
    provider: "openrouter",
    model: "openai/gpt-5.6-sol",
    wallMs: 1000,
    ...over,
  };
}

describe("tokenCost", () => {
  it("prices cached input at its own rate, or as input when the catalogue has none", () => {
    // 1M in (400k of it cached), 100k out.
    expect(
      tokenCost(
        { inputPerMillionTokens: 2, outputPerMillionTokens: 10, cachedInputPerMillionTokens: 0.2 },
        1_000_000,
        100_000,
        400_000,
      ),
    ).toBeCloseTo(0.6 * 2 + 0.4 * 0.2 + 0.1 * 10);
    expect(
      tokenCost({ inputPerMillionTokens: 3, outputPerMillionTokens: 15 }, 1_000_000, 0, 500_000),
    ).toBeCloseTo(3);
  });
  it("is unknown without both rates", () => {
    expect(tokenCost({ inputPerMillionTokens: 3 }, 10, 10)).toBeNull();
  });
});

describe("apiEquivalentOf", () => {
  it("maps each CLI's models to the API model the catalogue lists", () => {
    expect(apiEquivalentOf("claude-code", "claude-sonnet-4-6", catalogue)?.id).toBe(
      "anthropic/claude-sonnet-4.6",
    );
    // A dated snapshot and a context size price as the model itself.
    expect(apiEquivalentOf("claude-code", "claude-sonnet-4-6-20260101[1m]", catalogue)?.id).toBe(
      "anthropic/claude-sonnet-4.6",
    );
    // An alias is the newest of its family (numeric order: 4.10 after 4.6).
    expect(apiEquivalentOf("claude-code", "sonnet", catalogue)?.id).toBe(
      "anthropic/claude-sonnet-4.10",
    );
    expect(apiEquivalentOf("codex", "gpt-5.6-sol", catalogue)?.id).toBe("openai/gpt-5.6-sol");
    expect(apiEquivalentOf("gemini", "gemini-3.8-flash", catalogue)?.id).toBe(
      "google/gemini-3.8-flash",
    );
  });
  it("has no API price for a default or unlisted model", () => {
    expect(apiEquivalentOf("codex", "", catalogue)).toBeUndefined();
    expect(apiEquivalentOf("claude-code", "claude-haiku-4-5", catalogue)).toBeUndefined();
    expect(apiEquivalentOf("codex-image", "codex-imagegen", catalogue)).toBeUndefined();
  });
});

describe("priceCall", () => {
  it("prices a keyed text call from its reported tokens and keeps the rates it used", () => {
    const priced = priceCall(
      call({ tokensIn: 1_000_000, tokensOut: 100_000, cachedTokens: 400_000 }),
      catalogue,
    );
    expect(priced.onPlan).toBe(false);
    expect(priced.cost).toBeCloseTo(2.28);
    expect(priced.price).toMatchObject({ catalogue: "2026-09-26", inputPerMillionTokens: 2 });
  });
  it("leaves a call with no reported usage or no listed price unknown, never free", () => {
    expect(priceCall(call({}), catalogue).cost).toBeNull();
    expect(
      priceCall(call({ model: "unlisted", tokensIn: 1, tokensOut: 1 }), catalogue).cost,
    ).toBeNull();
    // A per-minute voice is not guessed from characters.
    expect(
      priceCall(
        call({ kind: "tts", provider: "inworld", model: "per-minute", characters: 900 }),
        catalogue,
      ).cost,
    ).toBeNull();
  });
  it("prices narration by characters, images per image and a clip per clip", () => {
    expect(
      priceCall(
        call({ kind: "tts", provider: "elevenlabs", model: "eleven_v3", characters: 10_000 }),
        catalogue,
      ).cost,
    ).toBeCloseTo(1);
    expect(
      priceCall(
        call({
          kind: "image",
          provider: "google-image",
          model: "gemini-3.1-flash-image",
          images: 1,
        }),
        catalogue,
      ).cost,
    ).toBeCloseTo(0.101);
    expect(
      priceCall(call({ kind: "video", provider: "fal", model: "clip", seconds: 5 }), catalogue)
        .cost,
    ).toBeCloseTo(0.35);
  });
  it("puts a CLI call at $0 on the plan with the same tokens priced through the API", () => {
    const priced = priceCall(
      call({
        provider: "claude-code",
        model: "claude-sonnet-4-6",
        tokensIn: 200_000,
        tokensOut: 20_000,
      }),
      catalogue,
    );
    expect(priced).toMatchObject({
      onPlan: true,
      cost: 0,
      apiModel: "anthropic/claude-sonnet-4.6",
    });
    expect(priced.apiCost).toBeCloseTo(0.2 * 3 + 0.02 * 15);
    // A Codex image has no API figure.
    expect(
      priceCall(
        call({ kind: "image", provider: "codex-image", model: "gpt-5.6-sol", images: 1 }),
        catalogue,
      ),
    ).toMatchObject({ onPlan: true, cost: 0, apiCost: null });
  });
});
