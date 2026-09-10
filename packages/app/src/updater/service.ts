import { timingSafeEqual } from "node:crypto";
import type { AppUpdater, UpdateInfo, UpdateStatus } from "./model.js";
import { isStableVersion, isUpdateToken, newerVersion } from "./model.js";

interface UpdateDeps {
  readonly currentVersion: string;
  readonly previousUpdateFailed?: boolean;
  readonly candidate?: {
    readonly token: string;
    readonly pending: boolean;
    readonly committed: () => Promise<boolean>;
  };
  readonly latest: () => Promise<string>;
  readonly now: () => number;
  readonly busy: () => boolean;
  readonly unsupported: () => string | undefined;
  readonly install: (version: string, restarting: () => void) => Promise<void>;
  readonly report: (message: string) => void;
}

export function createUpdater(deps: UpdateDeps): AppUpdater {
  let latestVersion: string | null = null;
  let checkedAt = -Infinity;
  let status: UpdateStatus = deps.candidate?.pending === true ? "restarting" : "idle";
  let activated = deps.candidate?.pending !== true;
  let installError: string | undefined = deps.previousUpdateFailed
    ? "The update did not start. The previous version and database were restored. You can try again."
    : undefined;
  let error: string | undefined = installError;
  let checking: Promise<void> | undefined;
  let mutations = 0;
  const busyNow = () => deps.busy() || mutations > 0;
  const locked = () => status === "installing" || status === "restarting";
  function info(): UpdateInfo {
    const busy = busyNow();
    const available = latestVersion !== null && newerVersion(latestVersion, deps.currentVersion);
    const blockedReason =
      deps.unsupported() ??
      (busy
        ? "Pause running projects and wait for their active work to stop before updating."
        : locked()
          ? "An update is already in progress."
          : undefined);
    return {
      currentVersion: deps.currentVersion,
      latestVersion,
      available,
      busy,
      canUpdate: available && blockedReason === undefined,
      status,
      ...(error === undefined ? {} : { error }),
      ...(blockedReason === undefined ? {} : { blockedReason }),
    };
  }
  async function check(refresh = false): Promise<UpdateInfo> {
    if (locked()) return info();
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
        error = "Could not check for updates. Check your connection and try again.";
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
      const committed = await deps.candidate.committed();
      if (activated) return true;
      if (!committed) return false;
      activated = true;
      status = "idle";
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
      if (locked() || busyNow()) return { ok: false, code: 409, info: info() };
      installError = undefined;
      await check(true);
      const current = info();
      if (!current.canUpdate || latestVersion === null || current.status === "error") {
        return {
          ok: false,
          code: current.busy || locked() ? 409 : current.status === "error" ? 503 : 400,
          info: current,
        };
      }
      status = "installing";
      error = undefined;
      const version = latestVersion;
      void Promise.resolve()
        .then(() =>
          deps.install(version, () => {
            status = "restarting";
          }),
        )
        .catch(() => {
          status = "error";
          error =
            "The update could not be completed. Your current installation is still available. Try again or restart Slopify.";
          installError = error;
          deps.report(error);
        });
      return { ok: true, info: info() };
    },
  };
}
