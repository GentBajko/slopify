import type { ExtensionApi } from "./browser.js";

// Loaded unpacked from the folder Slopify keeps current (Settings → YouTube Studio), the
// extension updates with Slopify: Slopify writes each new build there, and when the manifest on
// disk names another version than the one running, the extension reloads itself to run it. Only
// once nothing has gone through it for a while, so a fill in progress is never cut off. A
// store install updates through the store and is left alone.

// Quiet this long before reloading: a fill can wait a long time on Studio uploading a
// multi-gigabyte video between two of its steps, and an update is never urgent.
export const idleBeforeReload = 45 * 60 * 1000;

export async function reloadIfUpdated(
  api: Pick<ExtensionApi, "runtime" | "management">,
  lastActivity: number,
  now: number,
  read: (url: string) => Promise<unknown> = async (url) =>
    (await fetch(url, { cache: "no-store" })).json(),
): Promise<"reloaded" | "current" | "busy" | "not-unpacked"> {
  const self = await api.management?.getSelf().catch(() => undefined);
  if (self?.installType !== "development") return "not-unpacked";
  let onDisk: unknown;
  try {
    onDisk = ((await read(api.runtime.getURL("manifest.json"))) as { version?: unknown }).version;
  } catch {
    // Mid-swap, the folder has no manifest for a moment: the next check finds the new one.
    return "current";
  }
  if (typeof onDisk !== "string" || onDisk === api.runtime.getManifest().version) return "current";
  if (now - lastActivity < idleBeforeReload) return "busy";
  api.runtime.reload();
  return "reloaded";
}
