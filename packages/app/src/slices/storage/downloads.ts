import { readFileSync, statSync } from "node:fs";
import { extname } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { zipSync } from "fflate";
import type { Paths } from "../../kernel/paths.js";
import { assetOf } from "./asset-name.js";
import { outputPath } from "./layout.js";
import type { Output } from "./model.js";
import { outputsOf, projectTitle } from "./repo.js";

export interface DownloadDeps {
  readonly db: DatabaseSync;
  readonly paths: Paths;
}

export interface Download {
  readonly path: string;
  readonly filename: string;
  readonly bytes: number;
  readonly contentType: string;
}

export type DownloadResult =
  | { readonly ok: true; readonly download: Download }
  | { readonly ok: false; readonly reason: "unknown-project" | "unknown-asset" | "missing-file" };

export type ImagesZipResult =
  | { readonly ok: true; readonly filename: string; readonly bytes: Uint8Array<ArrayBuffer> }
  | { readonly ok: false; readonly reason: "unknown-project" | "no-images" };

const contentTypes: Readonly<Record<string, string>> = {
  ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".wav": "audio/wav",
  ".flac": "audio/flac",
  ".ogg": "audio/ogg",
  ".opus": "audio/opus",
  ".mp4": "video/mp4",
};

// Leaves room for "-<asset>.<ext>" inside a 255-byte filename, and keeps a download
// folder readable when a title runs to the 200 characters the schema allows.
const slugLimit = 60;

export function slugOf(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, slugLimit)
    .replace(/^-+|-+$/g, "");
  return slug === "" ? "project" : slug;
}

// `assetOf` moved to asset-name.ts so the SPA can build the same URLs; it is still part
// of this module's surface, because a download name is built from it.
export { assetOf };

// logic/14 §Q116: "single files as `<title-slug>-<asset>.<ext>`".
export function downloadName(slug: string, output: Output): string {
  return `${slug}-${assetOf(output)}${extname(output.path)}`;
}

export function findDownload(deps: DownloadDeps, projectId: string, asset: string): DownloadResult {
  const title = projectTitle(deps.db, projectId);
  if (title === undefined) {
    return { ok: false, reason: "unknown-project" };
  }
  const output = outputsOf(deps.db, projectId).find((candidate) => assetOf(candidate) === asset);
  if (output === undefined) {
    return { ok: false, reason: "unknown-asset" };
  }
  const path = outputPath(deps.paths, projectId, output.path);
  const stats = sizeOf(path);
  if (stats === undefined) {
    return { ok: false, reason: "missing-file" };
  }
  return {
    ok: true,
    download: {
      path,
      filename: downloadName(slugOf(title), output),
      bytes: stats,
      contentType: contentTypes[extname(output.path).toLowerCase()] ?? "application/octet-stream",
    },
  };
}

// logic/14 §Q116: "download all" images as `<title-slug>-images.zip`, thumbnail included.
export function imagesZip(deps: DownloadDeps, projectId: string): ImagesZipResult {
  const title = projectTitle(deps.db, projectId);
  if (title === undefined) {
    return { ok: false, reason: "unknown-project" };
  }
  const slug = slugOf(title);
  const entries: Record<string, [Uint8Array, { level: 0 }]> = {};
  for (const output of outputsOf(deps.db, projectId)) {
    if (output.role !== "image" && output.role !== "thumbnail") {
      continue;
    }
    const path = outputPath(deps.paths, projectId, output.path);
    if (sizeOf(path) === undefined) {
      // A missing file is the project page's problem per logic/14; the rest still zips.
      continue;
    }
    // Images are already compressed formats, so deflating them costs time and saves
    // nothing. ceiling: 60 images (logic/05 §Q39) are read into memory at once; a set
    // large enough to hurt would move to fflate's streaming Zip.
    entries[`${slug}-${assetOf(output)}${extname(output.path)}`] = [
      readFileSync(path),
      { level: 0 },
    ];
  }
  if (Object.keys(entries).length === 0) {
    return { ok: false, reason: "no-images" };
  }
  return { ok: true, filename: `${slug}-images.zip`, bytes: zipSync(entries) };
}

function sizeOf(path: string): number | undefined {
  const stats = statSync(path, { throwIfNoEntry: false });
  return stats === undefined || !stats.isFile() ? undefined : stats.size;
}
