import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { stringify } from "yaml";
import { createCatalogueStore } from "../../catalog/store.js";
import type { RunDraft } from "../admission/model.js";
import { estimateRun } from "./index.js";

const catalogue = createCatalogueStore({
  dataDir: mkdtempSync(join(tmpdir(), "slopify-estimate-")),
  fetch: globalThis.fetch,
});
const draft: RunDraft = {
  title: "Provided article",
  format: "16:9",
  sources: {
    research: "off",
    article: "provide",
    audio: "generate",
    images: "off",
    thumbnail: "off",
    video: "off",
  },
  audio: { provider: "inworld", model: "inworld-tts-2", voice: "voice" },
  imagePrompts: [],
  values: {},
  provided: { article: "a".repeat(10000) },
  silenceGapSeconds: 0,
};
describe("cost planning", () => {
  it("prices a supplied article by characters and gives local/off stages zero API charges", () => {
    const estimate = estimateRun(draft, {}, 1500, catalogue);
    expect(estimate.low).toBe(0.25);
    expect(estimate.high).toBe(0.25);
    expect(estimate.unknown).toBe(0);
  });
  it("counts images and a thumbnail separately", () => {
    const estimate = estimateRun(
      {
        ...draft,
        sources: { ...draft.sources, images: "generate", thumbnail: "from_prompt" },
        images: { provider: "google-image", model: "gemini-3.1-flash-image" },
        imagePrompts: [{ name: "a", number: 3 }],
      },
      {},
      1500,
      catalogue,
    );
    expect(estimate.low).toBeCloseTo(0.25 + 4 * 0.101);
    expect(estimate.rows.filter((row) => row.stage === "Images")).toHaveLength(1);
  });
  it("keeps unknown CLI costs separate and exposes generated length uncertainty", () => {
    const estimate = estimateRun(
      {
        ...draft,
        sources: { ...draft.sources, article: "generate" },
        llm: { provider: "gemini", model: "gemini-3.8-flash" },
      },
      {},
      2000,
      catalogue,
    );
    expect(estimate.unknown).toBe(1);
    expect(estimate.rows.find((r) => r.stage === "Article")?.low).toBeNull();
    expect(estimate.high).toBeGreaterThan(estimate.low);
  });
  it("does not price a local CLI from a legacy private YAML row", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "slopify-legacy-estimate-"));
    try {
      const old = catalogue.read().llm[0];
      if (!old) throw new Error("Missing LLM fixture");
      const legacy = createCatalogueStore({
        dataDir,
        fetch: globalThis.fetch,
        bundled: stringify({
          ...catalogue.read(),
          providers: { ...catalogue.read().providers, codex: { maxConcurrent: 5 } },
          llm: [
            ...catalogue.read().llm,
            {
              ...old,
              provider: "codex",
              id: "priced",
              pricing: {
                inputPerMillionTokens: 1,
                outputPerMillionTokens: 1,
              },
            },
          ],
        }),
      });
      const estimate = estimateRun(
        {
          ...draft,
          sources: { ...draft.sources, article: "generate" },
          llm: { provider: "codex", model: "priced" },
        },
        {},
        1500,
        legacy,
      );
      expect(estimate.rows.find((row) => row.stage === "Article")?.low).toBeNull();
      expect(estimate.unknown).toBe(1);
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
  it("keeps missing-catalogue charges unknown rather than reporting a free job", () => {
    const estimate = estimateRun(draft, {}, 1500);
    expect(estimate.rows.find((row) => row.stage === "Narration")?.low).toBeNull();
    expect(estimate.unknown).toBe(1);
    expect(estimate.catalogueDate).toBeNull();
  });
  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])(
    "rejects an invalid expected word count %s",
    (expectedWords) => {
      expect(() => estimateRun(draft, {}, expectedWords, catalogue)).toThrow();
    },
  );
  it("groups an unknown image estimate into one stage without reporting zero", () => {
    const estimate = estimateRun(
      {
        ...draft,
        sources: { ...draft.sources, images: "generate" },
        images: { provider: "google-image", model: "missing" },
        imagePrompts: [{ name: "a", number: 3 }],
      },
      {},
      1500,
      catalogue,
    );
    expect(estimate.rows.filter((row) => row.stage === "Images")).toHaveLength(1);
    expect(estimate.rows.find((row) => row.stage === "Images")?.low).toBeNull();
    expect(estimate.unknown).toBe(1);
  });
});
