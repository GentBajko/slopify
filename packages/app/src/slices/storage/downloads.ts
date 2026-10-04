import { readFileSync, statSync } from "node:fs";
import { extname } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { zipSync } from "fflate";
import type { Paths } from "../../kernel/paths.js";
import { effectiveDescription } from "../youtube/edits-repo.js";
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
  // Served instead of the file when set: the YouTube description and tags as shown.
  readonly text?: Uint8Array<ArrayBuffer>;
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
  ".pdf": "application/pdf",
  ".srt": "application/x-subrip; charset=utf-8",
  ".vtt": "text/vtt; charset=utf-8",
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

// "single files as `<title-slug>-<asset>.<ext>`".
export function downloadName(slug: string, output: Output): string {
  return `${slug}-${assetOf(output)}${extname(output.path)}`;
}

// Which version of its place a file is: 1 for the first file ever saved there, 2 for the one
// that replaced it, and so on. Retained files keep their number across later versions of the
// project, so the same file always downloads under the same name.
export function fileVersion(
  deps: DownloadDeps,
  projectId: string,
  slot: string,
  assetId: string,
): number {
  const assets = deps.db
    .prepare(
      `SELECT o.asset_id AS id, MIN(a.created_at) AS made FROM revision_outputs o
      JOIN project_assets a ON a.project_id=o.project_id AND a.id=o.asset_id
      WHERE o.project_id=? AND o.slot=? GROUP BY o.asset_id ORDER BY made, o.asset_id`,
    )
    .all(projectId, slot)
    .map((row) => String(row.id));
  return Math.max(1, assets.indexOf(assetId) + 1);
}

// "tides-image-3.png" for a first version, "tides-image-3-v2.png" once it was remade, so a
// newer download never silently takes an older one's name.
export function versionedName(name: string, version: number): string {
  if (version <= 1) return name;
  const extension = extname(name);
  return `${name.slice(0, name.length - extension.length)}-v${String(version)}${extension}`;
}

// The version of the file a project's current output points at, so the current download and
// History name the same file the same way.
function currentVersion(deps: DownloadDeps, projectId: string, path: string): number {
  const row = deps.db
    .prepare(
      `SELECT o.slot, o.asset_id FROM revision_outputs o
      JOIN project_assets a ON a.project_id=o.project_id AND a.id=o.asset_id
      WHERE o.project_id=? AND a.path=? LIMIT 1`,
    )
    .get(projectId, path);
  return row === undefined
    ? 1
    : fileVersion(deps, projectId, String(row.slot), String(row.asset_id));
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
  const shown =
    output.role === "youtube_description" ||
    output.role === "youtube_tags" ||
    output.role === "youtube_pinned_comment" ||
    output.role === "youtube_titles"
      ? shownYoutubeText(deps, projectId, output.role)
      : undefined;
  return {
    ok: true,
    download: {
      path,
      filename: versionedName(
        downloadName(slugOf(title), output),
        currentVersion(deps, projectId, output.path),
      ),
      bytes: shown?.byteLength ?? stats,
      contentType: contentTypeOf(path),
      ...(shown === undefined ? {} : { text: shown }),
    },
  };
}

// The description, tags, pinned comment and other titles download as the project page shows and copies them, and as Prepare
// upload hands them on: the user's hand edits over the written text, chapters fitted, and the
// channel's and project's links filled in (`youtube/edits-repo.ts`). The file on disk stays
// the generated text, so regeneration can tell the user's edits from its own.
function shownYoutubeText(
  deps: DownloadDeps,
  projectId: string,
  role: "youtube_description" | "youtube_tags" | "youtube_pinned_comment" | "youtube_titles",
): Uint8Array<ArrayBuffer> | undefined {
  const outputs = outputsOf(deps.db, projectId);
  const read = (wanted: string): string | undefined => {
    const output = outputs.find((candidate) => candidate.role === wanted);
    if (output === undefined) return undefined;
    const path = outputPath(deps.paths, projectId, output.path);
    return sizeOf(path) === undefined ? undefined : readFileSync(path, "utf8").trim();
  };
  const description = read("youtube_description");
  if (description === undefined) return undefined;
  const video = outputs.find((output) => output.role === "video");
  const shown = effectiveDescription(deps.db, projectId, {
    description,
    tags: read("youtube_tags") ?? "",
    pinnedComment: read("youtube_pinned_comment"),
    titles: read("youtube_titles"),
    durationSeconds:
      video?.durationMs === null || video?.durationMs === undefined
        ? undefined
        : video.durationMs / 1000,
  });
  const text =
    role === "youtube_description"
      ? shown.description
      : role === "youtube_tags"
        ? shown.tags
        : role === "youtube_pinned_comment"
          ? shown.pinnedComment
          : shown.titles;
  return new TextEncoder().encode(`${text}\n`);
}

// "download all" images as `<title-slug>-images.zip`, thumbnail included.
// `set`: every picture (Images' Download all), the thumbnails alone, or every rendered short.
export function imagesZip(
  deps: DownloadDeps,
  projectId: string,
  set: "images" | "thumbnails" | "shorts" = "images",
): ImagesZipResult {
  const title = projectTitle(deps.db, projectId);
  if (title === undefined) {
    return { ok: false, reason: "unknown-project" };
  }
  const slug = slugOf(title);
  const entries: Record<string, [Uint8Array, { level: 0 }]> = {};
  for (const output of outputsOf(deps.db, projectId)) {
    const member =
      set === "images"
        ? output.role === "image" || output.role === "thumbnail"
        : set === "thumbnails"
          ? output.role === "thumbnail"
          : output.role === "short_video";
    if (!member) {
      continue;
    }
    const path = outputPath(deps.paths, projectId, output.path);
    if (sizeOf(path) === undefined) {
      // A missing file is the project page's problem; the rest still zips.
      continue;
    }
    // Images are already compressed formats, so deflating them costs time and saves
    // nothing. ceiling: 60 images are read into memory at once; a set
    // large enough to hurt would move to fflate's streaming Zip.
    entries[`${slug}-${assetOf(output)}${extname(output.path)}`] = [
      readFileSync(path),
      { level: 0 },
    ];
  }
  if (Object.keys(entries).length === 0) {
    return { ok: false, reason: "no-images" };
  }
  return { ok: true, filename: `${slug}-${set}.zip`, bytes: zipSync(entries) };
}

function sizeOf(path: string): number | undefined {
  const stats = statSync(path, { throwIfNoEntry: false });
  return stats === undefined || !stats.isFile() ? undefined : stats.size;
}

export function contentTypeOf(path: string): string {
  return contentTypes[extname(path).toLowerCase()] ?? "application/octet-stream";
}
