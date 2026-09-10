import { describe, expect, it } from "vitest";
import { type Catalogue, catalogueSchema } from "../../catalog/schema.js";
import { estimateRequests, type PricedRequest } from "./index.js";

const base = {
  name: "Test",
  source: "https://example.com/pricing",
  enabled: true,
  deprecated: false,
};
const catalogue = catalogueSchema.parse({
  schemaVersion: 1,
  updatedAt: "2026-09-10",
  providers: {
    openrouter: { maxConcurrent: 5 },
    inworld: { maxConcurrent: 5 },
    "openai-tts": { maxConcurrent: 5 },
    "google-image": { maxConcurrent: 5 },
  },
  llm: [
    {
      ...base,
      provider: "openrouter",
      id: "text",
      llm: {},
      pricing: { inputPerMillionTokens: 2, outputPerMillionTokens: 10 },
    },
  ],
  tts: [
    {
      ...base,
      provider: "inworld",
      id: "characters",
      tts: { maxCharacters: 100000, streaming: false },
      pricing: { perMillionCharacters: 25 },
    },
    {
      ...base,
      provider: "openai-tts",
      id: "minutes",
      tts: { maxCharacters: 100000, streaming: false },
      pricing: { perMinute: 0.06 },
    },
  ],
  image: [
    {
      ...base,
      provider: "google-image",
      id: "image",
      image: { aspectRatios: ["16:9"] },
      pricing: { perImage: 0.1 },
    },
  ],
});
const tts = {
  kind: "tts",
  stage: "Changed chunk",
  provider: "inworld",
  model: "characters",
  text: "a".repeat(1000),
} as const;

describe("requested work pricing", () => {
  it("prices exactly the new chunks and excludes retained or local work", () => {
    const estimate = estimateRequests(
      [
        tts,
        { ...tts, stage: "Other chunk", text: "b".repeat(2000) },
        { kind: "local", stage: "Retained audio" },
        { kind: "local", stage: "Concat" },
      ],
      catalogue,
    );
    expect(estimate.low).toBeCloseTo(0.075);
    expect(estimate.high).toBeCloseTo(0.075);
    expect(estimate.unknown).toBe(0);
    expect(estimate.rows.map((row) => row.low)).toEqual([0.025, 0.05, 0, 0]);
    expect(estimate.catalogueDate).toBe("2026-09-10");
  });

  it("uses independent input and output token rates with generated length uncertainty", () => {
    const estimate = estimateRequests(
      [
        {
          kind: "llm",
          stage: "Article",
          provider: "openrouter",
          model: "text",
          inputCharacters: 4000,
          outputCharacters: 8000,
          expectedWords: 1000,
          detail: "Only the edited prompt.",
        },
      ],
      catalogue,
    );
    expect(estimate.low).toBeCloseTo(0.011);
    expect(estimate.high).toBeCloseTo(0.033);
    expect(estimate.expectedWords).toBe(1000);
    expect(estimate.rows[0]?.detail).toBe("Only the edited prompt.");
  });

  it("estimates per-minute narration from spoken length and marks it variable", () => {
    const estimate = estimateRequests(
      [{ ...tts, provider: "openai-tts", model: "minutes", text: "a".repeat(900) }],
      catalogue,
    );
    expect(estimate.low).toBeCloseTo(0.03);
    expect(estimate.high).toBeCloseTo(0.09);
  });

  it("represents future narration quantities explicitly without dummy text", () => {
    const estimate = estimateRequests(
      [
        {
          kind: "tts-estimate",
          stage: "Future audio",
          provider: "inworld",
          model: "characters",
          characters: 10000,
        },
      ],
      catalogue,
    );
    expect(estimate.low).toBe(0.125);
    expect(estimate.high).toBe(0.375);
  });

  it("prices every requested image including a separate thumbnail", () => {
    const estimate = estimateRequests(
      [
        { kind: "image", stage: "Image one", provider: "google-image", model: "image" },
        { kind: "image", stage: "Thumbnail", provider: "google-image", model: "image" },
      ],
      catalogue,
    );
    expect(estimate.rows.map((row) => row.low)).toEqual([0.1, 0.1]);
    expect(estimate.low).toBe(0.2);
  });

  it("keeps unknown rates distinct from local zero and quotes zero rates correctly", () => {
    const noRates: Catalogue = {
      ...catalogue,
      tts: catalogue.tts.map((model) => ({ ...model, pricing: {} })),
    };
    const estimate = estimateRequests([tts, { kind: "local", stage: "Retained" }], noRates);
    expect(estimate.rows.map((row) => row.low)).toEqual([null, 0]);
    expect(estimate.unknown).toBe(1);
    const free: Catalogue = {
      ...catalogue,
      tts: catalogue.tts.map((model) => ({ ...model, pricing: { perMillionCharacters: 0 } })),
    };
    expect(estimateRequests([tts], free).rows[0]?.low).toBe(0);
    expect(estimateRequests([tts], free).unknown).toBe(0);
  });

  it.each(["disabled", "deprecated", "missing"])("does not quote a %s model", (state) => {
    const changed: Catalogue = {
      ...catalogue,
      tts:
        state === "missing"
          ? []
          : catalogue.tts.map((model) => ({
              ...model,
              enabled: state !== "disabled",
              deprecated: state === "deprecated",
            })),
    };
    const estimate = estimateRequests([tts], changed);
    expect(estimate.rows[0]?.low).toBeNull();
    expect(estimate.rows[0]?.high).toBeNull();
    expect(estimate.unknown).toBe(1);
  });

  it("prefers explicit character rates and carries caller-declared uncertainty", () => {
    const dual: Catalogue = {
      ...catalogue,
      tts: catalogue.tts.map((model) => ({
        ...model,
        pricing: { perMillionCharacters: 25, perMinute: 10 },
      })),
    };
    expect(estimateRequests([tts], dual).low).toBe(0.025);
    expect(estimateRequests([tts], dual).high).toBe(0.025);
    expect(estimateRequests([{ ...tts, variable: true }], dual).low).toBe(0.0125);
    expect(estimateRequests([{ ...tts, variable: true }], dual).high).toBeCloseTo(0.0375);
  });

  it("requires both LLM rates and never falls back to another provider's matching ID", () => {
    const partial: Catalogue = {
      ...catalogue,
      llm: catalogue.llm.map((model) => ({ ...model, pricing: { inputPerMillionTokens: 2 } })),
    };
    const request = {
      kind: "llm",
      stage: "Text",
      provider: "openrouter",
      model: "text",
      inputCharacters: 4000,
      outputCharacters: 4000,
    } as const;
    expect(estimateRequests([request], partial).unknown).toBe(1);
    expect(estimateRequests([{ ...request, provider: "codex" }], catalogue).unknown).toBe(1);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])(
    "rejects invalid quantities %s",
    (quantity) => {
      const requests: readonly PricedRequest[] = [
        {
          kind: "llm",
          stage: "Text",
          provider: "openrouter",
          model: "text",
          inputCharacters: quantity,
          outputCharacters: 1,
        },
        {
          kind: "llm",
          stage: "Text",
          provider: "openrouter",
          model: "text",
          inputCharacters: 1,
          outputCharacters: quantity,
        },
        {
          kind: "tts-estimate",
          stage: "Audio",
          provider: "inworld",
          model: "characters",
          characters: quantity,
        },
        { kind: "local", stage: "Local", expectedWords: quantity },
      ];
      for (const request of requests)
        expect(() => estimateRequests([request], catalogue)).toThrow();
    },
  );
});
