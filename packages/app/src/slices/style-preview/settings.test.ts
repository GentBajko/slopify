import { describe, expect, it } from "vitest";
import { legacyVideoEdit } from "../video/edit-settings.js";
import { sampleNarrationText, sampleNarrationWords, sampleShortTitle } from "./narration.js";
import type { StylePreviewRequest } from "./schema.js";
import {
  normalizeStylePreview,
  previewCues,
  previewSeconds,
  previewWords,
  stableJson,
  stylePreviewHash,
} from "./settings.js";

const request: StylePreviewRequest = {
  format: "16:9",
  subtitles: { mode: "burn-in", fontId: "default", fontSize: 48, position: "bottom" },
};
const hashOf = (value: StylePreviewRequest): string =>
  stylePreviewHash(normalizeStylePreview(value));

describe("style preview settings", () => {
  it("writes JSON with its keys in order at every level", () => {
    expect(stableJson({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: null } })).toBe(
      '{"a":{"c":null,"d":[2,{"y":2,"z":1}]},"b":1}',
    );
  });

  it("hashes equal settings alike whatever order or spelling they came in", () => {
    const reordered: StylePreviewRequest = {
      subtitles: { position: "bottom", fontSize: 48.2, fontId: "default", mode: "burn-in" },
      format: "16:9",
      previewText: "  Every   story begins with a word. ",
      videoEdit: legacyVideoEdit,
      force: true,
    };
    expect(hashOf(reordered)).toBe(hashOf(request));
    expect(hashOf(request)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("hashes differently for anything that changes the picture", () => {
    const base = hashOf(request);
    expect(hashOf({ ...request, format: "9:16" })).not.toBe(base);
    expect(hashOf({ ...request, subtitles: { ...request.subtitles, fontSize: 60 } })).not.toBe(
      base,
    );
    expect(hashOf({ ...request, subtitles: { ...request.subtitles, position: "top" } })).not.toBe(
      base,
    );
    expect(hashOf({ ...request, previewText: "Another line." })).not.toBe(base);
    expect(hashOf({ ...request, videoEdit: { ...legacyVideoEdit, grain: "subtle" } })).not.toBe(
      base,
    );
  });

  it("ignores caption style when captions are not burned in, and settings that don't show", () => {
    const files = { ...request, subtitles: { ...request.subtitles, mode: "files" as const } };
    expect(hashOf({ ...files, subtitles: { ...files.subtitles, fontSize: 90 } })).toBe(
      hashOf(files),
    );
    expect(normalizeStylePreview(files).captions).toBeNull();
    // Cuts and animation are not part of the preview.
    expect(
      hashOf({
        ...request,
        videoEdit: { ...legacyVideoEdit, cuts: "narration", animate: "every" },
      }),
    ).toBe(hashOf(request));
    // A hard cut has no length.
    expect(hashOf({ ...request, videoEdit: { ...legacyVideoEdit, transitionSeconds: 1.5 } })).toBe(
      hashOf(request),
    );
  });

  it("keeps the card font only when chapter cards are on", () => {
    const cards = normalizeStylePreview({
      ...request,
      subtitles: { ...request.subtitles, mode: "off", fontId: "uploaded-abc" },
      videoEdit: { ...legacyVideoEdit, chapterCards: true, transition: "crossfade" },
    });
    expect(cards.chapterCard).toEqual({ fontId: "uploaded-abc" });
    expect(cards.transition).toEqual({ kind: "crossfade", seconds: 0.6 });
    expect(normalizeStylePreview(request).chapterCard).toBeNull();
  });

  it("clamps the transition length to what the editor offers", () => {
    const long = normalizeStylePreview({
      ...request,
      videoEdit: { ...legacyVideoEdit, transition: "wipe", transitionSeconds: 9 },
    });
    expect(long.transition).toEqual({ kind: "wipe", seconds: 2 });
  });
});

describe("the Shorts layout", () => {
  const shorts = { ...request, shorts: { titleOnScreen: true, speed: 1.1 } };

  it("is 9:16 with the caption font, the headline and the speed, and nothing a short lacks", () => {
    const settings = normalizeStylePreview({
      ...shorts,
      format: "16:9",
      videoEdit: {
        ...legacyVideoEdit,
        chapterCards: true,
        transition: "crossfade",
        grain: "strong",
      },
    });
    expect(settings).toMatchObject({
      version: 2,
      format: "9:16",
      captions: null,
      transition: null,
      chapterCard: null,
      look: { vignette: "off", grain: "off", grade: "none", atmosphere: "none" },
      short: { fontId: "default", text: sampleNarrationText, title: sampleShortTitle, speed: 1.1 },
    });
    expect(previewSeconds(settings)).toBeCloseTo(5.455, 3);
  });

  it("hashes each Shorts setting that shows, apart from the video's", () => {
    const base = hashOf(shorts);
    expect(base).not.toBe(hashOf(request));
    expect(hashOf({ ...shorts, shorts: { titleOnScreen: false, speed: 1.1 } })).not.toBe(base);
    expect(hashOf({ ...shorts, shorts: { ...shorts.shorts, speed: 1.2 } })).not.toBe(base);
    expect(hashOf({ ...shorts, shorts: { ...shorts.shorts, title: "Tides" } })).not.toBe(base);
    // The caption size and position are the Shorts renderer's own.
    expect(hashOf({ ...shorts, subtitles: { ...request.subtitles, fontSize: 90 } })).toBe(base);
    // No headline shows no title, whatever it says.
    const off = { ...shorts, shorts: { titleOnScreen: false } };
    expect(hashOf({ ...off, shorts: { ...off.shorts, title: "Tides" } })).toBe(hashOf(off));
  });
});

describe("preview captions", () => {
  it("captions the sample narration with its own timed words by default", () => {
    expect(previewWords(sampleNarrationText)).toBe(sampleNarrationWords);
    expect(normalizeStylePreview(request).captions?.text).toBe(sampleNarrationText);
    expect(
      normalizeStylePreview({ ...request, previewText: "Every story begins with a word." }).captions
        ?.text,
    ).toBe(sampleNarrationText);
    const cues = previewCues(sampleNarrationText);
    expect(cues.map((cue) => cue.text).join(" ")).toBe(sampleNarrationText);
    expect(cues[0]?.start).toBe(0.5);
  });

  it("spreads other text over the stretches the narration speaks", () => {
    const words = previewWords("One two three four five six");
    expect(words.map((word) => word.text)).toEqual(["One", "two", "three", "four", "five", "six"]);
    // The narration speaks from 0.5 s to 3.4 s, pauses, then 4.18 s to 5.4 s.
    expect(words[0]?.start).toBe(0.5);
    expect(words.at(-1)?.end).toBe(5.4);
    for (const word of words) expect(word.start >= 3.4 && word.end <= 4.18).toBe(false);
    for (const [at, word] of words.entries()) {
      expect(word.end).toBeGreaterThan(word.start);
      expect(word.start).toBeGreaterThanOrEqual(words[at - 1]?.end ?? 0);
    }
  });

  it("gives every phrase a word while there are words, and an empty text none", () => {
    expect(previewWords("Hello there").map((word) => word.start)).toEqual([0.5, 4.18]);
    expect(previewWords("Hello")).toHaveLength(1);
    expect(previewWords("   ")).toEqual([]);
    const long = Array.from({ length: 30 }, (_value, at) => `word${String(at)}`).join(" ");
    expect(previewCues(long).at(-1)?.end).toBeLessThanOrEqual(6);
  });
});
