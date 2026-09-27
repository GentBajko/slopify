import { describe, expect, it } from "vitest";
import { legacyVideoEdit } from "../video/edit-settings.js";
import type { StylePreviewRequest } from "./schema.js";
import {
  normalizeStylePreview,
  sampleCues,
  sampleWords,
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

describe("sample captions", () => {
  it("spreads the text over the preview as up to three timed cues", () => {
    const cues = sampleCues("Every story begins with a word.");
    expect(cues.map((cue) => cue.text).join(" ")).toBe("Every story begins with a word.");
    expect(cues).toHaveLength(3);
    for (const [at, cue] of cues.entries()) {
      expect(cue.start).toBeGreaterThanOrEqual(0);
      expect(cue.end).toBeLessThanOrEqual(6);
      expect(cue.end).toBeGreaterThan(cue.start);
      expect(cue.start).toBeGreaterThanOrEqual(cues[at - 1]?.end ?? 0);
    }
  });

  it("gives a short text one cue per word and an empty one none", () => {
    expect(sampleCues("Hello there").map((cue) => cue.text)).toEqual(["Hello", "there"]);
    expect(sampleWords("   ")).toEqual([]);
  });

  it("times a long text without breaking the caption rules", () => {
    const text = Array.from({ length: 30 }, (_value, at) => `word${String(at)}`).join(" ");
    const cues = sampleCues(text);
    expect(cues.length).toBeGreaterThanOrEqual(3);
    expect(cues.at(-1)?.end).toBeLessThanOrEqual(6);
  });
});
