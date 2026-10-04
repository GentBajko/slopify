import { readFileSync, statSync } from "node:fs";
import { extname } from "node:path";
import { zipSync } from "fflate";
import { z } from "zod";
import { stageKinds } from "../../kernel/pipeline.js";
import { thumbnailCountOf } from "../admission/model.js";
import type { DownloadDeps, DownloadResult, ImagesZipResult } from "../storage/downloads.js";
import {
  contentTypeOf,
  downloadName,
  fileVersion,
  slugOf,
  versionedName,
} from "../storage/downloads.js";
import { outputPath } from "../storage/layout.js";
import { projectTitle } from "../storage/repo.js";
import { outputSchema } from "../storage/schema.js";
import { positionedOutput } from "./projection.js";
import { outputsForRevision, revisionById } from "./repo.js";
import { stagePieceSchema } from "./schema.js";

export function findRevisionDownload(
  deps: DownloadDeps,
  projectId: string,
  revisionId: string,
  recordId: string,
): DownloadResult {
  if (projectTitle(deps.db, projectId) === undefined)
    return { ok: false, reason: "unknown-project" };
  const revision = revisionById(deps.db, projectId, revisionId);
  if (revision === undefined) return { ok: false, reason: "unknown-asset" };
  const output = deps.db
    .prepare(`SELECT o.descriptor, o.slot, o.asset_id, a.path FROM revision_outputs o
    JOIN project_assets a ON a.project_id=o.project_id AND a.id=o.asset_id
    WHERE o.project_id=? AND o.revision_id=? AND o.id=?`)
    .get(projectId, revisionId, recordId);
  if (output !== undefined) {
    const path = outputPath(deps.paths, projectId, z.string().parse(output.path));
    const descriptor = outputSchema.parse(JSON.parse(z.string().parse(output.descriptor)));
    return fileDownload(
      path,
      versionedName(
        downloadName(slugOf(revision.config.title), { ...descriptor, path }),
        fileVersion(
          deps,
          projectId,
          z.string().parse(output.slot),
          z.string().parse(output.asset_id),
        ),
      ),
    );
  }
  const piece = deps.db
    .prepare(`SELECT p.descriptor, p.stage_kind, a.path FROM revision_pieces p
    JOIN project_assets a ON a.project_id=p.project_id AND a.id=p.asset_id
    WHERE p.project_id=? AND p.revision_id=? AND p.id=?`)
    .get(projectId, revisionId, recordId);
  if (piece === undefined) return { ok: false, reason: "unknown-asset" };
  const path = outputPath(deps.paths, projectId, z.string().parse(piece.path));
  const descriptor = stagePieceSchema.parse(JSON.parse(z.string().parse(piece.descriptor)));
  const stageKind = z.enum(stageKinds).parse(piece.stage_kind);
  return fileDownload(
    path,
    `${slugOf(revision.config.title)}-${stageKind}-${descriptor.kind}-${descriptor.idx}${extname(path)}`,
  );
}

// The sets the project page downloads as one zip: every picture (Images' Download all), the
// thumbnails alone, or every rendered short. `only` narrows a set to the records the person
// picked, so the zip holds exactly those files and nothing else.
export const zipSets = ["images", "thumbnails", "shorts"] as const;
export type ZipSet = (typeof zipSets)[number];

export function revisionImagesZip(
  deps: DownloadDeps,
  projectId: string,
  revisionId: string,
): ImagesZipResult {
  return revisionSetZip(deps, projectId, revisionId, "images");
}

export function revisionSetZip(
  deps: DownloadDeps,
  projectId: string,
  revisionId: string,
  set: ZipSet,
  only?: readonly string[],
): ImagesZipResult {
  if (projectTitle(deps.db, projectId) === undefined)
    return { ok: false, reason: "unknown-project" };
  const revision = revisionById(deps.db, projectId, revisionId);
  if (revision === undefined) return { ok: false, reason: "no-images" };
  const slug = slugOf(revision.config.title);
  const picked = only === undefined ? undefined : new Set(only);
  const entries: Record<string, [Uint8Array, { level: 0 }]> = {};
  const thumbnail = (role: string, index: unknown): boolean =>
    // Every thumbnail the project makes; a second or third left from when it made three stays
    // out once it makes one.
    role === "thumbnail" &&
    (typeof index === "number" ? index : 1) <= thumbnailCountOf(revision.config);
  const members = outputsForRevision(deps.db, projectId, revisionId)
    .filter(
      (row) =>
        row.selected &&
        (picked === undefined || picked.has(row.recordId)) &&
        (set === "images"
          ? row.output.role === "image" || thumbnail(row.output.role, row.output.meta.index)
          : set === "thumbnails"
            ? thumbnail(row.output.role, row.output.meta.index)
            : row.output.role === "short_video"),
    )
    .map((row) => ({ ...positionedOutput(revision, row), slot: row.slot }))
    .sort(
      (a, b) => setOrder(a.output.role, a.output.meta) - setOrder(b.output.role, b.output.meta),
    );
  for (const row of members) {
    const asset = deps.db
      .prepare("SELECT path FROM project_assets WHERE project_id=? AND id=?")
      .get(projectId, row.assetId);
    if (asset === undefined) throw new Error("Revision image asset is not registered.");
    const path = outputPath(deps.paths, projectId, z.string().parse(asset.path));
    if (statSync(path, { throwIfNoEntry: false })?.isFile() !== true) continue;
    // Images and video are already compressed, so they are stored rather than deflated.
    entries[
      versionedName(
        downloadName(slug, { ...row.output, path }),
        fileVersion(deps, projectId, row.slot, row.assetId),
      )
    ] = [readFileSync(path), { level: 0 }];
  }
  return Object.keys(entries).length === 0
    ? { ok: false, reason: "no-images" }
    : {
        ok: true,
        filename: `${slug}-${set}${picked === undefined ? "" : "-selected"}.zip`,
        bytes: zipSync(entries),
      };
}

function fileDownload(path: string, filename: string): DownloadResult {
  const stats = statSync(path, { throwIfNoEntry: false });
  return stats === undefined || !stats.isFile()
    ? { ok: false, reason: "missing-file" }
    : {
        ok: true,
        download: { path, filename, bytes: stats.size, contentType: contentTypeOf(path) },
      };
}

function setOrder(
  role: string,
  meta: { readonly index?: unknown; readonly short?: unknown },
): number {
  if (role === "short_video") return typeof meta.short === "number" ? meta.short : 0;
  const index = typeof meta.index === "number" ? meta.index : 0;
  return role === "thumbnail" ? 1_000_000 + index : index;
}
