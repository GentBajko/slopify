import { statfs } from "node:fs/promises";
import type { Log } from "../../kernel/log.js";
import {
  BackupBusyError,
  type BackupDeps,
  type BackupPlan,
  type BusyProject,
  planBackup,
  streamBackup,
} from "../storage/backup-export.js";
import { defaultBackupsDir } from "../storage/layout.js";
import {
  backupFileName,
  codeOf,
  ensureFolder,
  listBackups,
  pruneBackups,
  removeLeftovers,
  writeAtomically,
} from "./files.js";
import { effectiveFolder, type FolderLocation, folderProblem, hostFolder } from "./folder.js";
import type {
  BackupConfig,
  BackupConfigInput,
  BackupStatus,
  BackupTrigger,
  BackupView,
} from "./model.js";
import { readConfig, readStatus, writeConfig, writeStatus } from "./repo.js";
import { decideBackup, nextSlot } from "./schedule.js";

export interface BackupServiceDeps extends BackupDeps {
  readonly log: Log;
  readonly location: FolderLocation;
  readonly bootedAt: Date;
  // The updater's gate: an update waits for a backup being written, and none starts during one.
  readonly beginMutation?: (() => (() => void) | undefined) | undefined;
  readonly serverTimeZone?: string;
}

export type RunRefusal = { readonly status: 400 | 409; readonly detail: string };

export interface BackupService {
  readonly view: () => Promise<BackupView>;
  readonly save: (input: BackupConfigInput) => { ok: true } | { ok: false; detail: string };
  readonly runNow: () => { ok: true } | ({ ok: false } & RunRefusal);
  readonly tick: () => Promise<void>;
  readonly stop: () => Promise<void>;
}

// Scheduled backups reuse Export everything's own code path (planBackup, streamBackup) and so
// its rule too: nothing is copied while a project is being made, because its files are still
// being written. A backup that meets one waits and looks again, so it never competes with a
// render; the writing itself yields to the event loop after every chunk.
export function createBackupService(deps: BackupServiceDeps): BackupService {
  let current: { readonly abort: AbortController; readonly done: Promise<void> } | undefined;
  let stopped = false;
  const zone = deps.serverTimeZone ?? (Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
  const config = (): BackupConfig => readConfig(deps.db, zone);
  const folderOf = (value: BackupConfig): string => effectiveFolder(deps.paths, value.folder);

  const record = (status: BackupStatus): void => {
    try {
      writeStatus(deps.db, status);
    } catch (error) {
      deps.log.write("error", "backups.status", { detail: String(error) });
    }
  };

  const start = (
    plan: BackupPlan,
    trigger: BackupTrigger,
    slot: string | null,
    release: () => void,
  ): Promise<void> => {
    const abort = new AbortController();
    const done = write(plan, trigger, slot, abort.signal)
      .catch((error: unknown) => {
        deps.log.write("error", "backups.run", { detail: String(error) });
      })
      .finally(() => {
        release();
        current = undefined;
      });
    current = { abort, done };
    return done;
  };

  async function write(
    plan: BackupPlan,
    trigger: BackupTrigger,
    slot: string | null,
    signal: AbortSignal,
  ): Promise<void> {
    const settings = config();
    const folder = folderOf(settings);
    const startedAt = deps.clock.now();
    const previous = readStatus(deps.db);
    const attempt = {
      ...previous,
      lastAttemptAt: startedAt.toISOString(),
      lastTrigger: trigger,
      lastSlot: slot,
    };
    try {
      await ensureFolder(folder);
      await removeLeftovers(folder);
      await checkSpace(folder, plan.archiveBytes);
      const name = backupFileName(startedAt);
      const written = await writeAtomically(folder, name, streamBackup(plan), signal);
      let detail: string | null = null;
      try {
        await pruneBackups(folder, settings.keep);
      } catch (error) {
        deps.log.write("warn", "backups.prune", { detail: String(error) });
        detail = `The backup was saved, but older backups in ${folder} could not be removed (${codeOf(error) ?? "unknown error"}), so more than ${settings.keep} are kept. Check Slopify can delete files in that folder, or pick another Folder in Settings → Backups.`;
      }
      record({
        ...attempt,
        lastResult: "succeeded",
        detail,
        lastSuccessAt: deps.clock.now().toISOString(),
        lastSuccessFile: written.path,
        lastSuccessBytes: written.bytes,
        lastDurationMs: deps.clock.now().valueOf() - startedAt.valueOf(),
      });
    } catch (error) {
      deps.log.write("error", "backups.run", { detail: String(error) });
      record({
        ...attempt,
        lastResult: "failed",
        detail: explain(error, folder, trigger !== "manual", signal),
        lastDurationMs: deps.clock.now().valueOf() - startedAt.valueOf(),
      });
    }
  }

  const waiting = (
    projects: readonly BusyProject[],
    trigger: BackupTrigger,
    slot: string,
  ): void => {
    record({
      ...readStatus(deps.db),
      lastAttemptAt: deps.clock.now().toISOString(),
      lastResult: "waiting",
      lastTrigger: trigger,
      lastSlot: slot,
      detail: `Waiting for ${named(projects)} to finish: a backup never copies a project while its files are being written. It starts by itself when they finish or are paused.`,
      lastDurationMs: null,
    });
  };

  return {
    view: async () => {
      const settings = config();
      const folder = folderOf(settings);
      const now = deps.clock.now();
      let files: BackupView["files"] = [];
      try {
        files = await listBackups(folder);
      } catch {
        files = [];
      }
      const decision = decideBackup({
        config: settings,
        status: readStatus(deps.db),
        now,
        bootedAt: deps.bootedAt,
        running: current !== undefined,
      });
      const overdue =
        decision.due || (!decision.due && ["starting", "retry-later"].includes(decision.reason));
      return {
        config: {
          enabled: settings.enabled,
          time: settings.time,
          timeZone: settings.timeZone,
          keep: settings.keep,
          folder: settings.folder,
        },
        folder,
        defaultFolder: defaultBackupsDir(deps.paths),
        hostFolder: hostFolder(deps.paths, deps.location, folder),
        container: deps.location.container,
        running: current !== undefined,
        nextRunAt: settings.enabled
          ? (nextSlot(settings.time, settings.timeZone, now)?.toISOString() ?? null)
          : null,
        overdue: settings.enabled && overdue,
        status: readStatus(deps.db),
        files,
      };
    },
    save: (input) => {
      const problem = folderProblem(deps.paths, input.folder);
      if (problem !== undefined) return { ok: false, detail: problem };
      const before = config();
      const now = deps.clock.now().toISOString();
      const moved = before.time !== input.time || before.timeZone !== input.timeZone;
      const enabledAt = !input.enabled
        ? null
        : !before.enabled || moved || before.enabledAt === null
          ? now
          : before.enabledAt;
      writeConfig(deps.db, { ...input, enabledAt });
      return { ok: true };
    },
    runNow: () => {
      if (stopped)
        return {
          ok: false,
          status: 409,
          detail: "Slopify is shutting down. Start it again, then press Back up now.",
        };
      if (current !== undefined)
        return {
          ok: false,
          status: 409,
          detail:
            "A backup is already being written. Wait for it to finish; its result shows here.",
        };
      const problem = folderProblem(deps.paths, config().folder);
      if (problem !== undefined) return { ok: false, status: 400, detail: problem };
      const release = deps.beginMutation === undefined ? () => {} : deps.beginMutation();
      if (release === undefined) return busyUpdating();
      let plan: BackupPlan;
      try {
        plan = planBackup(deps);
      } catch (error) {
        release();
        if (error instanceof BackupBusyError)
          return {
            ok: false,
            status: 409,
            detail: `Slopify can't back up while ${named(error.projects)} ${error.projects.length === 1 ? "is" : "are"} being made: their files are still being written. Wait for them to finish, or pause them on their project page, then press Back up now again.`,
          };
        throw error;
      }
      void start(plan, "manual", null, release);
      return { ok: true };
    },
    tick: async () => {
      if (stopped || current !== undefined) return;
      const settings = config();
      const decision = decideBackup({
        config: settings,
        status: readStatus(deps.db),
        now: deps.clock.now(),
        bootedAt: deps.bootedAt,
        running: false,
      });
      if (!decision.due) return;
      if (folderProblem(deps.paths, settings.folder) !== undefined) return;
      const release = deps.beginMutation === undefined ? () => {} : deps.beginMutation();
      // An update is being installed; the backup runs after the restart.
      if (release === undefined) return;
      let plan: BackupPlan;
      try {
        plan = planBackup(deps);
      } catch (error) {
        release();
        if (error instanceof BackupBusyError) {
          waiting(error.projects, decision.trigger, decision.slot);
          return;
        }
        deps.log.write("error", "backups.plan", { detail: String(error) });
        record({
          ...readStatus(deps.db),
          lastAttemptAt: deps.clock.now().toISOString(),
          lastResult: "failed",
          lastTrigger: decision.trigger,
          lastSlot: decision.slot,
          detail:
            "The backup was not saved because Slopify could not read what to back up. It tries again in an hour; if it keeps failing, use Download diagnostics in Settings and report it.",
          lastDurationMs: null,
        });
        return;
      }
      await start(plan, decision.trigger, decision.slot, release);
    },
    stop: async () => {
      stopped = true;
      const running = current;
      if (running === undefined) return;
      running.abort.abort(new Error("Slopify is stopping."));
      await running.done;
    },
  };
}

function busyUpdating(): { ok: false } & RunRefusal {
  return {
    ok: false,
    status: 409,
    detail: "Slopify is installing an update. Press Back up now again after it restarts.",
  };
}

async function checkSpace(folder: string, needed: number): Promise<void> {
  let free: number;
  try {
    const stats = await statfs(folder);
    free = Number(stats.bavail) * Number(stats.bsize);
  } catch {
    return;
  }
  if (free < needed) throw new NoSpaceError(needed, free);
}

class NoSpaceError extends Error {
  constructor(
    readonly needed: number,
    readonly free: number,
  ) {
    super("Not enough free space for the backup.");
  }
}

function named(projects: readonly BusyProject[]): string {
  const titles = projects
    .slice(0, 3)
    .map((project) => `"${project.title}"`)
    .join(", ");
  return projects.length > 3 ? `${titles} and ${projects.length - 3} more` : titles;
}

// What failed, why, and what to change - the sentence Settings → Backups shows.
export function explain(
  error: unknown,
  folder: string,
  retries: boolean,
  signal?: AbortSignal,
): string {
  const fix = "Pick another Folder in Settings → Backups, or leave it empty to use the default";
  if (signal?.aborted === true && error === signal.reason)
    return "The backup was not saved: Slopify stopped while writing it, and the unfinished file was removed. It runs again after Slopify starts.";
  if (error instanceof NoSpaceError)
    return `The backup was not saved: it needs about ${bytes(error.needed)}, but the disk holding ${folder} has ${bytes(error.free)} free. Free up space there, lower "Keep last" in Settings → Backups, or pick another Folder.`;
  switch (codeOf(error)) {
    case "ENOSPC":
    case "EDQUOT":
      return `The backup was not saved: the disk holding ${folder} ran out of space. Free up space there, lower "Keep last" in Settings → Backups, or pick another Folder.`;
    case "EACCES":
    case "EPERM":
    case "EROFS":
      return `The backup was not saved: Slopify is not allowed to write to ${folder}. ${fix}.`;
    case "ENOTDIR":
    case "EEXIST":
      return `The backup was not saved: ${folder} (or a part of its path) is a file, not a folder. ${fix}.`;
  }
  const again = retries
    ? "It tries again within the hour, or press Back up now"
    : "Press Back up now to try again";
  if (
    error instanceof Error &&
    error.message.endsWith("changed while the backup was being written.")
  )
    return `The backup was not saved: a project file changed while it was being copied. ${again}.`;
  return `The backup was not saved because of an unexpected error. ${again}; if it keeps failing, use Download diagnostics in Settings and report it.`;
}

function bytes(value: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let amount = value;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) {
    amount /= 1024;
    unit += 1;
  }
  return `${amount >= 10 || unit === 0 ? amount.toFixed(0) : amount.toFixed(1)} ${units[unit]}`;
}
