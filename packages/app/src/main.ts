import { readdirSync, rmSync, unlinkSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import type { ServerType } from "@hono/node-server";
import { serve } from "@hono/node-server";
import type { Hono } from "hono";
import { createHub } from "./edge/events/hub.js";
import { createApp } from "./edge/http/app.js";
import type { Clock } from "./kernel/clock.js";
import { systemClock } from "./kernel/clock.js";
import type { Config } from "./kernel/config/index.js";
import { openDb } from "./kernel/db/index.js";
import { migrate } from "./kernel/db/migrate.js";
import { ulidIds } from "./kernel/ids.js";
import { acquireInstanceLock } from "./kernel/lock.js";
import type { Log } from "./kernel/log.js";
import { openLog } from "./kernel/log.js";
import type { Paths } from "./kernel/paths.js";
import { ensureDirs, layout } from "./kernel/paths.js";
import { readVersion } from "./kernel/version.js";

export interface Boot {
  readonly paths: Paths;
  readonly url: string;
  readonly stop: () => Promise<void>;
}

export interface Reconciled {
  readonly orphanFiles: number;
  readonly stagedFiles: number;
}

export async function boot(config: Config): Promise<Boot> {
  const clock: Clock = systemClock;
  const ids = ulidIds;
  const paths = layout(config.dataDir);
  ensureDirs(paths, { mode: 0o700 });
  const lock = acquireInstanceLock(paths.lock);
  let db: DatabaseSync | undefined;
  try {
    db = openDb(paths.db);
    migrate(db, clock);
    const interrupted = markInterruptedStages(db, clock);
    const reconciled = reconcileStorage(db, paths);
    const log = openLog(paths.logs, clock);
    log.write("info", "boot", {
      detail: `interrupted stages ${interrupted}, orphan files ${reconciled.orphanFiles}, staged files ${reconciled.stagedFiles}`,
    });
    const hub = createHub({ ids, log });
    const app = createApp({
      hub,
      clock,
      ids,
      log,
      version: readVersion(),
      webDist: fileURLToPath(new URL("../dist/web", import.meta.url)),
    });
    const server = await listen(app, config, log);
    const open = db;
    return {
      paths,
      url: urlOf(config.host, portOf(server) ?? config.port),
      stop: async (): Promise<void> => {
        try {
          await close(server);
        } finally {
          log.write("info", "shutdown");
          open.close();
          lock.release();
        }
      },
    };
  } catch (error) {
    db?.close();
    lock.release();
    throw error;
  }
}

function listen(app: Hono, config: Config, log: Log): Promise<ServerType> {
  return new Promise<ServerType>((resolve, reject) => {
    const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, () => {
      server.off("error", reject);
      server.on("error", (error: Error) => {
        log.write("error", "http.server", { detail: error.message });
      });
      resolve(server);
    });
    server.once("error", reject);
  });
}

function close(server: ServerType): Promise<void> {
  // An SSE response never ends by itself, and close() waits for every open connection,
  // so a shutdown that only called close() would hang for as long as a page is open.
  if ("closeAllConnections" in server) {
    server.closeAllConnections();
  }
  return new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error === undefined || error === null) {
        resolve();
        return;
      }
      reject(error);
    });
  });
}

function portOf(server: ServerType): number | undefined {
  const address = server.address();
  return address === null || typeof address === "string" ? undefined : address.port;
}

export function urlOf(host: string, port: number): string {
  // An IPv6 literal has to be bracketed before it is a URL authority.
  return `http://${host.includes(":") ? `[${host}]` : host}:${port}`;
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
