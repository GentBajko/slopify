import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { stringify } from "yaml";
import { createCatalogueStore } from "../../catalog/store.js";
import type { RunDraft } from "../admission/model.js";
import { legacyVideoEdit } from "../video/edit-settings.js";
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
  imageSeconds: 15,
  zoomPercent: 22.5,
  motionStyle: "zoom",
  edgeSilenceSeconds: 0,
};
describe("cost planning", () => {
  it("adds one text call per table, figure, equation or code block described", () => {
    const described = {
      ...draft,
      llm: { provider: "codex", model: "test" },
      audio: { provider: "inworld", model: "inworld-tts-2", voice: "voice", describeFigures: true },
      provided: {
        article: "Intro.\n\n| a |\n|---|\n| 1 |\n\n![Map](map.png)\n\n```js\nx()\n```\n",
      },
    } satisfies RunDraft;
    const row = estimateRun(described, {}, 1500, catalogue).rows.find(
      (one) => one.stage === "Narration descriptions",
    );
    expect(row?.detail).toContain("3 LLM calls");
    expect(
      estimateRun(
        { ...described, audio: { ...described.audio, skipCode: true } },
        {},
        1500,
        catalogue,
      ).rows.find((one) => one.stage === "Narration descriptions")?.detail,
    ).toContain("2 LLM calls");
    const generated = estimateRun(
      { ...described, sources: { ...described.sources, article: "generate" }, articlePrompt: "x" },
      { article: "x" },
      1500,
      catalogue,
    );
    expect(generated.rows.find((one) => one.stage === "Narration descriptions")?.low).toBeNull();
    const { describeFigures: _off, ...plain } = described.audio;
    expect(
      estimateRun({ ...described, audio: plain }, {}, 1500, catalogue).rows.some(
        (one) => one.stage === "Narration descriptions",
      ),
    ).toBe(false);
  });

  it("counts preparation groups using the shared LLM and prices CLI calls on the plan", () => {
    const selected = {
      ...draft,
      narrationPrompt: "Delivery",
      llm: { provider: "codex", model: "test" },
      provided: { article: "First paragraph.\n\nSecond paragraph." },
      chunking: { mode: "paragraph" as const },
    };
    const estimate = estimateRun(selected, { narration: "Calm." }, 1500, catalogue);
    expect(estimate.rows.find((row) => row.stage === "Narration Preparation")).toMatchObject({
      low: 0,
      onPlan: true,
      apiLow: null,
    });
    expect(estimate.rows.find((row) => row.stage === "Narration Preparation")?.detail).toContain(
      "2 LLM calls",
    );
    expect(estimate.rows.find((row) => row.stage === "Delivery cue overhead")?.low).toBeNull();
    expect(
      estimateRun({ ...selected, narrationPrompt: "" }, {}, 1500, catalogue).rows.some(
        (row) => row.stage === "Narration Preparation",
      ),
    ).toBe(false);
    const generated = estimateRun(
      { ...selected, sources: { ...selected.sources, article: "generate" as const } },
      {},
      1500,
      catalogue,
    );
    expect(generated.rows.find((row) => row.stage === "Narration Preparation")?.detail).toContain(
      "future",
    );
  });
  it("prices the YouTube description as one LLM call on the timed transcript", () => {
    const selected = {
      ...draft,
      llm: { provider: "codex", model: "test" },
      youtubeDescription: true,
    };
    const row = estimateRun(selected, {}, 1500, catalogue).rows.find(
      (one) => one.stage === "YouTube description",
    );
    expect(row?.detail).toContain("One LLM call on the timed transcript.");
    expect(
      estimateRun({ ...selected, youtubeDescription: false }, {}, 1500, catalogue).rows.some(
        (one) => one.stage === "YouTube description",
      ),
    ).toBe(false);
  });
  it("prices the shorts as the pick, one prompt call per short and every image they may need", () => {
    const selected: RunDraft = {
      ...draft,
      llm: { provider: "codex", model: "test" },
      images: { provider: "fal", model: "image" },
      shorts: { enabled: true, count: 3, minSeconds: 60, maxSeconds: 120 },
    };
    const row = estimateRun(selected, {}, 1500, catalogue).rows.find(
      (one) => one.stage === "Shorts",
    );
    expect(row?.detail).toContain("One LLM call on the numbered transcript picks the clips.");
    for (const off of [
      { ...selected, shorts: { enabled: false, count: 3, minSeconds: 60, maxSeconds: 120 } },
      // Numbers the run would refuse are not priced.
      { ...selected, shorts: { enabled: true, count: 3000, minSeconds: 60, maxSeconds: 120 } },
    ])
      expect(estimateRun(off, {}, 1500, catalogue).rows.some((one) => one.stage === "Shorts")).toBe(
        false,
      );
  });
  it("prices each animated image as one clip of the image-to-video model", () => {
    // The bundled catalogue prices Kling 2.5 Turbo Pro on fal.ai at $0.35 a clip.
    const animated: RunDraft = {
      ...draft,
      sources: { ...draft.sources, images: "generate", video: "generate" },
      images: { provider: "google-image", model: "gemini-3.1-flash-image" },
      imagePrompts: [{ name: "a", number: 6 }],
      videoEdit: {
        ...legacyVideoEdit,
        animate: "every",
        animateEvery: 3,
        animateModel: "fal-ai/kling-video/v2.5-turbo/pro/image-to-video",
      },
    };
    const onFal = { ...animated, images: { provider: "fal", model: "fal-ai/flux-2" } };
    const row = estimateRun(onFal, {}, 1500, catalogue).rows.find(
      (one) => one.stage === "Animated images",
    );
    // Six images, every 3rd from the first: two clips.
    expect(row?.low).toBeCloseTo(0.7);
    expect(row?.detail).toContain("2 clips of 5 seconds");
    const chapters = estimateRun(
      { ...onFal, videoEdit: { ...onFal.videoEdit, animate: "chapters" } as RunDraft["videoEdit"] },
      {},
      1500,
      catalogue,
    ).rows.find((one) => one.stage === "Animated images");
    // At most one per image, and six images.
    expect(chapters?.high).toBeCloseTo(6 * 0.35);
    expect(
      estimateRun({ ...onFal, videoEdit: legacyVideoEdit }, {}, 1500, catalogue).rows.some(
        (one) => one.stage === "Animated images",
      ),
    ).toBe(false);
  });
  it("prices a supplied article by characters and gives local/off stages zero API charges", () => {
    const estimate = estimateRun(draft, {}, 1500, catalogue);
    expect(estimate.low).toBeCloseTo(0.175);
    expect(estimate.high).toBeCloseTo(0.175);
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
    expect(estimate.low).toBeCloseTo(0.175 + 4 * 0.101);
    expect(estimate.rows.filter((row) => row.stage === "Images")).toHaveLength(1);
  });
  it("shows a CLI run as $0 on the plan with its API price beside it", () => {
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
    const article = estimate.rows.find((r) => r.stage === "Article");
    expect(estimate.unknown).toBe(0);
    expect(article).toMatchObject({ low: 0, high: 0, onPlan: true });
    // Priced as google/gemini-3.8-flash through OpenRouter, with the same ±50% range.
    expect(article?.apiLow).toBeGreaterThan(0);
    expect(article?.apiHigh).toBeCloseTo((article?.apiLow ?? 0) * 3);
    expect(estimate.apiLow).toBeGreaterThan(0);
    expect(estimate.apiUnknown).toBe(0);
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
      expect(estimate.rows.find((row) => row.stage === "Article")).toMatchObject({
        low: 0,
        onPlan: true,
        apiLow: null,
      });
      expect(estimate.unknown).toBe(0);
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
