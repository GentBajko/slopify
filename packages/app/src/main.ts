import { readdirSync, rmSync, unlinkSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { Clock } from "./kernel/clock.js";
import { systemClock } from "./kernel/clock.js";
import type { Config } from "./kernel/config/index.js";
import { openDb } from "./kernel/db/index.js";
import { migrate } from "./kernel/db/migrate.js";
import { acquireInstanceLock } from "./kernel/lock.js";
import { openLog } from "./kernel/log.js";
import type { Paths } from "./kernel/paths.js";
import { ensureDirs, layout } from "./kernel/paths.js";

export interface Boot {
  readonly paths: Paths;
  readonly stop: () => Promise<void>;
}

export interface Reconciled {
  readonly orphanFiles: number;
  readonly stagedFiles: number;
}

export async function boot(config: Config): Promise<Boot> {
  const clock: Clock = systemClock;
  const paths = layout(config.dataDir);
  ensureDirs(paths, { mode: 0o700 });
  const lock = acquireInstanceLock(paths.lock);
  try {
    const db = openDb(paths.db);
    migrate(db, clock);
    const interrupted = markInterruptedStages(db, clock);
    const reconciled = reconcileStorage(db, paths);
    const log = openLog(paths.logs, clock);
    log.write("info", "boot", {
      detail: `interrupted stages ${interrupted}, orphan files ${reconciled.orphanFiles}, staged files ${reconciled.stagedFiles}`,
    });
    return {
      paths,
      stop: async (): Promise<void> => {
        log.write("info", "shutdown");
        db.close();
        lock.release();
      },
    };
  } catch (error) {
    lock.release();
    throw error;
  }
}

// A stage can only be `running` at boot if the previous process died mid-run;
// nothing auto-resumes, the user retries by hand (logic/01 §Q7).
export function markInterruptedStages(db: DatabaseSync, clock: Clock): number {
  const result = db
    .prepare(
      "UPDATE stages SET state = 'failed', failure_reason = 'interrupted', finished_at = ? WHERE state = 'running'",
    )
    .run(clock.now().toISOString());
  return Number(result.changes);
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
