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
import { prefetchModel } from "./adapters/alignment/prefetch.js";
import { prepareFfmpeg } from "./adapters/ffmpeg.js";
import { createHostCliClient } from "./adapters/host-cli/index.js";
import { nodeRunCli } from "./adapters/llm/run-cli.js";
import { curateRegistry } from "./catalog/registry.js";
import { type CatalogueStore, createCatalogueStore } from "./catalog/store.js";
import { createAutostart } from "./edge/autostart/index.js";
import type { AutostartService } from "./edge/autostart/service.js";
import {
  dockerActivationCommitted,
  dockerFilesLayout,
  dockerFolderConfiguration,
} from "./edge/docker-install/activation.js";
import { createHub, observedHub } from "./edge/events/hub.js";
import { currentProjectEvent } from "./edge/events/visibility.js";
import { createApp } from "./edge/http/app.js";
import { createMutationLifecycle, drainMutationsWithDeadline } from "./edge/http/mutations.js";
import { limitRequestTimes } from "./edge/http/timeouts.js";
import { openFolder } from "./edge/open-folder.js";
import { readHostLogin } from "./host-cli/status.js";
import type { AudioPreviewStore } from "./kernel/audio-preview.js";
import { createAudioPreviewStore } from "./kernel/audio-preview.js";
import type { Clock } from "./kernel/clock.js";
import { systemClock } from "./kernel/clock.js";
import type { Config } from "./kernel/config/index.js";
import { openDb } from "./kernel/db/index.js";
import { migrate } from "./kernel/db/migrate.js";
import { transact } from "./kernel/db/tx.js";
import { causedBy } from "./kernel/errors.js";
import type { Ids } from "./kernel/ids.js";
import { ulidIds } from "./kernel/ids.js";
import { acquireInstanceLock } from "./kernel/lock.js";
import type { Log } from "./kernel/log.js";
import { openLog } from "./kernel/log.js";
import type { Paths } from "./kernel/paths.js";
import { ensureDataDirs, ensureDirs, layout, repoint, subtitleModelDir } from "./kernel/paths.js";
import { stageKinds } from "./kernel/pipeline.js";
import type { Registry } from "./kernel/ports/registry.js";
import type { SubtitleAligner } from "./kernel/ports/subtitles.js";
import { sqliteAttempts } from "./kernel/runner/attempt-repo.js";
import { auditionVoice } from "./kernel/runner/audition.js";
import {
  type CheckpointAuthority,
  createCheckpointAuthority,
} from "./kernel/runner/checkpoint-authority.js";
import type { Runner } from "./kernel/runner/index.js";
import { createRunner } from "./kernel/runner/index.js";
import type { ProviderDeps } from "./kernel/runner/providers.js";
import { stageProviders } from "./kernel/runner/providers.js";
import { createProviderQueue } from "./kernel/runner/queue.js";
import { type StandaloneDeps, standaloneImage, standaloneLlm } from "./kernel/runner/standalone.js";
import type { WorkRef } from "./kernel/runner/work.js";
import { readVersion } from "./kernel/version.js";
import { modelSources } from "./model-catalog.js";
import { projectById, projectPaused, projectTrashed } from "./slices/admission/repo.js";
import { createBackupService } from "./slices/backups/service.js";
import { pumpQueue, queueWaiting } from "./slices/batch/index.js";
import { settleInterruptedCastImages } from "./slices/channels/cast-images.js";
import { approveCheckpoint, type CheckpointRow } from "./slices/checkpoints/index.js";
import {
  checkpointDecisionForWork,
  recoverCheckpointWork,
  settleReleasedCheckpoints,
} from "./slices/checkpoints/recovery.js";
import {
  createEpisodeMemoryWatcher,
  type EpisodeMemoryWatcher,
} from "./slices/episodes/summarize.js";
import { resolveFont } from "./slices/fonts/index.js";
import { decodePeaks } from "./slices/narration/peaks.js";
import { createRunNotifier } from "./slices/notifications/notifier.js";
import { createNotificationSender } from "./slices/notifications/send.js";
import { readNotificationUrl } from "./slices/notifications/settings.js";
import { seedSamples } from "./slices/onboarding/sample.js";
import type { DraftStartDeps } from "./slices/play-drafts/model.js";
import { templateById } from "./slices/project-templates/repo.js";
import { recoverProject } from "./slices/rebuild/recovery.js";
import { claimWork, finishWork, maySubmit } from "./slices/rebuild/repo.js";
import { waitToRetry, wakeRetries } from "./slices/rebuild/retry.js";
import { createReviewRedos, reviewHold } from "./slices/rebuild/review-redo.js";
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
import { currentRevisionId } from "./slices/revisions/repo.js";
import { createLimitGate, resumeAfterRestart } from "./slices/run-cost/limits.js";
import { createStandaloneMeter, createUsageMeter } from "./slices/run-cost/meter.js";
import type { ScheduleDeps } from "./slices/schedules/model.js";
import { settleTerminalScheduleRuns } from "./slices/schedules/repo.js";
import { createScheduleRunner } from "./slices/schedules/scheduler.js";
import { nodeCliProbe } from "./slices/settings/cli-status.js";
import { isLocalCliProvider, localCliConcurrency } from "./slices/settings/model.js";
import { providerStatuses } from "./slices/settings/readiness.js";
import { busyProjects } from "./slices/storage/backup-export.js";
import { documentsDir, nodeDocumentsHost } from "./slices/storage/documents.js";
import {
  createFilesService,
  ensureFilesFolders,
  filesLayoutOf,
  settleFilesLocation,
} from "./slices/storage/files-location.js";
import { reconcileStorage } from "./slices/storage/reconcile.js";
import { previewPictures } from "./slices/style-preview/images.js";
import { ffmpegStylePreview } from "./slices/style-preview/render.js";
import { createStylePreviews, stylePreviewDir } from "./slices/style-preview/service.js";
import { collectorEndpoint, httpPostEvents } from "./slices/telemetry/collector-client.js";
import type { Flusher } from "./slices/telemetry/flush.js";
import { createFlusher } from "./slices/telemetry/flush.js";
import type { RecordEvent } from "./slices/telemetry/model.js";
import type { TelemetryDeps } from "./slices/telemetry/record.js";
import { record } from "./slices/telemetry/record.js";
import { createTrashPurge } from "./slices/trash/service.js";
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
  // Settings → General's "Start Slopify when I log in", for the terminal's question.
  readonly autostart: AutostartService;
}

export interface BootOptions {
  // Keep an existing "Start Slopify when I log in" entry pointing at this Node and version.
  // The CLI turns it on; tests never touch the login entries of the machine they run on.
  readonly refreshAutostart?: boolean;
  // Ready the subtitle model in the background as soon as the app is up. The CLI turns it
  // on; tests boot without it so they never reach the network.
  readonly prefetchSubtitleModel?: boolean;
  // A verified model shipped with the install, copied instead of downloaded.
  readonly subtitleModelSeed?: string | undefined;
  // Import the bundled sample project on the first launch. The CLI turns it on; tests boot
  // without it so each starts with no projects.
  readonly seedSample?: boolean;
  // Check the published model catalogue and OpenRouter's live list at start and once a day.
  // The CLI turns it on; tests boot without it so they never reach the network.
  readonly refreshModels?: boolean;
  // A new install keeps its projects, backups and exports in <Documents>/Slopify. The CLI turns
  // it on unless a data dir was chosen; tests boot without it so they never touch Documents.
  readonly filesInDocuments?: boolean;
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

export async function boot(config: Config, options: BootOptions = {}): Promise<Boot> {
  const clock: Clock = systemClock;
  const ids = ulidIds;
  const paths = layout(config.dataDir);
  const dockerState = process.env.SLOPIFY_DOCKER_INSTALL_STATE;
  if (
    dockerState !== undefined &&
    (process.env.SLOPIFY_CONTAINER !== "1" ||
      dockerState !== "/opt/slopify-install/activation.json")
  )
    throw new Error(
      "This container was started with Slopify's Docker settings in the wrong place (SLOPIFY_DOCKER_INSTALL_STATE must be /opt/slopify-install/activation.json). Start it with Slopify's compose.yaml, or install it with npx @gentbajko/slopify --docker",
    );
  const candidateToken = process.env.SLOPIFY_UPDATE_TOKEN ?? "";
  const pendingActivation =
    isUpdateToken(candidateToken) && process.env.SLOPIFY_UPDATE_PENDING === "1";
  ensureDataDirs(paths, { mode: 0o700 });
  const lock = acquireInstanceLock(paths.lock);
  const freshInstall = !existsSync(paths.db);
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
    // Where the projects, backups and exports live. A container's are the installer's mounts;
    // a native install decides once and remembers (slices/storage/files-location.ts).
    const container = process.env.SLOPIFY_CONTAINER === "1";
    const files = container
      ? dockerFilesLayout(process.env, paths.dataDir)
      : filesLayoutOf(
          await settleFilesLocation({
            db,
            dataDir: paths.dataDir,
            fresh: freshInstall,
            documents:
              options.filesInDocuments === true
                ? () => documentsDir(nodeDocumentsHost())
                : undefined,
          }),
          paths.dataDir,
        );
    repoint(paths, files);
    if (files.exports === null) ensureDirs(paths, { mode: 0o700 });
    else await ensureFilesFolders(files);
    const runtimeDb = db;
    const interrupted = markInterruptedStages(db, clock);
    recoverCheckpointWork(db);
    const settledSchedules = settleTerminalScheduleRuns(db, clock.now().toISOString());
    settleInterruptedCastImages({ db });
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
    const sendNotification = createNotificationSender(globalThis.fetch);
    const notifier = createRunNotifier({
      url: () => readNotificationUrl(eventDb),
      subject: (projectId) => {
        const project = projectById(eventDb, projectId);
        return project === undefined
          ? undefined
          : { title: project.title, makesVideo: project.config.sources.video !== "off" };
      },
      send: sendNotification,
      log,
    });
    // Episode memory summarises a project that has just finished; wired once the providers
    // exist, below.
    let episodes: EpisodeMemoryWatcher | undefined;
    const hub = observedHub(
      createHub({
        ids,
        log,
        acceptEvent: (event) => currentProjectEvent(eventDb, event),
      }),
      (event) => {
        notifier.observe(event);
        episodes?.observe(event);
      },
    );
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
        ffmpeg,
      }),
      catalogue,
    );
    // Calls that belong to no project (topic generation, episode summaries, cast pictures)
    // still go through the attempt wrapper, and are metered against their schedule or channel.
    const standalone: StandaloneDeps = {
      registry,
      clock,
      log,
      meter: createStandaloneMeter({ db, ids, clock, catalogue: () => catalogue.read() }),
    };
    episodes = createEpisodeMemoryWatcher({
      db,
      paths,
      clock,
      log,
      uuid: randomUUID,
      llm: (call) => standaloneLlm(standalone, call),
    });
    const audioPreviews = createAudioPreviewStore();
    const reviewRedos = createReviewRedos();
    const runner = wireRunner({
      onFinished: (work) => reviewRedos.kick(work.projectId),
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
          ? "Slopify in Docker is updated from the terminal: npx @gentbajko/slopify@latest update. It waits for running work, keeps a recovery copy of your data and puts the previous version back if the new one doesn't start."
          : !existsSync(oldEntry) || !existsSync(workerEntry)
            ? "Run Slopify from its installed package to use in-app updates."
            : npm === undefined
              ? "npm was not found, so in-app updates are off. Install Node.js with npm (https://nodejs.org), or update from the terminal: npx @gentbajko/slopify@latest"
              : undefined,
      busy: () =>
        updateDb.prepare("SELECT 1 FROM stages WHERE state = 'running' LIMIT 1").get() !==
          undefined ||
        updateDb
          .prepare("SELECT id FROM projects")
          .all()
          .some((row) => typeof row.id === "string" && runner.hasInflight?.(row.id) === true),
      busyWith: () => {
        const running = updateDb
          .prepare(
            "SELECT p.title FROM stages s JOIN projects p ON p.id=s.project_id WHERE s.state='running' LIMIT 1",
          )
          .get();
        if (typeof running?.title === "string") return running.title;
        const inflight = updateDb
          .prepare("SELECT id,title FROM projects")
          .all()
          .find((row) => typeof row.id === "string" && runner.hasInflight?.(row.id) === true);
        return typeof inflight?.title === "string" ? inflight.title : undefined;
      },
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
    // Redos a review asked for before the last shutdown start now.
    reviewRedos.bind(rebuild);
    reviewRedos.kick();
    // A stage that was waiting for a CLI's plan limits when the app stopped carries on waiting.
    void resumeAfterRestart(
      db,
      async (projectId) => {
        const baseRevisionId = currentRevisionId(runtimeDb, projectId);
        if (baseRevisionId === undefined) return false;
        const result = await recoverProject(rebuild, projectId, {
          baseRevisionId,
          idempotencyKey: randomUUID(),
          action: { kind: "resume" },
        });
        return result.ok;
      },
      log,
    );
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
    const scheduleRunnerDeps: ScheduleDeps = {
      ...draftDeps,
      template: (id, templateVersion) => templateById(runtimeDb, id, templateVersion),
      topicLlm: (call) => standaloneLlm(standalone, call),
      topicsWaiting: (event) => {
        hub.emitGlobal(event);
        notifier.observeTopics(event);
      },
    };
    const scheduleRunner = createScheduleRunner(scheduleRunnerDeps);
    const scheduleDeps: ScheduleDeps = {
      ...scheduleRunnerDeps,
      requestTopics: scheduleRunner.requestTopics,
    };
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
    const folderConfiguration = await dockerFolderConfiguration(process.env, paths.projects);
    const filesService = createFilesService({
      db,
      paths,
      documents: () => documentsDir(nodeDocumentsHost()),
      busy: () => busyProjects({ db: runtimeDb, hasInflight: runner.hasInflight }),
      openFolder,
      beginMutation: updater.beginMutation,
      ...(container
        ? {
            docker: {
              hostProjects: folderConfiguration.hostProjects,
              hostBackups: folderConfiguration.hostBackups,
              ...(hostCli === undefined ? {} : { openOnHost: hostCli.openFolder }),
            },
          }
        : {}),
    });
    const backups = createBackupService({
      db,
      paths,
      clock,
      ids,
      log,
      appVersion: version,
      hasInflight: runner.hasInflight,
      location: folderConfiguration,
      bootedAt: clock.now(),
      beginMutation: updater.beginMutation,
    });
    // Before the server answers, so the first page already lists the samples. A failure costs
    // only the samples: the log says why and Settings → Restore samples tries again.
    if (options.seedSample === true && !pendingActivation)
      await seedSamples({ db, paths, clock, ids, log, appVersion: version }).catch(
        (error: unknown) => {
          log.write("warn", "sample.seed", { detail: causedBy(error) });
        },
      );
    const autostart = await createAutostart({
      db,
      dataDir: paths.dataDir,
      logs: paths.logs,
      port: config.port,
      host: config.host,
      version,
      env: process.env,
    });
    if (options.refreshAutostart === true)
      void autostart.refresh().catch((error: unknown) => {
        log.write("warn", "autostart.refresh", { detail: causedBy(error) });
      });
    const app = createApp({
      autostart,
      rebuild,
      drafts: draftDeps,
      schedules: scheduleDeps,
      backups,
      files: filesService,
      ...(rebuild.measureAudio === undefined ? {} : { measureAudio: rebuild.measureAudio }),
      decodePeaks: (path, signal) => decodePeaks(ffmpeg, path, signal),
      openFolder,
      folderLocation: {
        ...folderConfiguration,
        ...(hostCli === undefined ? {} : { openOnHost: hostCli.openFolder }),
      },
      ...(dockerState === undefined ? {} : { installationPending: () => updater.locked() }),
      db,
      paths,
      hub,
      runner,
      updater,
      mutations,
      sendNotification,
      audioPreviews,
      stylePreviews: createStylePreviews({
        dir: stylePreviewDir(paths.dataDir),
        render: ffmpegStylePreview({ ffmpeg, paths, log, dir: stylePreviewDir(paths.dataDir) }),
        pictures: previewPictures({ db, paths }),
        log,
      }),
      ...modelSources(registry),
      audition: (call, signal) => auditionVoice({ registry, clock, log }, call, signal),
      voiceLanguages: async (provider, voiceId, signal) => {
        try {
          return await registry.tts(provider).voiceLanguages?.(voiceId, signal);
        } catch {
          return undefined;
        }
      },
      catalogue,
      clock,
      ids,
      log,
      version,
      webDist: fileURLToPath(new URL("../dist/web", import.meta.url)),
      flushSoon: flusher.soon,
      probe: nodeCliProbe,
      hostCliStatus: hostCli?.status,
      generateCastImage: ({ channelId, ...call }) =>
        standaloneImage(standalone, {
          ...call,
          owner: { kind: "channel", id: channelId },
          purpose: "cast-image",
        }),
      fetch: globalThis.fetch,
      ...(hostCli === undefined ? { cliLogin: readHostLogin } : {}),
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
    // A step waiting out a rate limit or a timeout runs again once its wait is over; the wait
    // is in the database, so this also picks up the ones a restart left waiting.
    const retryTimer = setInterval(() => {
      const release = updater.beginMutation();
      if (!release) return;
      try {
        wakeRetries(updateDb, clock, runner);
      } catch (error) {
        log.write("error", "stage.retry", { detail: causedBy(error) });
      } finally {
        release();
      }
    }, 5_000);
    void scheduleTicks.tick();
    // Once a minute is plenty for a daily slot; the decision itself (slices/backups/schedule)
    // holds the first run back for a couple of minutes after a start.
    // The model catalogue keeps itself current: once at start, then whenever a day has passed
    // since the last check (looked at hourly, so a laptop that slept catches up).
    const syncModels = (): void => {
      if (!options.refreshModels || !catalogue.sync) return;
      catalogue.sync().then(
        (status) => {
          if (status.warning !== null)
            log.write("warn", "model-catalog.sync", { detail: status.warning });
        },
        (error: unknown) => log.write("warn", "model-catalog.sync", { detail: causedBy(error) }),
      );
    };
    syncModels();
    const modelTimer = setInterval(() => {
      if (catalogue.syncDue?.(Date.now()) === true) syncModels();
    }, 60 * 60_000);
    const backupTimer = setInterval(() => {
      backups.tick().catch((error: unknown) => {
        log.write("error", "backups.tick", { detail: causedBy(error) });
      });
    }, 60_000);
    // Settings → Trash keeps deleted items 30 days; once a day (looked at hourly, and once at
    // start) whatever is older goes for good, a project's folder with it.
    const trashPurge = createTrashPurge({
      db: updateDb,
      paths,
      clock,
      log,
      hasInflight: runner.hasInflight,
    });
    const purgeTrash = (): void => {
      const release = updater.beginMutation();
      if (!release) return;
      try {
        trashPurge.tick();
      } catch (error) {
        log.write("error", "trash.purge", { detail: causedBy(error) });
      } finally {
        release();
      }
    };
    purgeTrash();
    const trashTimer = setInterval(purgeTrash, 60 * 60_000);
    listeningPort = portOf(server) ?? config.port;
    // Whatever last run left queued goes out at start. Nothing waits for
    // it, and an unreachable collector costs one refused socket.
    flusher.soon();
    const modelPrefetch = new AbortController();
    const prefetching = options.prefetchSubtitleModel
      ? prefetchModel({
          cacheDir: subtitleModelDir(paths.dataDir),
          seed: options.subtitleModelSeed,
          signal: modelPrefetch.signal,
        }).then(
          () => log.write("info", "subtitle-model.ready"),
          (error: unknown) => {
            // Not fatal: the first captioned render tries again and says why on its row.
            if (!modelPrefetch.signal.aborted)
              log.write("warn", "subtitle-model.prefetch", { detail: causedBy(error) });
          },
        )
      : Promise.resolve();
    const open = db;
    let stopping: Promise<void> | undefined;
    let stopActivation = (): void => {};
    shutdown = (): Promise<void> => {
      stopping ??= (async () => {
        notifier.close();
        episodes?.close();
        clearInterval(queueTimer);
        clearInterval(scheduleTimer);
        clearInterval(retryTimer);
        clearInterval(backupTimer);
        clearInterval(trashTimer);
        clearInterval(modelTimer);
        const mutationDrain = mutations.stop();
        const scheduleDrain = scheduleTicks.stop();
        const topicDrain = scheduleRunner.stop();
        // A backup being written is stopped and its partial file removed, not waited for.
        const backupDrain = backups.stop();
        const serverClose = beginServerClose(server);
        stopActivation();
        audioPreviews.close();
        modelPrefetch.abort();
        try {
          // Admission closes before the listener. Requests already admitted keep the
          // database until their response settles; anything racing shutdown receives 503.
          await drainMutationsWithDeadline(
            mutationDrain,
            serverClose.terminate,
            mutationDrainTimeoutMs,
          );
          await scheduleDrain;
          await topicDrain;
          await backupDrain;
          await runner.abortAll();
          await episodes?.settled();
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
            await prefetching;
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
    return { paths, url: urlOf(config.host, listeningPort), stop: shutdown, autostart };
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
  // The bundled sample's build paces the words itself instead of listening for them.
  readonly alignSubtitles?: SubtitleAligner | undefined;
  // Told after a step's row is written: a review that sent its item back starts the redo.
  readonly onFinished?: ((work: WorkRef) => void) | undefined;
}

export function wireRunner({
  onFinished,
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
  alignSubtitles: aligner = alignSubtitles,
}: Wiring): Runner & { readonly checkpoints: CheckpointAuthority<CheckpointRow> } {
  // A stage counts what it did and the queue is flushed after each new event. `record`
  // swallows its own failures, so this can neither fail a stage nor widen what leaves the
  // machine - the payload allow-list is checked inside it.
  const count: RecordEvent = (type, counters) => {
    record(telemetry, type, counters);
    flusher.soon();
  };
  const execution = {
    db,
    paths,
    ids,
    clock,
    log,
    ffmpeg,
    alignSubtitles: aligner,
    audioPreviews,
    count,
  };
  // A stage slice is handed the wrapped calls, never the registry: every provider call
  // it makes is already inside the retry policy (kernel/runner/providers.ts).
  const providers: ProviderDeps = {
    registry,
    attempts: sqliteAttempts(db, ids),
    clock,
    log,
    meter: createUsageMeter({ db, ids, clock, catalogue: () => catalogue.read() }),
    limits: createLimitGate({
      db,
      clock,
      log,
      changed: (projectId) => hub.emit(projectId, { type: "project.updated", projectId }),
    }),
    queue: createProviderQueue((provider) =>
      isLocalCliProvider(provider)
        ? localCliConcurrency(provider)
        : (catalogue.read().providers[provider]?.maxConcurrent ?? 1),
    ),
  };
  const checkpoints = createCheckpointAuthority<CheckpointRow>({
    // A review waiting to send its item back holds the item's dependents like a checkpoint.
    decide: (work) => {
      const review = reviewHold(execution, work);
      return review.kind === "held" ? review : checkpointDecisionForWork(execution, work);
    },
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
      // A project in the trash (Settings → Trash) holds like a paused one until it is restored.
      paused: (projectId) =>
        projectPaused(db, projectId) ||
        queueWaiting(db, projectId) ||
        projectTrashed(db, projectId),
      claim: (work) => {
        const claimed = claimWork(db, work);
        projectStandings(execution, work.projectId);
        return claimed;
      },
      maySubmit: (work, pieceId) => maySubmit(db, work, pieceId),
      waitToRetry: (work, fault, reason) =>
        transact(db, () => {
          const at = waitToRetry(execution, work, fault, reason, Math.random);
          if (at !== undefined) projectStandings(execution, work.projectId);
          return at;
        }),
      finish: (work, state, reason, kind) => {
        transact(db, () => {
          finishWork(db, work, state, reason, kind ?? null);
          materializeAdmittedWork(execution, work.projectId);
          projectStandings(execution, work.projectId);
          settleReleasedCheckpoints(execution, work.projectId);
        });
        onFinished?.(work);
      },
    },
    runs: Object.fromEntries(
      stageKinds.map((kind) => [
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
    // Before the first connection: a backup import may outlast Node's 5-minute request limit.
    limitRequestTimes(server);
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
