import type { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import type { ServerType } from "@hono/node-server";
import { serve } from "@hono/node-server";
import ffmpegStatic from "ffmpeg-static";
import type { Hono } from "hono";
import { createHub } from "./edge/events/hub.js";
import { createApp } from "./edge/http/app.js";
import type { Clock } from "./kernel/clock.js";
import { systemClock } from "./kernel/clock.js";
import type { Config } from "./kernel/config/index.js";
import { openDb } from "./kernel/db/index.js";
import { migrate } from "./kernel/db/migrate.js";
import type { Ids } from "./kernel/ids.js";
import { ulidIds } from "./kernel/ids.js";
import { acquireInstanceLock } from "./kernel/lock.js";
import type { Log } from "./kernel/log.js";
import { openLog } from "./kernel/log.js";
import type { Paths } from "./kernel/paths.js";
import { ensureDirs, layout } from "./kernel/paths.js";
import type { Runner } from "./kernel/runner/index.js";
import { createRunner } from "./kernel/runner/index.js";
import { readVersion } from "./kernel/version.js";
import { claimStage, finishStage, stagesOf } from "./slices/admission/repo.js";
import { reconcileStorage } from "./slices/storage/reconcile.js";
import { resolveFfmpeg } from "./slices/video/ffmpeg.js";
import { renderVideo } from "./slices/video/run.js";

export interface Boot {
  readonly paths: Paths;
  readonly url: string;
  readonly stop: () => Promise<void>;
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
    const runner = wire(db, paths, clock, ids, log, hub);
    const app = createApp({
      db,
      paths,
      hub,
      runner,
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
          // Before the socket, so a stage cannot be writing to a database that is about
          // to close; the render's child process is killed by the same abort.
          await runner.abortAll();
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

// The composition root: the runner is handed the stage implementations it may not
// import, and each implementation is handed the dependencies it needs, closed over here
// (03-conventions Dependency injection).
function wire(
  db: DatabaseSync,
  paths: Paths,
  clock: Clock,
  ids: Ids,
  log: Log,
  hub: ReturnType<typeof createHub>,
): Runner {
  // Resolved once at boot rather than per render, so a machine with no usable binary
  // fails at start with one message instead of on every project's last stage.
  const ffmpeg = resolveFfmpeg(process.env, ffmpegStatic);
  const video = { db, paths, ids, clock, log, ffmpeg };
  return createRunner({
    stages: {
      stagesOf: (projectId) => stagesOf(db, projectId),
      claim: (stageId) => claimStage(db, stageId, clock.now().toISOString()),
      finish: (stageId, state, failureReason) =>
        finishStage(db, stageId, state, failureReason, clock.now().toISOString()),
    },
    // Only the stages that exist. A pending stage with no entry here fails loudly with
    // that sentence rather than waiting for a runner that will never call it.
    runs: { video: (context) => renderVideo(video, context) },
    emit: (projectId, event) => {
      hub.emit(projectId, event);
    },
    emitRunningCount: (count) => {
      hub.emitGlobal({ type: "running.count", count });
    },
    log,
  });
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
