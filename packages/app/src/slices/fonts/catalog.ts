import { createHash } from "node:crypto";
import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Paths } from "../../kernel/paths.js";
import { discoverSystemFonts } from "./discovery.js";
import { readFontFile, unavailable } from "./files.js";
import type { FontSummary, ResolvedFont } from "./model.js";
import { fontSummary } from "./model.js";
import { readFontMetadata } from "./sfnt.js";

export const fontIdPattern = /^(?:default|(?:system|uploaded)-[a-f0-9]{64})$/;
const uploadName = /^(uploaded-[a-f0-9]{64})\.(ttf|otf)$/;
const bundled = fileURLToPath(new URL("../../assets/fonts/Barlow-Regular.ttf", import.meta.url));
// Barlow's own Bold face, for text drawn bold in the bundled font (the shorts' captions);
// not listed as a font of its own.
const bundledBold = fileURLToPath(new URL("../../assets/fonts/Barlow-Bold.ttf", import.meta.url));

export async function listFonts(paths: Paths): Promise<readonly FontSummary[]> {
  const [defaultFont, uploaded, system] = await Promise.all([
    bundledFont(),
    uploadedFonts(paths),
    discoverSystemFonts(),
  ]);
  return [defaultFont, ...uploaded, ...system].map(fontSummary);
}

export async function resolveFont(paths: Paths, id: string): Promise<ResolvedFont> {
  if (!fontIdPattern.test(id)) throw missingFont();
  if (id === "default") return bundledFont();
  const fonts = id.startsWith("uploaded-")
    ? await uploadedFonts(paths, id)
    : await discoverSystemFonts();
  const font = fonts.find((font) => font.id === id);
  if (font === undefined) throw missingFont();
  return font;
}

// The font to draw bold text in: for the bundled Barlow its real Bold face, so the letters
// are drawn as designed; any other font is the font itself, which libass emboldens.
export async function resolveBoldFont(paths: Paths, id: string): Promise<ResolvedFont> {
  if (id !== "default") return resolveFont(paths, id);
  const bytes = await readFontFile(bundledBold);
  const face = bytes === undefined ? undefined : readFontMetadata(bytes)?.[0];
  if (face === undefined)
    throw new Error("Slopify's bundled Barlow Bold font is missing or invalid. Reinstall Slopify.");
  return {
    id: "default",
    name: face.name,
    family: face.family,
    source: "bundled",
    path: bundledBold,
    extension: ".ttf",
    assName: face.assName,
    faceIndex: 0,
  };
}

export function missingFont(): Error {
  return new Error(
    "The chosen caption font is no longer available; it may have been uninstalled or deleted. Choose another font in Edit project → Subtitles, then try again.",
    {
      cause: "font-not-found",
    },
  );
}
export function isMissingFont(error: unknown): boolean {
  return error instanceof Error && error.cause === "font-not-found";
}

async function bundledFont(): Promise<ResolvedFont> {
  const bytes = await readFontFile(bundled);
  const face = bytes === undefined ? undefined : readFontMetadata(bytes)?.[0];
  if (face === undefined)
    throw new Error("Slopify's bundled Barlow font is missing or invalid. Reinstall Slopify.");
  return {
    id: "default",
    name: face.name,
    family: face.family,
    source: "bundled",
    path: bundled,
    extension: ".ttf",
    assName: face.assName,
    faceIndex: 0,
  };
}

async function uploadedFonts(paths: Paths, wanted?: string): Promise<readonly ResolvedFont[]> {
  const root = join(paths.dataDir, "fonts");
  let names: readonly string[];
  try {
    if (!(await lstat(root)).isDirectory()) return [];
    names = wanted === undefined ? await readdir(root) : [`${wanted}.ttf`, `${wanted}.otf`];
  } catch (error) {
    if (unavailable(error)) return [];
    throw error;
  }
  const result: ResolvedFont[] = [];
  for (const name of names.toSorted()) {
    const id = uploadName.exec(name)?.[1];
    if (id === undefined) continue;
    const path = join(root, name);
    const bytes = await readFontFile(path);
    if (
      bytes === undefined ||
      `uploaded-${createHash("sha256").update(bytes).digest("hex")}` !== id
    )
      continue;
    const face = readFontMetadata(bytes)?.[0];
    if (face === undefined || face.extension === ".ttc") continue;
    result.push({
      id,
      name: face.name,
      family: face.family,
      source: "uploaded",
      path,
      extension: face.extension,
      assName: face.assName,
      faceIndex: 0,
    });
  }
  return result;
}
