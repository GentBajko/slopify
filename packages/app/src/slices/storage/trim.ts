import { existsSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { Paths } from "../../kernel/paths.js";
import { derive } from "../../kernel/runner/graph.js";
import { projectExists, projectPaused, stagesOf } from "../admission/repo.js";
import { backupsFolderName, projectDir } from "./layout.js";
import type { OutputRole } from "./model.js";
import { pieceFile } from "./reconcile.js";

// Keep outputs only: a finished project drops the working files it was made from (images,
// narration parts, subtitle timing, render settings) and keeps what gets published. Two
// rules keep it safe. A file the user supplied is never removed, because nothing could make
// it again. And only files a project record names are removed: anything else in the folder
// is reconcile's business (`reconcile.ts`), which leaves the Backups folder alone.

// What a finished project is for: the files that get uploaded or read, from every revision,
// so an older video in History stays too.
export const outputRoles: readonly OutputRole[] = [
  "video",
  "short_video",
  "shorts",
  "thumbnail",
  "article_md",
  "article_txt",
  "sources",
  "youtube_description",
  "youtube_tags",
  "document_pdf",
  "audio_export",
  "subtitles_srt",
  "subtitles_vtt",
];

export interface ProjectStorage {
  readonly outputsBytes: number;
  readonly workingBytes: number;
  // What Keep outputs only would remove now: the files and their size.
  readonly removableFiles: number;
  readonly removableBytes: number;
  // Finished (done, or done with problems) with nothing running or waiting.
  readonly finished: boolean;
}

export interface TrimDeps {
  readonly db: DatabaseSync;
  readonly paths: Paths;
  readonly hasInflight?: ((projectId: string) => boolean) | undefined;
}

export type TrimResult =
  | { readonly ok: true; readonly files: number; readonly bytesFreed: number }
  | { readonly ok: false; readonly reason: "no-project" | "not-finished" };

export function projectStorage(deps: TrimDeps, projectId: string): ProjectStorage {
  const files = filesOf(deps.paths, projectId);
  const kept = keptPaths(deps.db, projectId);
  const outputs = outputPaths(deps.db, projectId);
  const removable = removablePaths(deps.db, projectId, kept);
  let outputsBytes = 0;
  let workingBytes = 0;
  let removableFiles = 0;
  let removableBytes = 0;
  for (const [path, bytes] of files) {
    if (outputs.has(path)) outputsBytes += bytes;
    else workingBytes += bytes;
    if (removable.has(path)) {
      removableFiles += 1;
      removableBytes += bytes;
    }
  }
  return {
    outputsBytes,
    workingBytes,
    removableFiles,
    removableBytes,
    finished: finished(deps, projectId),
  };
}

export function keepOutputsOnly(deps: TrimDeps, projectId: string): TrimResult {
  if (!projectExists(deps.db, projectId)) return { ok: false, reason: "no-project" };
  if (!finished(deps, projectId)) return { ok: false, reason: "not-finished" };
  const files = filesOf(deps.paths, projectId);
  const removable = removablePaths(deps.db, projectId, keptPaths(deps.db, projectId));
  let count = 0;
  let bytesFreed = 0;
  for (const path of removable) {
    const bytes = files.get(path);
    if (bytes === undefined) continue;
    unlinkSync(join(projectDir(deps.paths, projectId), path));
    count += 1;
    bytesFreed += bytes;
  }
  return { ok: true, files: count, bytesFreed };
}

function finished(deps: TrimDeps, projectId: string): boolean {
  if (deps.hasInflight?.(projectId) === true) return false;
  const state = derive(stagesOf(deps.db, projectId), projectPaused(deps.db, projectId));
  if (state !== "done" && state !== "partial") return false;
  // Nothing admitted that could still start: a rebuild waiting to be picked up needs its inputs.
  return (
    deps.db
      .prepare(
        "SELECT 1 FROM revision_work WHERE project_id=? AND (state='running' OR (state='pending' AND dispatch_state='allowed')) LIMIT 1",
      )
      .get(projectId) === undefined
  );
}

// Every file under the project folder, by project-relative path with forward slashes.
function filesOf(paths: Paths, projectId: string): ReadonlyMap<string, number> {
  const files = new Map<string, number>();
  if (projectId === backupsFolderName) return files;
  const root = projectDir(paths, projectId);
  if (!existsSync(root)) return files;
  for (const entry of readdirSync(root, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile()) continue;
    const full = join(entry.parentPath, entry.name);
    files.set(relative(root, full).split(sep).join("/"), statSync(full).size);
  }
  return files;
}

function outputPaths(db: DatabaseSync, projectId: string): ReadonlySet<string> {
  const roles = outputRoles.map(() => "?").join(",");
  return pathsOf(
    db
      .prepare(
        `SELECT a.path FROM revision_outputs o JOIN project_assets a ON a.id=o.asset_id AND a.project_id=o.project_id
         WHERE o.project_id=? AND json_extract(o.descriptor,'$.role') IN (${roles})
         UNION SELECT path FROM outputs WHERE project_id=? AND role IN (${roles})`,
      )
      .all(projectId, ...outputRoles, projectId, ...outputRoles),
  );
}

// The outputs, and every file the user supplied: an asset any saved revision or the project's
// settings name, or a legacy output row that came from an upload.
function keptPaths(db: DatabaseSync, projectId: string): ReadonlySet<string> {
  const kept = new Set(outputPaths(db, projectId));
  for (const path of pathsOf(
    db
      .prepare(
        `SELECT a.path FROM project_assets a WHERE a.project_id=? AND (
           EXISTS(SELECT 1 FROM project_revisions r WHERE r.project_id=a.project_id
             AND (instr(r.content,a.id)>0 OR instr(r.config,a.id)>0))
           OR EXISTS(SELECT 1 FROM projects p WHERE p.id=a.project_id AND instr(p.config,a.id)>0))
         UNION SELECT path FROM outputs WHERE project_id=? AND original_filename IS NOT NULL`,
      )
      .all(projectId, projectId),
  ))
    kept.add(path);
  return kept;
}

// The files a record names that are not kept: made by a step, so a step can make them again.
function removablePaths(
  db: DatabaseSync,
  projectId: string,
  kept: ReadonlySet<string>,
): ReadonlySet<string> {
  const named = new Set([
    ...pathsOf(
      db
        .prepare(
          "SELECT path FROM project_assets WHERE project_id=? UNION SELECT path FROM outputs WHERE project_id=?",
        )
        .all(projectId, projectId),
    ),
  ]);
  for (const row of db
    .prepare(
      "SELECT p.payload FROM stage_pieces p JOIN stages s ON s.id=p.stage_id WHERE s.project_id=? AND p.payload IS NOT NULL",
    )
    .all(projectId)) {
    const file = pieceFile(row.payload);
    if (file !== undefined) named.add(file.split(sep).join("/"));
  }
  return new Set([...named].filter((path) => !kept.has(path)));
}

function pathsOf(rows: readonly Record<string, unknown>[]): Set<string> {
  const paths = new Set<string>();
  for (const row of rows)
    if (typeof row.path === "string") paths.add(row.path.split("\\").join("/"));
  return paths;
}
