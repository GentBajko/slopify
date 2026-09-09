import { defaultSubtitles, subtitleConfigSchema } from "@app/slices/subtitles/model.js";
import { describe, expect, it } from "vitest";
import { draftOf, freshForm } from "@/play/state";
import { subtitlesFor, validSubtitleStyle } from "./config";

function draft(audio: "off" | "generate", video: "off" | "generate") {
  return draftOf({
    form: {
      ...freshForm,
      sources: { ...freshForm.sources, audio, video },
      subtitles: { ...defaultSubtitles, mode: "burn-in", fontId: "custom", fontSize: 64 },
    },
    entries: [],
    slots: [],
    silenceGapSeconds: 3,
  });
}

describe("subtitle draft", () => {
  it("sends the selected font and mode, converts WAV burn-in to files, and clears captions without audio", () => {
    expect(draft("generate", "generate").subtitles).toEqual({
      ...defaultSubtitles,
      mode: "burn-in",
      fontId: "custom",
      fontSize: 64,
    });
    expect(draft("generate", "off").subtitles?.mode).toBe("files");
    expect(draft("off", "generate").subtitles?.mode).toBe("off");
  });
  it("refuses fractional and out-of-range font sizes", () => {
    for (const fontSize of [0, 15, 48.5, 121, Number.NaN])
      expect(validSubtitleStyle({ ...defaultSubtitles, mode: "burn-in", fontSize })).toBe(false);
    expect(validSubtitleStyle({ ...defaultSubtitles, mode: "files", fontSize: 120 })).toBe(true);
  });
});

it.each([0, 150, Number.NaN])(
  "normalizes invalid hidden style fields when subtitles resolve to Off: %s",
  (fontSize) => {
    for (const subtitles of [
      subtitlesFor({ ...defaultSubtitles, mode: "off", fontId: "", fontSize }, freshForm.sources),
      subtitlesFor(
        { ...defaultSubtitles, mode: "burn-in", fontSize },
        { ...freshForm.sources, audio: "off" },
      ),
    ]) {
      expect(subtitleConfigSchema.safeParse(subtitles).success).toBe(true);
      expect(subtitles.fontSize).toBe(defaultSubtitles.fontSize);
      expect(subtitles.mode).toBe("off");
    }
  },
);
