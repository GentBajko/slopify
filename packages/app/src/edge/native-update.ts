import { setTimeout as delay } from "node:timers/promises";
import type { UpdateInfo } from "../updater/model.js";

export interface NativeUpdateDeps {
  readonly origin: string;
  readonly fetch: typeof globalThis.fetch;
  readonly report: (line: string) => void;
  readonly pollMs?: number;
  /** How long the app may be unreachable while it restarts, in ms. */
  readonly restartMs?: number;
}

/**
 * `slopify update` for a native install: asks the running app to update itself, exactly as the
 * Update button in Settings does (wait for running work, install, back up the database, start the
 * new version, roll back if it doesn't come up), and follows it until it has finished.
 */
export async function runNativeUpdate(deps: NativeUpdateDeps): Promise<void> {
  const poll = deps.pollMs ?? 2000;
  const read = async (refresh = false): Promise<UpdateInfo> => {
    const response = await deps.fetch(`${deps.origin}/api/update${refresh ? "?refresh=1" : ""}`);
    if (!response.ok) throw new Error(`Slopify answered ${response.status}.`);
    return (await response.json()) as UpdateInfo;
  };
  let info: UpdateInfo;
  try {
    info = await read(true);
  } catch {
    throw new Error(
      `Slopify isn't running at ${deps.origin}, so there is nothing to update. Start it (npx @gentbajko/slopify) and run slopify update again; if it runs on another port, add --port <number>. To just start the newest version, run npx @gentbajko/slopify@latest.`,
    );
  }
  if (info.status === "error" && info.error !== undefined && info.latestVersion === null)
    throw new Error(info.error);
  if (!info.available) {
    deps.report(`Slopify ${info.currentVersion} is already the newest version.`);
    return;
  }
  const target = info.latestVersion;
  let told = false;
  while (info.busy) {
    if (!told)
      deps.report(
        "Slopify is generating right now. Waiting for running work to finish before updating (press Ctrl+C to cancel; nothing has been changed yet)...",
      );
    told = true;
    await delay(poll);
    info = await read();
  }
  if (!info.canUpdate)
    throw new Error(
      info.blockedReason ??
        info.error ??
        "Slopify can't update right now. Open Settings in Slopify to see why.",
    );
  const started = await deps.fetch(`${deps.origin}/api/update`, { method: "POST" });
  if (!started.ok) {
    const body = (await started.json().catch(() => ({}))) as { detail?: string };
    throw new Error(body.detail ?? `Slopify refused to start the update (${started.status}).`);
  }
  deps.report(`Updating Slopify ${info.currentVersion} to ${target}...`);
  const deadline = Date.now() + (deps.restartMs ?? 10 * 60_000);
  while (Date.now() < deadline) {
    await delay(poll);
    const now = await read().catch(() => undefined);
    if (now === undefined || now.status === "installing" || now.status === "restarting") continue;
    if (now.currentVersion === target && now.status !== "error") {
      deps.report(`Slopify ${target} is running at ${deps.origin}`);
      return;
    }
    if (now.status === "error" || now.error !== undefined)
      throw new Error(
        now.error ??
          "The update did not finish, so Slopify kept or put back the previous version. The reason is in logs/updates.log inside your Slopify data folder.",
      );
  }
  throw new Error(
    `Slopify didn't answer at ${deps.origin} within 10 minutes after the update started. Check it in the browser; the updater puts the previous version back on its own if the new one doesn't start, and the reason is in logs/updates.log inside your Slopify data folder.`,
  );
}
