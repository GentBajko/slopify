import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { Output, OutputMeta, StagedFile } from "./model.js";
import { outputRoles, stagedFileStates, stageKinds } from "./model.js";

const metaSchema = z.object({
  promptName: z.string().optional(),
  prompt: z.string().optional(),
  index: z.number().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
  voice: z.string().optional(),
});

const outputRow = z.object({
  id: z.string(),
  project_id: z.string(),
  stage_kind: z.enum(stageKinds),
  role: z.enum(outputRoles),
  path: z.string(),
  original_filename: z.string().nullable(),
  bytes: z.number(),
  duration_ms: z.number().nullable(),
  meta: z.string().nullable(),
  created_at: z.string(),
});

const stagedFileRow = z.object({
  id: z.string(),
  stage_kind: z.enum(stageKinds),
  path: z.string(),
  original_filename: z.string(),
  bytes: z.number(),
  state: z.enum(stagedFileStates),
  created_at: z.string(),
});

export function insertOutput(db: DatabaseSync, output: Output): void {
  db.prepare(
    "INSERT INTO outputs (id, project_id, stage_kind, role, path, original_filename, bytes, duration_ms, meta, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(
    output.id,
    output.projectId,
    output.stageKind,
    output.role,
    output.path,
    output.originalFilename,
    output.bytes,
    output.durationMs,
    JSON.stringify(output.meta),
    output.createdAt,
  );
}

export function outputsOf(db: DatabaseSync, projectId: string): Output[] {
  return db
    .prepare("SELECT * FROM outputs WHERE project_id = ? ORDER BY rowid")
    .all(projectId)
    .map((row) => toOutput(outputRow.parse(row)));
}

export function insertStagedFile(db: DatabaseSync, file: StagedFile): void {
  db.prepare(
    "INSERT INTO staged_files (id, stage_kind, path, original_filename, bytes, state, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(
    file.id,
    file.stageKind,
    file.path,
    file.originalFilename,
    file.bytes,
    file.state,
    file.createdAt,
  );
}

export function markStagedFileCopied(db: DatabaseSync, id: string, bytes: number): void {
  db.prepare("UPDATE staged_files SET bytes = ?, state = 'staged' WHERE id = ?").run(bytes, id);
}

export function stagedFileById(db: DatabaseSync, id: string): StagedFile | undefined {
  const row = db.prepare("SELECT * FROM staged_files WHERE id = ?").get(id);
  return row === undefined ? undefined : toStagedFile(stagedFileRow.parse(row));
}

export function stagedFiles(db: DatabaseSync): StagedFile[] {
  return db
    .prepare("SELECT * FROM staged_files ORDER BY created_at, id")
    .all()
    .map((row) => toStagedFile(stagedFileRow.parse(row)));
}

export function deleteStagedFile(db: DatabaseSync, id: string): void {
  db.prepare("DELETE FROM staged_files WHERE id = ?").run(id);
}

export function projectTitle(db: DatabaseSync, projectId: string): string | undefined {
  const row = db.prepare("SELECT title FROM projects WHERE id = ?").get(projectId);
  if (row === undefined) {
    return undefined;
  }
  return z.object({ title: z.string() }).parse(row).title;
}

function toOutput(row: z.infer<typeof outputRow>): Output {
  return {
    id: row.id,
    projectId: row.project_id,
    stageKind: row.stage_kind,
    role: row.role,
    path: row.path,
    originalFilename: row.original_filename,
    bytes: row.bytes,
    durationMs: row.duration_ms,
    meta: toMeta(row.meta),
    createdAt: row.created_at,
  };
}

// A JSON column never reaches a caller as a string.
function toMeta(meta: string | null): OutputMeta {
  return meta === null ? {} : metaSchema.parse(JSON.parse(meta));
}

function toStagedFile(row: z.infer<typeof stagedFileRow>): StagedFile {
  return {
    id: row.id,
    stageKind: row.stage_kind,
    path: row.path,
    originalFilename: row.original_filename,
    bytes: row.bytes,
    state: row.state,
    createdAt: row.created_at,
  };
}
