import { fileURLToPath } from "node:url";
import type { Paths } from "../../kernel/paths.js";
import { languageInfo, languageLetters, type WritingSystem } from "../../kernel/ports/languages.js";
import { resolveBoldFont, resolveFont } from "./catalog.js";
import { discoverSystemFonts } from "./discovery.js";
import { readFontFile } from "./files.js";
import type { ResolvedFont } from "./model.js";
import { mappedCodepoints, readFontMetadata } from "./sfnt.js";

// Captions in a language the chosen font can't draw would come out as empty boxes. For every
// language but English the chosen font is checked against that language's letters
// (`languageLetters`); when it misses any, the captions use a bundled Noto font for the script,
// else a font on this computer that has them all, else the render stops and says how to fix
// it. English is never checked, so an English project renders with exactly the font it chose.

// Small enough to ship: Latin, Greek and Cyrillic in one family, and the other alphabets'
// own. Chinese, Japanese and Korean fonts run to 10-20 MB each, so they are not bundled.
const bundled: Partial<Record<WritingSystem, string>> = {
  latin: "NotoSans-Regular.ttf",
  greek: "NotoSans-Regular.ttf",
  cyrillic: "NotoSans-Regular.ttf",
  arabic: "NotoSansArabic-Regular.ttf",
  hebrew: "NotoSansHebrew-Regular.ttf",
  devanagari: "NotoSansDevanagari-Regular.ttf",
  thai: "NotoSansThai-Regular.ttf",
};

export interface CaptionFontDeps {
  readonly resolve: (id: string) => Promise<ResolvedFont>;
  readonly system: () => Promise<readonly ResolvedFont[]>;
  readonly bundledDir: string;
}

export function captionFontDeps(paths: Paths): CaptionFontDeps {
  return {
    resolve: (id) => resolveFont(paths, id),
    system: discoverSystemFonts,
    bundledDir: fileURLToPath(new URL("../../assets/fonts/noto/", import.meta.url)),
  };
}

// The font captions are drawn in, for the chosen font and the project language.
export async function captionFont(
  deps: CaptionFontDeps,
  fontId: string,
  language: string | undefined,
): Promise<ResolvedFont> {
  const chosen = await deps.resolve(fontId);
  if (language === undefined || language === "en") return chosen;
  const letters = languageLetters(language);
  if (await covers(chosen, letters)) return chosen;
  const info = languageInfo(language);
  const file = bundled[info.script];
  if (file !== undefined) {
    const font = await fontFile(`${deps.bundledDir}${file}`);
    if (font !== undefined && (await covers(font, letters))) return font;
  }
  for (const font of await deps.system()) if (await covers(font, letters)) return font;
  throw new Error(
    `The caption font ${chosen.name} has no ${info.name} letters, and Slopify doesn't ship a font for ${info.name} (they are 10-20 MB). Upload a font that has them in Settings → Fonts (for example Noto Sans ${info.code === "ja" ? "JP" : info.code === "ko" ? "KR" : "SC"} from fonts.google.com), choose it in Edit project → Subtitles, then Try again.`,
  );
}

// The same for text drawn bold (the shorts' captions): the chosen font's bold face when it has
// the letters, else the fallback, which the renderer emboldens.
export async function captionBoldFont(
  paths: Paths,
  fontId: string,
  language: string | undefined,
): Promise<ResolvedFont> {
  if (language === undefined || language === "en") return resolveBoldFont(paths, fontId);
  const chosen = await resolveFont(paths, fontId);
  const font = await captionFont(captionFontDeps(paths), fontId, language);
  return font.path === chosen.path ? resolveBoldFont(paths, fontId) : font;
}

async function covers(font: ResolvedFont, letters: readonly number[]): Promise<boolean> {
  const bytes = await readFontFile(font.path);
  if (bytes === undefined) return false;
  const found = mappedCodepoints(bytes, font.faceIndex, letters);
  // A font whose cmap can't be read is taken at its word: it was chosen for this.
  return found === undefined || found.size === letters.length;
}

async function fontFile(path: string): Promise<ResolvedFont | undefined> {
  const bytes = await readFontFile(path);
  const face = bytes === undefined ? undefined : readFontMetadata(bytes)?.[0];
  if (face === undefined) return undefined;
  return {
    id: "default",
    name: face.name,
    family: face.family,
    source: "bundled",
    path,
    extension: ".ttf",
    assName: face.assName,
    faceIndex: 0,
  };
}
