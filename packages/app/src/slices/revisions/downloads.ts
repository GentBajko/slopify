import { readFileSync, statSync } from "node:fs";
import { extname } from "node:path";
import { zipSync } from "fflate";
import { z } from "zod";
import { stageKinds } from "../../kernel/pipeline.js";
import type { DownloadDeps, DownloadResult, ImagesZipResult } from "../storage/downloads.js";
import { contentTypeOf, downloadName, slugOf } from "../storage/downloads.js";
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
    .prepare(`SELECT o.descriptor, a.path FROM revision_outputs o
    JOIN project_assets a ON a.project_id=o.project_id AND a.id=o.asset_id
    WHERE o.project_id=? AND o.revision_id=? AND o.id=?`)
    .get(projectId, revisionId, recordId);
  if (output !== undefined) {
    const path = outputPath(deps.paths, projectId, z.string().parse(output.path));
    const descriptor = outputSchema.parse(JSON.parse(z.string().parse(output.descriptor)));
    return fileDownload(path, downloadName(slugOf(revision.config.title), { ...descriptor, path }));
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

export function revisionImagesZip(
  deps: DownloadDeps,
  projectId: string,
  revisionId: string,
): ImagesZipResult {
  if (projectTitle(deps.db, projectId) === undefined)
    return { ok: false, reason: "unknown-project" };
  const revision = revisionById(deps.db, projectId, revisionId);
  if (revision === undefined) return { ok: false, reason: "no-images" };
  const slug = slugOf(revision.config.title);
  const entries: Record<string, [Uint8Array, { level: 0 }]> = {};
  const images = outputsForRevision(deps.db, projectId, revisionId)
    .filter(
      (row) => row.selected && (row.output.role === "image" || row.output.role === "thumbnail"),
    )
    .map((row) => positionedOutput(revision, row))
    .sort(
      (a, b) =>
        imageOrder(a.output.role, a.output.meta.index) -
        imageOrder(b.output.role, b.output.meta.index),
    );
  for (const row of images) {
    const asset = deps.db
      .prepare("SELECT path FROM project_assets WHERE project_id=? AND id=?")
      .get(projectId, row.assetId);
    if (asset === undefined) throw new Error("Revision image asset is not registered.");
    const path = outputPath(deps.paths, projectId, z.string().parse(asset.path));
    if (statSync(path, { throwIfNoEntry: false })?.isFile() !== true) continue;
    entries[downloadName(slug, { ...row.output, path })] = [readFileSync(path), { level: 0 }];
  }
  return Object.keys(entries).length === 0
    ? { ok: false, reason: "no-images" }
    : { ok: true, filename: `${slug}-images.zip`, bytes: zipSync(entries) };
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

function imageOrder(role: string, index: unknown): number {
  return role === "thumbnail" ? Number.MAX_SAFE_INTEGER : typeof index === "number" ? index : 0;
}
