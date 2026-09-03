import { readdirSync, rmSync, unlinkSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { Paths } from "../../kernel/paths.js";

export interface Reconciled {
  readonly orphanFiles: number;
  readonly stagedFiles: number;
}

// Files the database does not know about, and staged uploads that never reached a
// project, are removed at start (logic/05 §Q44, logic/14 step 5).
export function reconcileStorage(db: DatabaseSync, paths: Paths): Reconciled {
  const projects = idsOf(db, "SELECT id FROM projects", "id");
  const kept = new Set<string>();
  for (const row of db.prepare("SELECT project_id, path FROM outputs").all()) {
    const projectId = row.project_id;
    const path = row.path;
    if (typeof projectId === "string" && typeof path === "string") {
      kept.add(`${projectId}/${slashed(path)}`);
    }
  }

  // A stage's unfinished work is on the project too: `logic/08` §Q66 keeps the audio
  // chunks a previous run finished so a manual retry re-runs only the failed ones, and
  // `logic/13` step 2 keeps them through a cancel. A chunk is not an output - the
  // concatenated body is the project's only body audio (§Q65) - so the file it wrote is
  // named by its `stage_pieces` payload instead, and that is as much of a record as an
  // outputs row.
  for (const row of db
    .prepare(
      "SELECT stages.project_id AS project_id, stage_pieces.payload AS payload FROM stage_pieces JOIN stages ON stages.id = stage_pieces.stage_id WHERE stage_pieces.payload IS NOT NULL",
    )
    .all()) {
    const projectId = row.project_id;
    const file = pieceFile(row.payload);
    if (typeof projectId === "string" && file !== undefined) {
      kept.add(`${projectId}/${slashed(file)}`);
    }
  }

  let orphanFiles = 0;
  for (const entry of readdirSync(paths.projects, { withFileTypes: true })) {
    const path = join(paths.projects, entry.name);
    if (!entry.isDirectory()) {
      unlinkSync(path);
      orphanFiles += 1;
      continue;
    }
    if (!projects.has(entry.name)) {
      orphanFiles += filesUnder(path).length;
      rmSync(path, { recursive: true, force: true });
      continue;
    }
    for (const file of filesUnder(path)) {
      if (kept.has(`${entry.name}/${slashed(file)}`)) {
        continue;
      }
      unlinkSync(join(path, file));
      orphanFiles += 1;
    }
  }

  let stagedFiles = 0;
  for (const file of filesUnder(paths.staging)) {
    unlinkSync(join(paths.staging, file));
    stagedFiles += 1;
  }
  db.exec("DELETE FROM staged_files");

  return { orphanFiles, stagedFiles };
}

// The one field read inside a payload whose shape belongs to the stage that wrote it: a
// project-relative path the piece left on disk. A payload without one is any other kind
// of piece and names no file. Exported because a re-run drops the same pieces the boot
// sweep keeps, and the two have to agree on which file a piece is holding.
export function pieceFile(payload: unknown): string | undefined {
  if (typeof payload !== "string") {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null || !("file" in parsed)) {
    return undefined;
  }
  const file: unknown = parsed.file;
  return typeof file === "string" && file !== "" ? file : undefined;
}

function idsOf(db: DatabaseSync, sql: string, column: string): Set<string> {
  const ids = new Set<string>();
  for (const row of db.prepare(sql).all()) {
    const id = row[column];
    if (typeof id === "string") {
      ids.add(id);
    }
  }
  return ids;
}

function filesUnder(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) {
      files.push(relative(root, join(entry.parentPath, entry.name)));
    }
  }
  return files;
}

// outputs.path is stored with forward slashes; the filesystem may hand back backslashes.
function slashed(path: string): string {
  return path.split(sep).join("/");
}
