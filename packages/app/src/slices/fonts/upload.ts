import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { z } from "zod";
import type { Paths } from "../../kernel/paths.js";
import type { FontSummary } from "./model.js";
import { fontMaxBytes } from "./model.js";
import { readFontMetadata } from "./sfnt.js";

export interface FontUpload {
  readonly filename: string;
  readonly content: Uint8Array;
}
export type FontUploadResult =
  | { readonly ok: true; readonly font: FontSummary }
  | {
      readonly ok: false;
      readonly reason: "unsafe-filename" | "unsupported-format" | "too-large" | "invalid-font";
    };

const filename = z
  .string()
  .min(1)
  .max(255)
  .refine(
    (value) =>
      !value.includes("/") &&
      !value.includes("\\") &&
      !value.includes(":") &&
      ![...value].some((character) => (character.codePointAt(0) ?? 0) < 32),
  );

export async function uploadFont(paths: Paths, input: FontUpload): Promise<FontUploadResult> {
  if (!filename.safeParse(input.filename).success) return { ok: false, reason: "unsafe-filename" };
  if (![".ttf", ".otf"].includes(extname(input.filename).toLowerCase()))
    return { ok: false, reason: "unsupported-format" };
  if (input.content.byteLength > fontMaxBytes) return { ok: false, reason: "too-large" };
  const metadata = readFontMetadata(input.content);
  const face = metadata?.[0];
  if (face === undefined || metadata?.length !== 1 || face.extension === ".ttc")
    return { ok: false, reason: "invalid-font" };
  const id = `uploaded-${createHash("sha256").update(input.content).digest("hex")}`;
  const root = join(paths.dataDir, "fonts");
  await mkdir(root, { recursive: true, mode: 0o700 });
  if (!(await lstat(root)).isDirectory())
    throw new Error("The font storage directory is unavailable.");
  const temporary = join(root, `.upload-${randomUUID()}`);
  try {
    await writeFile(temporary, input.content, { mode: 0o600, flag: "wx" });
    await rename(temporary, join(root, `${id}${face.extension}`));
  } finally {
    await rm(temporary, { force: true });
  }
  return { ok: true, font: { id, name: face.name, family: face.family, source: "uploaded" } };
}
