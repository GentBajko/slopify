import type { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import type { ServerType } from "@hono/node-server";
import { serve } from "@hono/node-server";
import ffmpegStatic from "ffmpeg-static";
import type { Hono } from "hono";
import { buildRegistry } from "./adapter-registry.js";
import { nodeRunCli } from "./adapters/llm/run-cli.js";
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
import type { Registry } from "./kernel/ports/registry.js";
import { sqliteAttempts } from "./kernel/runner/attempt-repo.js";
import type { Runner } from "./kernel/runner/index.js";
import { createRunner } from "./kernel/runner/index.js";
import type { ProviderDeps } from "./kernel/runner/providers.js";
import { stageProviders } from "./kernel/runner/providers.js";
import { readVersion } from "./kernel/version.js";
import { claimStage, finishStage, stagesOf } from "./slices/admission/repo.js";
import { runResearch } from "./slices/research/run.js";
import { nodeCliProbe } from "./slices/settings/cli-status.js";
import { reconcileStorage } from "./slices/storage/reconcile.js";
import { collectorEndpoint, httpPostEvents } from "./slices/telemetry/collector-client.js";
import type { Flusher } from "./slices/telemetry/flush.js";
import { createFlusher } from "./slices/telemetry/flush.js";
import type { TelemetryDeps } from "./slices/telemetry/record.js";
import { record } from "./slices/telemetry/record.js";
import { resolveFfmpeg } from "./slices/video/ffmpeg.js";
import { renderVideo } from "./slices/video/run.js";

// ceiling: a burst of finished stages coalesces into one delivery a second later, and the
// collector gets ten seconds to answer before the attempt is abandoned and the events
// stay queued.
const flushDelayMs = 1000;
const collectorTimeoutMs = 10_000;

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
    const version = readVersion();
    const telemetry: TelemetryDeps = { db, ids, clock, log, appVersion: version };
    const flusher = createFlusher(
      {
        db,
        clock,
        log,
        post: httpPostEvents(collectorEndpoint(process.env), collectorTimeoutMs),
      },
      flushDelayMs,
    );
    const registry = buildRegistry({
      db,
      fetch: globalThis.fetch,
      spawn: nodeRunCli,
      clock,
      probe: nodeCliProbe,
    });
    const runner = wire({ db, paths, clock, ids, log, hub, telemetry, flusher, registry });
    const app = createApp({
      db,
      paths,
      hub,
      runner,
      clock,
      ids,
      log,
      version,
      webDist: fileURLToPath(new URL("../dist/web", import.meta.url)),
      flushSoon: flusher.soon,
      probe: nodeCliProbe,
    });
    const server = await listen(app, config, log);
    // logic/16 step 5: whatever last run left queued goes out at start. Nothing waits for
    // it, and an unreachable collector costs one refused socket.
    flusher.soon();
    const open = db;
    return {
      paths,
      url: urlOf(config.host, portOf(server) ?? config.port),
      stop: async (): Promise<void> => {
        try {
          // The listener goes first. Aborting the runner while the socket still accepted
          // requests let a Play arriving during the await start a stage under a fresh
          // controller nobody had aborted, which abortAll would then have waited out.
          // Only once nothing new can arrive is the runner drained and the database shut.
          await close(server);
          await runner.abortAll();
        } finally {
          // The pending timer is cancelled rather than awaited: a shutdown must not wait
          // on the collector. A flush already in flight may land after the database
          // closes and fail to mark its batch delivered, which costs one re-send that
          // the collector deduplicates by event id (logic/16 §Q134).
          flusher.stop();
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
interface Wiring {
  readonly db: DatabaseSync;
  readonly paths: Paths;
  readonly clock: Clock;
  readonly ids: Ids;
  readonly log: Log;
  readonly hub: ReturnType<typeof createHub>;
  readonly telemetry: TelemetryDeps;
  readonly flusher: Flusher;
  readonly registry: Registry;
}

function wire({ db, paths, clock, ids, log, hub, telemetry, flusher, registry }: Wiring): Runner {
  // Resolved once at boot rather than per render, so a machine with no usable binary
  // fails at start with one message instead of on every project's last stage.
  const ffmpeg = resolveFfmpeg(process.env, ffmpegStatic);
  const video = { db, paths, ids, clock, log, ffmpeg };
  const research = { db, paths, ids, clock, log };
  // A stage slice is handed the wrapped calls, never the registry: every provider call
  // it makes is already inside the retry policy (kernel/runner/providers.ts).
  const providers: ProviderDeps = { registry, attempts: sqliteAttempts(db, ids), clock, log };
  return createRunner({
    stages: {
      stagesOf: (projectId) => stagesOf(db, projectId),
      claim: (stageId) => claimStage(db, stageId, clock.now().toISOString()),
      finish: (stageId, state, failureReason) =>
        finishStage(db, stageId, state, failureReason, clock.now().toISOString()),
    },
    // Only the stages that exist. A pending stage with no entry here fails loudly with
    // that sentence rather than waiting for a runner that will never call it.
    runs: {
      research: (context) => runResearch(research, context, stageProviders(providers, context)),
      video: (context) => renderVideo(video, context),
    },
    emit: (projectId, event) => {
      hub.emit(projectId, event);
      // logic/16 step 2: one event per stage that completes. The runner reports a stage
      // reaching `done` here already, so the count is taken off that report rather than
      // by handing the kernel a telemetry dependency it may not import.
      if (event.type === "stage.state" && event.state === "done") {
        record(telemetry, "stage.completed", { stage: event.stage });
        flusher.soon();
      }
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
