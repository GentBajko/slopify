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
