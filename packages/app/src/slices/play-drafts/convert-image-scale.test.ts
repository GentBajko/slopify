import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createCatalogueStore } from "../../catalog/store.js";
import { admit } from "../admission/rules.js";
import { estimateRun } from "../estimate/index.js";
import { toAdmissionDraft } from "./convert.js";
import { draftFixture } from "./draft.fake.js";
import type { PlayDraftDocument } from "./model.js";

// More images for long videos, from Play's control to the run: the typed rate becomes images
// per hour, planned for the expected words, and the estimate prices the scaled count.

const fixtures: ReturnType<typeof draftFixture>[] = [];
afterEach(() => {
  for (const h of fixtures.splice(0)) h.close();
});

function document(
  imageScale: PlayDraftDocument["form"]["imageScale"],
  expectedWords = "3000",
): PlayDraftDocument {
  const h = draftFixture();
  fixtures.push(h);
  return {
    ...h.document,
    expectedWords,
    form: {
      ...h.document.form,
      imagePrompts: [
        { name: "wide", number: "2" },
        { name: "close", number: "1" },
      ],
      ...(imageScale === undefined ? {} : { imageScale }),
    },
  };
}

function convert(value: PlayDraftDocument) {
  return toAdmissionDraft({ document: value, attachments: [], entries: [], silenceGapSeconds: 3 });
}

it("leaves the setting out of the run when it is off", () => {
  const result = convert(document(undefined));
  expect(result.ok && "imageScale" in result.draft).toBe(false);
});

it("stores every N minutes as images per hour, planned for the expected words", () => {
  expect(convert(document({ every: "minutes", value: "5" }))).toMatchObject({
    ok: true,
    draft: { imageScale: { perHour: 12, words: 3000 } },
  });
  expect(convert(document({ every: "hour", value: "30" }))).toMatchObject({
    ok: true,
    draft: { imageScale: { perHour: 30, words: 3000 } },
  });
});

it("plans for a provided article's own words", () => {
  const base = document({ every: "minutes", value: "1" });
  const result = convert({
    ...base,
    form: {
      ...base.form,
      sources: { ...base.form.sources, article: "provide" },
      provided: { ...base.form.provided, article: "One two three four five." },
    },
  });
  expect(result).toMatchObject({ ok: true, draft: { imageScale: { perHour: 60, words: 5 } } });
});

it.each([
  ["minutes", "0"],
  ["minutes", "90"],
  ["hour", "0.5"],
  ["hour", ""],
] as const)("refuses %s %j in words that name the control", (every, value) => {
  expect(convert(document({ every, value }))).toMatchObject({
    ok: false,
    fields: [
      {
        field: "imageScale.value",
        message: expect.stringContaining("Images → More images for long videos"),
      },
    ],
  });
});

it("admits the stored setting only in range", () => {
  const result = convert(document({ every: "minutes", value: "5" }));
  if (!result.ok) throw new Error("Expected a draft.");
  const draft = {
    ...result.draft,
    title: "Long video",
    articlePrompt: "Article",
    llm: { provider: "text", model: "m" },
    audio: { provider: "voice", model: "m", voice: "v" },
    images: { provider: "image", model: "m" },
  };
  const fields = (imageScale: { perHour: number; words: number }) =>
    (() => {
      const admitted = admit({ draft: { ...draft, imageScale }, staged: [], requiredSlots: [] });
      return admitted.ok ? [] : admitted.fields.map((field) => field.field);
    })();
  expect(fields({ perHour: 12, words: 3000 })).not.toContain("imageScale");
  expect(fields({ perHour: 1000, words: 3000 })).toContain("imageScale");
});

it("prices the scaled count in the estimate", () => {
  const catalogue = createCatalogueStore({
    dataDir: mkdtempSync(join(tmpdir(), "slopify-image-scale-")),
    fetch: globalThis.fetch,
  });
  const result = convert(document({ every: "minutes", value: "1" }));
  if (!result.ok) throw new Error("Expected a draft.");
  // 3,000 words is 20 minutes: 20 images at one a minute, against the prompts' 3.
  const scaled = estimateRun(result.draft, {}, 3000, catalogue);
  const images = scaled.rows.find((row) => row.stage === "Images");
  expect(images?.detail).toContain("20 images for about 20 minutes of narration");
  const { imageScale: _off, ...plain } = result.draft;
  expect(
    estimateRun(plain, {}, 3000, catalogue).rows.find((row) => row.stage === "Images")?.detail,
  ).toMatch(/^3 images\./);
});
