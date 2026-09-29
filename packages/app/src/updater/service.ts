import { timingSafeEqual } from "node:crypto";
import { setImmediate } from "node:timers";
import type { AppUpdater, UpdateInfo, UpdateStatus } from "./model.js";
import { isStableVersion, isUpdateToken, newerVersion } from "./model.js";

interface UpdateDeps {
  readonly currentVersion: string;
  readonly previousUpdateFailed?: boolean;
  readonly candidate?: {
    readonly token: string;
    readonly pending: boolean;
    readonly committed: () => Promise<boolean>;
    readonly settle?: () => void | Promise<void>;
  };
  readonly latest: () => Promise<string>;
  readonly now: () => number;
  readonly busy: () => boolean;
  // The title of a project whose work is running, for "installs when 'Title' finishes".
  readonly busyWith?: () => string | undefined;
  // How often a waiting update looks again; returns the stop. Injected so a test can drive it.
  readonly every?: (callback: () => void, ms: number) => () => void;
  readonly unsupported: () => string | undefined;
  readonly install: (version: string, restarting: () => void) => Promise<void>;
  readonly report: (message: string) => void;
}

const waitCheckMs = 5_000;
const idleLooksToInstall = 2;

export function createUpdater(deps: UpdateDeps): AppUpdater {
  let latestVersion: string | null = null;
  let checkedAt = -Infinity;
  let status: UpdateStatus = deps.candidate?.pending === true ? "restarting" : "idle";
  let activated = deps.candidate?.pending !== true;
  let installError: string | undefined = deps.previousUpdateFailed
    ? "The new version did not start, so Slopify put back the previous version and database. You can try again; the reason is in logs/updates.log inside your Slopify data folder."
    : undefined;
  let error: string | undefined = installError;
  let checking: Promise<void> | undefined;
  let settling: Promise<void> | undefined;
  let mutations = 0;
  // The version a `waiting` update will install, and the stop of the timer watching for idle.
  let pending: string | undefined;
  let stopWatching: (() => void) | undefined;
  const every =
    deps.every ??
    ((callback: () => void, ms: number): (() => void) => {
      const timer = setInterval(callback, ms);
      timer.unref();
      return () => clearInterval(timer);
    });
  const busyNow = () => deps.busy() || mutations > 0;
  const locked = () => status === "installing" || status === "restarting";
  // A function, not a comparison, because an await in between may have changed it.
  const waiting = (): boolean => status === "waiting";
  function info(): UpdateInfo {
    const busy = busyNow();
    const available = latestVersion !== null && newerVersion(latestVersion, deps.currentVersion);
    // Running work no longer blocks an update: it waits for the work (`waiting`).
    const blockedReason =
      deps.unsupported() ??
      (locked()
        ? "An update is already in progress."
        : status === "waiting"
          ? "An update is already waiting for running work to finish."
          : undefined);
    const waitingFor = busy ? deps.busyWith?.() : undefined;
    return {
      currentVersion: deps.currentVersion,
      latestVersion,
      available,
      busy,
      canUpdate: available && blockedReason === undefined,
      status,
      ...(error === undefined ? {} : { error }),
      ...(blockedReason === undefined ? {} : { blockedReason }),
      ...(status === "waiting" && pending !== undefined ? { pendingVersion: pending } : {}),
      ...(waitingFor === undefined ? {} : { waitingFor }),
    };
  }
  function install(version: string): void {
    status = "installing";
    error = undefined;
    void Promise.resolve()
      .then(() =>
        deps.install(version, () => {
          status = "restarting";
        }),
      )
      .catch(() => {
        status = "error";
        error =
          "The update could not be installed, so Slopify kept your current version. Check your internet connection and try again; the reason is in logs/updates.log inside your Slopify data folder.";
        installError = error;
        deps.report(error);
      });
  }
  // Looks again every few seconds and installs once no work is running. Idle has to hold for
  // two looks in a row, so the moment between one step finishing and the next starting is
  // never mistaken for the end of the work.
  function wait(version: string): void {
    pending = version;
    status = "waiting";
    error = undefined;
    let idleLooks = 0;
    stopWatching = every(() => {
      if (status !== "waiting") return;
      if (busyNow()) {
        idleLooks = 0;
        return;
      }
      idleLooks += 1;
      if (idleLooks < idleLooksToInstall) return;
      stopWatching?.();
      stopWatching = undefined;
      pending = undefined;
      install(version);
    }, waitCheckMs);
  }
  async function check(refresh = false): Promise<UpdateInfo> {
    if (locked() || status === "waiting") return info();
    if (checking !== undefined) {
      await checking;
      return info();
    }
    if (!refresh && deps.now() - checkedAt < 15 * 60_000) return info();
    status = "checking";
    checking = (async () => {
      try {
        const found = await deps.latest();
        if (!isStableVersion(found)) throw new Error("Invalid release version");
        latestVersion = found;
        status = installError === undefined ? "idle" : "error";
        error = installError;
      } catch {
        status = "error";
        error =
          "Could not check for updates: the npm registry (registry.npmjs.org) did not answer properly. Check your internet connection and try again.";
        deps.report(error);
      } finally {
        checkedAt = deps.now();
      }
    })();
    await checking;
    checking = undefined;
    return info();
  }
  const ready = (token: string): boolean =>
    deps.candidate !== undefined &&
    isUpdateToken(token) &&
    isUpdateToken(deps.candidate.token) &&
    timingSafeEqual(Buffer.from(token), Buffer.from(deps.candidate.token));
  return {
    ready,
    activate: async (token) => {
      if (!ready(token) || deps.candidate === undefined) return false;
      if (activated) return true;
      if (settling !== undefined) return true;
      const committed = await deps.candidate.committed();
      if (activated) return true;
      if (settling !== undefined) return true;
      if (!committed) return false;
      if (deps.candidate.settle === undefined) {
        activated = true;
        status = "idle";
        return true;
      }
      // Acknowledge the committed pointer before a potentially long filesystem sweep.
      // Mutations remain locked until the deferred settlement finishes.
      settling = new Promise<void>((resolve) => setImmediate(resolve))
        .then(() => deps.candidate?.settle?.())
        .catch(() => {
          try {
            deps.report("Storage reconciliation failed after update activation.");
          } catch {
            // The pointer is committed; reporting must not strand the candidate lock.
          }
        })
        .finally(() => {
          activated = true;
          status = "idle";
        });
      return true;
    },
    check,
    locked,
    beginMutation: () => {
      if (locked()) return undefined;
      mutations++;
      return () => {
        mutations--;
      };
    },
    start: async () => {
      if (locked() || waiting()) return { ok: false, code: 409, info: info() };
      installError = undefined;
      await check(true);
      const current = info();
      if (!current.canUpdate || latestVersion === null || current.status === "error") {
        return {
          ok: false,
          code: locked() || waiting() ? 409 : current.status === "error" ? 503 : 400,
          info: current,
        };
      }
      // Rechecked after the registry await: a project may have started meanwhile.
      if (busyNow()) wait(latestVersion);
      else install(latestVersion);
      return { ok: true, info: info() };
    },
    cancelWaiting: () => {
      if (status !== "waiting") return false;
      stopWatching?.();
      stopWatching = undefined;
      pending = undefined;
      status = "idle";
      return true;
    },
  };
}
