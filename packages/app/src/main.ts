import { randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import type { ServerType } from "@hono/node-server";
import { serve } from "@hono/node-server";
import ffmpegStatic from "ffmpeg-static";
import type { Hono } from "hono";
import { buildRegistry } from "./adapter-registry.js";
import { alignSubtitles } from "./adapters/alignment/index.js";
import { prepareFfmpeg } from "./adapters/ffmpeg.js";
import { createHostCliClient } from "./adapters/host-cli/index.js";
import { nodeRunCli } from "./adapters/llm/run-cli.js";
import { curateRegistry } from "./catalog/registry.js";
import { type CatalogueStore, createCatalogueStore } from "./catalog/store.js";
import {
  dockerActivationCommitted,
  dockerFolderConfiguration,
} from "./edge/docker-projects/activation.js";
import { createHub } from "./edge/events/hub.js";
import { currentProjectEvent } from "./edge/events/visibility.js";
import { createApp } from "./edge/http/app.js";
import { createMutationLifecycle, drainMutationsWithDeadline } from "./edge/http/mutations.js";
import { openFolder } from "./edge/open-folder.js";
import type { AudioPreviewStore } from "./kernel/audio-preview.js";
import { createAudioPreviewStore } from "./kernel/audio-preview.js";
import type { Clock } from "./kernel/clock.js";
import { systemClock } from "./kernel/clock.js";
import type { Config } from "./kernel/config/index.js";
import { openDb } from "./kernel/db/index.js";
import { migrate } from "./kernel/db/migrate.js";
import { transact } from "./kernel/db/tx.js";
import type { Ids } from "./kernel/ids.js";
import { ulidIds } from "./kernel/ids.js";
import { acquireInstanceLock } from "./kernel/lock.js";
import type { Log } from "./kernel/log.js";
import { openLog } from "./kernel/log.js";
import type { Paths } from "./kernel/paths.js";
import { ensureDirs, layout } from "./kernel/paths.js";
import type { Registry } from "./kernel/ports/registry.js";
import { sqliteAttempts } from "./kernel/runner/attempt-repo.js";
import {
  type CheckpointAuthority,
  createCheckpointAuthority,
} from "./kernel/runner/checkpoint-authority.js";
import type { Runner } from "./kernel/runner/index.js";
import { createRunner } from "./kernel/runner/index.js";
import type { ProviderDeps } from "./kernel/runner/providers.js";
import { stageProviders } from "./kernel/runner/providers.js";
import { createProviderQueue } from "./kernel/runner/queue.js";
import { readVersion } from "./kernel/version.js";
import { modelSources } from "./model-catalog.js";
import { projectPaused } from "./slices/admission/repo.js";
import { pumpQueue, queueWaiting } from "./slices/batch/index.js";
import { approveCheckpoint, type CheckpointRow } from "./slices/checkpoints/index.js";
import {
  checkpointDecisionForWork,
  recoverCheckpointWork,
  settleReleasedCheckpoints,
} from "./slices/checkpoints/recovery.js";
import { resolveFont } from "./slices/fonts/index.js";
import type { DraftStartDeps } from "./slices/play-drafts/model.js";
import { templateById } from "./slices/project-templates/repo.js";
import { claimWork, finishWork, maySubmit } from "./slices/rebuild/repo.js";
import { materializeAdmittedWork } from "./slices/rebuild/runtime-materialize.js";
import { runRevisionInvocation } from "./slices/rebuild/runtime-run.js";
import {
  executionStages,
  executionStandings,
  invocationReady,
  projectStandings,
  recordWorkProgress,
} from "./slices/rebuild/runtime-store.js";
import type { RebuildDeps } from "./slices/rebuild/service.js";
import type { ScheduleDeps } from "./slices/schedules/model.js";
import { settleTerminalScheduleRuns } from "./slices/schedules/repo.js";
import { createScheduleRunner } from "./slices/schedules/scheduler.js";
import { nodeCliProbe } from "./slices/settings/cli-status.js";
import { isLocalCliProvider } from "./slices/settings/model.js";
import { providerStatuses } from "./slices/settings/readiness.js";
import { reconcileStorage } from "./slices/storage/reconcile.js";
import { collectorEndpoint, httpPostEvents } from "./slices/telemetry/collector-client.js";
import type { Flusher } from "./slices/telemetry/flush.js";
import { createFlusher } from "./slices/telemetry/flush.js";
import type { RecordEvent } from "./slices/telemetry/model.js";
import type { TelemetryDeps } from "./slices/telemetry/record.js";
import { record } from "./slices/telemetry/record.js";
import { probeDurationMs } from "./slices/video/ffmpeg.js";

import { watchActivation } from "./updater/candidate.js";
import { launchUpdate } from "./updater/install.js";
import { isUpdateToken } from "./updater/model.js";
import { npmCommand, updateCommitted } from "./updater/plan.js";
import { publishedVersion } from "./updater/registry.js";
import { createUpdater } from "./updater/service.js";

// ceiling: a burst of finished stages coalesces into one delivery a second later, and the
// collector gets ten seconds to answer before the attempt is abandoned and the events
// stay queued.
const flushDelayMs = 1000;
const collectorTimeoutMs = 10_000;
const mutationDrainTimeoutMs = 5_000;

export interface Boot {
  readonly paths: Paths;
  readonly url: string;
  readonly stop: () => Promise<void>;
}

export interface ScheduleTickLifecycle {
  readonly tick: () => Promise<void>;
  readonly stop: () => Promise<void>;
}

export function createScheduleTickLifecycle(deps: {
  readonly beginMutation: () => (() => void) | undefined;
  readonly tick: () => Promise<void>;
  readonly report: () => void;
}): ScheduleTickLifecycle {
  let stopping = false;
  let inflight: Promise<void> | undefined;
  const tick = (): Promise<void> => {
    if (stopping) return Promise.resolve();
    if (inflight !== undefined) return inflight;
    const release = deps.beginMutation();
    if (release === undefined) return Promise.resolve();
    const running = (async () => {
      try {
        await deps.tick();
      } catch {
        try {
          deps.report();
        } catch {
          // A logging failure must not turn a timer callback into an unhandled rejection.
        }
      } finally {
        release();
      }
    })();
    inflight = running;
    void running.then(
      () => {
        if (inflight === running) inflight = undefined;
      },
      () => {
        if (inflight === running) inflight = undefined;
      },
    );
    return running;
  };
  return {
    tick,
    stop: () => {
      stopping = true;
      return inflight ?? Promise.resolve();
    },
  };
}

export async function boot(config: Config): Promise<Boot> {
  const clock: Clock = systemClock;
  const ids = ulidIds;
  const paths = layout(config.dataDir);
  const dockerState = process.env.SLOPIFY_DOCKER_INSTALL_STATE;
  if (
    dockerState !== undefined &&
    (process.env.SLOPIFY_CONTAINER !== "1" ||
      dockerState !== "/opt/slopify-install/activation.json")
  )
    throw new Error("Invalid managed Docker activation configuration.");
  const candidateToken = process.env.SLOPIFY_UPDATE_TOKEN ?? "";
  const pendingActivation =
    isUpdateToken(candidateToken) && process.env.SLOPIFY_UPDATE_PENDING === "1";
  ensureDirs(paths, { mode: 0o700 });
  const lock = acquireInstanceLock(paths.lock);
  let db: DatabaseSync | undefined;
  try {
    const ffmpeg = await prepareFfmpeg({
      dataDir: paths.dataDir,
      env: process.env,
      bundled: ffmpegStatic,
      report: (message) => console.warn(message),
    });
    db = openDb(paths.db);
    migrate(db, clock);
    const runtimeDb = db;
    const interrupted = markInterruptedStages(db, clock);
    recoverCheckpointWork(db);
    const settledSchedules = settleTerminalScheduleRuns(db, clock.now().toISOString());
    // The updater can restore the database after a failed candidate boot, but it cannot
    // restore files deleted by reconciliation. Leave the filesystem untouched until the
    // candidate's committed activation pointer has been verified.
    const reconciled = pendingActivation ? undefined : reconcileStorage(db, paths);
    const log = openLog(paths.logs, clock);
    log.write("info", "boot", {
      detail:
        reconciled === undefined
          ? `interrupted stages ${interrupted}, settled schedules ${settledSchedules}, storage reconciliation deferred during update activation`
          : `interrupted stages ${interrupted}, settled schedules ${settledSchedules}, orphan files ${reconciled.orphanFiles}, staged files ${reconciled.stagedFiles}`,
    });
    const eventDb = db;
    const hub = createHub({
      ids,
      log,
      acceptEvent: (event) => currentProjectEvent(eventDb, event),
    });
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
    const catalogue = createCatalogueStore({ dataDir: paths.dataDir, fetch: globalThis.fetch });
    const hostCli =
      process.env.SLOPIFY_CONTAINER === "1" || process.env.SLOPIFY_HOST_CLI_DIR
        ? createHostCliClient({ directory: process.env.SLOPIFY_HOST_CLI_DIR })
        : undefined;
    const registry = curateRegistry(
      buildRegistry({
        db,
        fetch: globalThis.fetch,
        spawn: nodeRunCli,
        clock,
        probe: nodeCliProbe,
        hostCli,
      }),
      catalogue,
    );
    const audioPreviews = createAudioPreviewStore();
    const runner = wireRunner({
      db,
      paths,
      clock,
      ids,
      log,
      hub,
      telemetry,
      flusher,
      registry,
      catalogue,
      ffmpeg,
      audioPreviews,
    });
    const updateDb = db;
    const oldEntry = fileURLToPath(new URL("./edge/cli.js", import.meta.url));
    const workerEntry = fileURLToPath(new URL("./edge/update-worker.js", import.meta.url));
    let npm: Awaited<ReturnType<typeof npmCommand>> | undefined;
    try {
      npm = await npmCommand();
    } catch {
      log.write("warn", "update", {
        detail: "npm is unavailable; in-app installation is disabled.",
      });
    }
    let shutdown = async (): Promise<void> => {
      throw new Error("The server is not ready.");
    };
    let listeningPort = config.port;
    const updater = createUpdater({
      ...(isUpdateToken(candidateToken)
        ? {
            candidate: {
              token: candidateToken,
              pending: pendingActivation,
              committed: () =>
                dockerState === undefined
                  ? updateCommitted(paths.dataDir, version, candidateToken)
                  : dockerActivationCommitted(dockerState, candidateToken),
              settle: () => {
                try {
                  const settled = reconcileStorage(updateDb, paths);
                  log.write("info", "update", {
                    detail: `activation storage reconciliation removed ${settled.orphanFiles} orphan files and ${settled.stagedFiles} staged files`,
                  });
                } catch {
                  // The pointer is already committed, so storage maintenance can no longer
                  // safely reject or roll back this candidate. A normal restart retries it.
                  log.write("error", "update", {
                    detail: "Storage reconciliation failed after update activation.",
                  });
                }
              },
            },
          }
        : {}),
      currentVersion: version,
      previousUpdateFailed: process.env.SLOPIFY_UPDATE_FAILED === "1",
      now: () => Date.now(),
      latest: () =>
        process.env.SLOPIFY_DISABLE_UPDATES === "1"
          ? Promise.resolve(version)
          : publishedVersion(globalThis.fetch),
      unsupported: () =>
        process.env.SLOPIFY_DISABLE_UPDATES === "1"
          ? "This container is updated by pulling a new image and recreating it."
          : !existsSync(oldEntry) || !existsSync(workerEntry)
            ? "Run Slopify from its installed package to use in-app updates."
            : npm === undefined
              ? "npm is unavailable. Install Node.js with npm to use in-app updates."
              : undefined,
      busy: () =>
        updateDb.prepare("SELECT 1 FROM stages WHERE state = 'running' LIMIT 1").get() !==
          undefined ||
        updateDb
          .prepare("SELECT id FROM projects")
          .all()
          .some((row) => typeof row.id === "string" && runner.hasInflight?.(row.id) === true),
      report: (message) => log.write("warn", "update", { detail: message }),
      install: async (next, restarting) => {
        if (npm === undefined) throw new Error("npm is unavailable.");
        await launchUpdate(
          workerEntry,
          {
            version: next,
            token: randomBytes(32).toString("hex"),
            previousVersion: version,
            oldEntry,
            dataDir: paths.dataDir,
            cwd: process.cwd(),
            host: config.host,
            port: listeningPort,
            npm: { file: npm.file, args: [...npm.args] },
          },
          async () => {
            restarting();
            await shutdown();
          },
        );
      },
    });
    const rebuild: RebuildDeps = {
      db,
      paths,
      ids,
      clock,
      log,
      runner,
      catalogue,
      measureAudio: (path, signal) =>
        probeDurationMs(ffmpeg, path, signal ?? AbortSignal.timeout(30_000), log),
      providers: () =>
        providerStatuses({ db: updateDb, probe: nodeCliProbe, hostCliStatus: hostCli?.status }),
      modelsFor: modelSources(registry).modelsFor,
      emit: (projectId, event) => hub.emit(projectId, event),
    };
    const draftDeps: DraftStartDeps = {
      db,
      paths,
      ids,
      clock,
      log,
      runner,
      catalogue,
      uuid: randomUUID,
      resolveFont: (fontId) => resolveFont(paths, fontId),
      providers: rebuild.providers,
      modelsFor: rebuild.modelsFor,
      emit: (event) => hub.emitGlobal(event),
      recordStarted: (projectIds) => {
        for (const _projectId of projectIds) record(telemetry, "project.created", {});
        flusher.soon();
      },
    };
    const scheduleDeps: ScheduleDeps = {
      ...draftDeps,
      template: (id, templateVersion) => templateById(runtimeDb, id, templateVersion),
    };
    const scheduleRunner = createScheduleRunner(scheduleDeps);
    scheduleRunner.recover(clock.now());
    const scheduleTicks = createScheduleTickLifecycle({
      beginMutation: updater.beginMutation,
      tick: scheduleRunner.tick,
      report: () =>
        log.write("error", "schedule.tick", {
          detail: "Scheduled jobs could not be advanced.",
        }),
    });
    const mutations = createMutationLifecycle();
    const app = createApp({
      rebuild,
      drafts: draftDeps,
      schedules: scheduleDeps,
      ...(rebuild.measureAudio === undefined ? {} : { measureAudio: rebuild.measureAudio }),
      openFolder,
      folderLocation: await dockerFolderConfiguration(process.env, paths.projects),
      ...(dockerState === undefined ? {} : { installationPending: () => updater.locked() }),
      db,
      paths,
      hub,
      runner,
      updater,
      mutations,
      audioPreviews,
      ...modelSources(registry),
      catalogue,
      clock,
      ids,
      log,
      version,
      webDist: fileURLToPath(new URL("../dist/web", import.meta.url)),
      flushSoon: flusher.soon,
      probe: nodeCliProbe,
      hostCliStatus: hostCli?.status,
    });
    const server = await listen(app, config, log);
    const queueTimer = setInterval(() => {
      const release = updater.beginMutation();
      if (!release) return;
      try {
        pumpQueue(updateDb, runner);
      } catch {
        log.write("error", "batch.queue", { detail: "The batch queue could not advance." });
      } finally {
        release();
      }
    }, 1000);
    const scheduleTimer = setInterval(() => {
      void scheduleTicks.tick();
    }, 15_000);
    void scheduleTicks.tick();
    listeningPort = portOf(server) ?? config.port;
    // Whatever last run left queued goes out at start. Nothing waits for
    // it, and an unreachable collector costs one refused socket.
    flusher.soon();
    const open = db;
    let stopping: Promise<void> | undefined;
    let stopActivation = (): void => {};
    shutdown = (): Promise<void> => {
      stopping ??= (async () => {
        clearInterval(queueTimer);
        clearInterval(scheduleTimer);
        const mutationDrain = mutations.stop();
        const scheduleDrain = scheduleTicks.stop();
        const serverClose = beginServerClose(server);
        stopActivation();
        audioPreviews.close();
        try {
          // Admission closes before the listener. Requests already admitted keep the
          // database until their response settles; anything racing shutdown receives 503.
          await drainMutationsWithDeadline(
            mutationDrain,
            serverClose.terminate,
            mutationDrainTimeoutMs,
          );
          await scheduleDrain;
          await runner.abortAll();
        } finally {
          serverClose.terminate();
          try {
            await serverClose.closed;
          } finally {
            // The pending timer is cancelled rather than awaited: a shutdown must not wait
            // on the collector. A flush already in flight may land after the database
            // closes and fail to mark its batch delivered, which costs one re-send that
            // the collector deduplicates by event id.
            flusher.stop();
            log.write("info", "shutdown");
            open.close();
            lock.release();
          }
        }
      })();
      return stopping;
    };
    if (pendingActivation)
      stopActivation = watchActivation(updater, candidateToken, shutdown, (message) =>
        log.write("warn", "update", { detail: message }),
      );
    return { paths, url: urlOf(config.host, listeningPort), stop: shutdown };
  } catch (error) {
    db?.close();
    lock.release();
    throw error;
  }
}

// The composition root: the runner is handed the stage implementations it may not import, and
// each implementation is handed the dependencies it needs, closed over here.
interface Wiring {
  readonly audioPreviews: AudioPreviewStore;
  readonly ffmpeg: string;
  readonly db: DatabaseSync;
  readonly paths: Paths;
  readonly clock: Clock;
  readonly ids: Ids;
  readonly log: Log;
  readonly hub: ReturnType<typeof createHub>;
  readonly telemetry: TelemetryDeps;
  readonly flusher: Flusher;
  readonly registry: Registry;
  readonly catalogue: CatalogueStore;
}

export function wireRunner({
  audioPreviews,
  db,
  paths,
  clock,
  ids,
  log,
  hub,
  telemetry,
  flusher,
  registry,
  catalogue,
  ffmpeg,
}: Wiring): Runner & { readonly checkpoints: CheckpointAuthority<CheckpointRow> } {
  // A stage counts what it did and the queue is flushed after each new event. `record`
  // swallows its own failures, so this can neither fail a stage nor widen what leaves the
  // machine - the payload allow-list is checked inside it.
  const count: RecordEvent = (type, counters) => {
    record(telemetry, type, counters);
    flusher.soon();
  };
  const execution = { db, paths, ids, clock, log, ffmpeg, alignSubtitles, audioPreviews, count };
  // A stage slice is handed the wrapped calls, never the registry: every provider call
  // it makes is already inside the retry policy (kernel/runner/providers.ts).
  const providers: ProviderDeps = {
    registry,
    attempts: sqliteAttempts(db, ids),
    clock,
    log,
    queue: createProviderQueue((provider) =>
      isLocalCliProvider(provider) ? 3 : (catalogue.read().providers[provider]?.maxConcurrent ?? 1),
    ),
  };
  const checkpoints = createCheckpointAuthority<CheckpointRow>({
    decide: (work) => checkpointDecisionForWork(execution, work),
    approve: (projectId, checkpointId, identity) =>
      approveCheckpoint(db, {
        ...identity,
        projectId,
        checkpointId,
        approvedAt: clock.now().toISOString(),
      }),
    inTransaction: () => db.isTransaction,
    wake: (projectId) => runner.tick(projectId),
    log,
  });
  const runner = createRunner({
    checkpoints,
    stages: {
      stagesOf: (projectId) => {
        materializeAdmittedWork(execution, projectId);
        projectStandings(execution, projectId);
        return executionStages(execution, projectId);
      },
      standingsOf: (projectId) => executionStandings(execution, projectId),
      ready: (work) => invocationReady(execution, work),
      paused: (projectId) => projectPaused(db, projectId) || queueWaiting(db, projectId),
      claim: (work) => {
        const claimed = claimWork(db, work);
        projectStandings(execution, work.projectId);
        return claimed;
      },
      maySubmit: (work, pieceId) => maySubmit(db, work, pieceId),
      finish: (work, state, reason) => {
        transact(db, () => {
          finishWork(db, work, state, reason);
          materializeAdmittedWork(execution, work.projectId);
          projectStandings(execution, work.projectId);
          settleReleasedCheckpoints(execution, work.projectId);
        });
      },
    },
    runs: Object.fromEntries(
      ["research", "article", "audio", "images", "thumbnail", "video"].map((kind) => [
        kind,
        (context: import("./kernel/runner/index.js").StageContext) =>
          runRevisionInvocation(execution, context, stageProviders(providers, context)),
      ]),
    ),
    // Counting is finer than a stage reaching `done` - each intro and outro text, each
    // narrated segment - and the counters are provider names, token usage and durations
    // only the stage slice ever sees. Each slice records its own units through `count`
    // above, and the runner counts nothing: the kernel may not import a slice.
    emit: (projectId, event) => {
      if (event.type === "stage.progress") recordWorkProgress(execution, event);
      hub.emit(projectId, event);
    },
    emitRunningCount: (running) => {
      hub.emitGlobal({ type: "running.count", count: running });
    },
    log,
  });
  return { ...runner, checkpoints };
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

function beginServerClose(server: ServerType): {
  readonly closed: Promise<void>;
  readonly terminate: () => void;
} {
  // An SSE response never ends by itself, and close() waits for every open connection,
  // so admitted mutations drain first and then the remaining sockets are terminated.
  const closed = new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error === undefined || error === null) {
        resolve();
        return;
      }
      reject(error);
    });
  });
  return {
    closed,
    terminate: () => {
      if ("closeAllConnections" in server) server.closeAllConnections();
    },
  };
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
// nothing auto-resumes, the user retries by hand.
export function markInterruptedStages(db: DatabaseSync, clock: Clock): number {
  const result = db
    .prepare(
      "UPDATE stages SET state = CASE WHEN EXISTS (SELECT 1 FROM project_controls WHERE project_id = stages.project_id AND paused = 1) THEN 'pending' ELSE 'failed' END, failure_reason = CASE WHEN EXISTS (SELECT 1 FROM project_controls WHERE project_id = stages.project_id AND paused = 1) THEN NULL ELSE 'interrupted' END, finished_at = CASE WHEN EXISTS (SELECT 1 FROM project_controls WHERE project_id = stages.project_id AND paused = 1) THEN NULL ELSE ? END WHERE state = 'running'",
    )
    .run(clock.now().toISOString());
  return Number(result.changes);
}
