import type { Paths } from "../../kernel/paths.js";
import { missingFont, resolveFont } from "./catalog.js";
import { readFontFile } from "./files.js";
import { standaloneFont } from "./sfnt.js";

export interface FontPreview {
  readonly content: Uint8Array;
  readonly contentType: "font/ttf" | "font/otf";
}

export async function previewFont(paths: Paths, id: string): Promise<FontPreview> {
  const font = await resolveFont(paths, id);
  const bytes = await readFontFile(font.path);
  const content = bytes === undefined ? undefined : standaloneFont(bytes, font.faceIndex);
  if (content === undefined) throw missingFont();
  return {
    content,
    contentType: Buffer.from(content).readUInt32BE(0) === 0x4f54544f ? "font/otf" : "font/ttf",
  };
}
