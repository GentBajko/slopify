import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { languageLetters } from "../../kernel/ports/languages.js";
import { type CaptionFontDeps, captionFont } from "./coverage.js";
import type { ResolvedFont } from "./model.js";
import { mappedCodepoints } from "./sfnt.js";

const asset = (path: string): string =>
  fileURLToPath(new URL(`../../assets/fonts/${path}`, import.meta.url));
const barlow: ResolvedFont = {
  id: "default",
  name: "Barlow Regular",
  family: "Barlow",
  source: "bundled",
  path: asset("Barlow-Regular.ttf"),
  extension: ".ttf",
  assName: "Barlow Regular",
  faceIndex: 0,
};
const deps = (system: readonly ResolvedFont[] = []): CaptionFontDeps => ({
  resolve: async () => barlow,
  system: async () => system,
  bundledDir: asset("noto/"),
});

describe("caption font coverage", () => {
  it("reads which letters a font has from its cmap", () => {
    const bytes = readFileSync(barlow.path);
    const letters = languageLetters("pl");
    expect(mappedCodepoints(bytes, 0, letters)?.size).toBe(letters.length);
    const cyrillic = languageLetters("ru").filter((code) => code > 0x400);
    expect(mappedCodepoints(bytes, 0, cyrillic)?.size).toBe(0);
  });

  it("keeps the chosen font for English without checking it, and when it has the letters", async () => {
    expect(await captionFont(deps(), "default", undefined)).toBe(barlow);
    expect(await captionFont(deps(), "default", "en")).toBe(barlow);
    expect(await captionFont(deps(), "default", "cs")).toBe(barlow);
  });

  it("falls back to the bundled Noto font for the script", async () => {
    expect((await captionFont(deps(), "default", "ru")).family).toBe("Noto Sans");
    expect((await captionFont(deps(), "default", "el")).family).toBe("Noto Sans");
    expect((await captionFont(deps(), "default", "ar")).family).toBe("Noto Sans Arabic");
    expect((await captionFont(deps(), "default", "hi")).family).toBe("Noto Sans Devanagari");
  });

  it("uses a font on this computer for a script Slopify doesn't ship, else says what to do", async () => {
    await expect(captionFont(deps(), "default", "ja")).rejects.toThrow(
      /no Japanese letters.*Edit project → Subtitles.*Upload font.*Noto Sans JP/,
    );
    const arabic = { ...barlow, id: "system-x", path: asset("noto/NotoSansArabic-Regular.ttf") };
    await expect(captionFont(deps([arabic]), "default", "ko")).rejects.toThrow(/Korean/);
  });
});
