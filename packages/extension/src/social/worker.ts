import type { ExtensionApi } from "../browser.js";
import type { WorkerAnswer } from "../pack.js";
import { allowedSites, syncScripts } from "./grant.js";
import { findHash, type LookupHash, markedUrl, type SocialRequest } from "./messages.js";
import {
  type ActivePost,
  type DuePost,
  type LinkLookup,
  linkPatterns,
  platformLabels,
  type SocialPlatform,
} from "./types.js";

// The background worker's posting side. It talks to Slopify's `/api/social/ext/*` for the pages
// on the sites (they never talk to Slopify themselves), and every 15 minutes:
// - sets an alarm for each post due on a site without a scheduler (Instagram, Bluesky, Reddit);
//   the alarm opens the site's post form in a background tab, the page fills it and the worker
//   shows a notification: the person presses Post. A post whose time passed while the browser
//   was closed is still filled, up to 12 hours late (Slopify says which), flagged late;
// - opens the profile page of each filled or scheduled post whose link Slopify doesn't have yet,
//   where the page finds the post by its first characters and reports its link;
// - tells Slopify which sites it may post on, for Prepare upload's Fill buttons.
// Nothing here runs on a site the person hasn't allowed in the options. A Slopify from before
// posting answers 404 to all of it, and the worker then does nothing.

export interface SocialWorkerDeps {
  readonly api: ExtensionApi;
  readonly paired: () => Promise<boolean>;
  readonly getJson: <T>(path: string, what: string) => Promise<T>;
  readonly postJson: (path: string, body: unknown, what: string) => Promise<unknown>;
  readonly getBytes: (path: string, what: string) => Promise<ArrayBuffer>;
  readonly now: () => number;
}

export interface SocialAnswer {
  readonly reply: WorkerAnswer<unknown>;
  // The tab that asked did its work: close it (a profile page opened to find a link).
  readonly closeTab?: boolean;
}

const dueKey = "socialDue";
const openedKey = "socialOpened";
// A post form opened for a due post, or a profile page for a link, isn't opened again for this
// long, in case its page never reports.
export const reopenMs = 30 * 60 * 1000;
export const lookupEveryMs = 6 * 60 * 60 * 1000;
export const alarmPrefix = "slopify-post:";
const notificationPrefix = "slopify-post-tab:";

interface DueEntry {
  readonly projectId: string;
  readonly projectTitle: string;
  readonly platform: SocialPlatform;
  readonly at: string;
  readonly late: boolean;
  readonly composeUrl: string;
}

function base64(bytes: ArrayBuffer): string {
  let binary = "";
  const view = new Uint8Array(bytes);
  for (let at = 0; at < view.length; at += 0x8000)
    binary += String.fromCharCode(...view.subarray(at, at + 0x8000));
  return btoa(binary);
}

export function socialWorker(deps: SocialWorkerDeps) {
  const { api } = deps;
  const stored = async <T>(key: string, fallback: T): Promise<T> =>
    ((await api.storage.local.get([key]))[key] as T | undefined) ?? fallback;

  // Opens `url` in a background tab unless `key` was opened within `guardMs`.
  async function openOnce(key: string, url: string, guardMs: number): Promise<boolean> {
    const times = await stored<Record<string, number>>(openedKey, {});
    const now = deps.now();
    if (now - (times[key] ?? 0) < guardMs) return false;
    await api.storage.local.set({ [openedKey]: { ...times, [key]: now } });
    await api.tabs?.create({ url, active: false });
    return true;
  }

  // Due posts within the next hour (or up to 12 hours late): one alarm each.
  async function checkDue(): Promise<number> {
    if (!(await deps.paired())) return 0;
    const allowed = await allowedSites(api);
    const { posts } = await deps
      .getJson<{ posts: readonly DuePost[] }>("/api/social/ext/due?hours=1", "the posts due")
      .catch(() => ({ posts: [] as readonly DuePost[] }));
    const due: Record<string, DueEntry> = {};
    for (const post of posts) {
      if (!allowed.includes(post.platform)) continue;
      const name = `${alarmPrefix}${post.projectId}:${post.platform}`;
      due[name] = {
        projectId: post.projectId,
        projectTitle: post.projectTitle,
        platform: post.platform,
        at: post.at,
        late: post.late,
        composeUrl: post.composeUrl,
      };
      api.alarms?.create(name, { when: Math.max(Date.parse(post.at), deps.now() + 1000) });
    }
    await api.storage.local.set({ [dueKey]: due });
    return Object.keys(due).length;
  }

  // A due post's alarm: its site's post form, in the background.
  async function onAlarm(name: string): Promise<boolean> {
    if (!name.startsWith(alarmPrefix)) return false;
    const entry = (await stored<Record<string, DueEntry>>(dueKey, {}))[name];
    if (entry === undefined) return false;
    const url = markedUrl(entry.composeUrl, entry.projectId, entry.platform, {
      due: true,
      late: entry.late,
    });
    return openOnce(name, url, reopenMs);
  }

  async function findLinks(): Promise<number> {
    if (!(await deps.paired())) return 0;
    const allowed = await allowedSites(api);
    const { posts } = await deps
      .getJson<{ posts: readonly LinkLookup[] }>("/api/social/ext/find-links", "the posts' links")
      .catch(() => ({ posts: [] as readonly LinkLookup[] }));
    let opened = 0;
    for (const post of posts) {
      if (!allowed.includes(post.platform)) continue;
      const lookup: LookupHash = {
        projectId: post.projectId,
        platform: post.platform,
        start: post.start,
      };
      const url = `${post.profileUrl.replace(/#.*$/, "")}#${findHash}=${encodeURIComponent(JSON.stringify(lookup))}`;
      if (await openOnce(`lookup:${post.projectId}:${post.platform}`, url, lookupEveryMs)) opened++;
    }
    return opened;
  }

  // The sites the options allowed, to Slopify (an older Slopify answers 404: ignored).
  async function reportSites(): Promise<readonly SocialPlatform[]> {
    const sites = await syncScripts(api);
    if (await deps.paired())
      await deps.postJson("/api/social/ext/sites", { sites }, "the sites allowed").catch(() => {});
    return sites;
  }

  async function notifyFilled(
    tabId: number | undefined,
    request: Extract<SocialRequest, { type: "social-result" }>,
  ): Promise<void> {
    const site = platformLabels[request.platform];
    const may = await api.permissions
      ?.contains({ permissions: ["notifications"] })
      .catch(() => false);
    if (may === true && api.notifications !== undefined) {
      await api.notifications.create(`${notificationPrefix}${String(tabId ?? 0)}`, {
        type: "basic",
        iconUrl: api.runtime.getURL("icons/icon-128.png"),
        title: `Ready to post on ${site}`,
        message: `${request.title ?? "Your post"}: Slopify filled it${request.late === true ? " late, as the browser was closed at its time" : ""}. Check it and press ${site}'s Post yourself.`,
      });
      return;
    }
    // Without the notification permission, the tab itself comes forward.
    if (tabId !== undefined) await api.tabs?.update?.(tabId, { active: true });
  }

  async function onNotificationClick(id: string): Promise<void> {
    if (!id.startsWith(notificationPrefix)) return;
    const tabId = Number(id.slice(notificationPrefix.length));
    if (!Number.isInteger(tabId) || tabId <= 0) return;
    const tab = await api.tabs?.update?.(tabId, { active: true }).catch(() => undefined);
    if (tab?.windowId !== undefined) await api.windows?.update(tab.windowId, { focused: true });
    await api.notifications?.clear?.(id);
  }

  async function answer(
    request: SocialRequest,
    sender: { readonly tab?: { readonly id?: number } },
  ): Promise<SocialAnswer> {
    try {
      switch (request.type) {
        case "social-next":
          return {
            reply: {
              ok: true,
              value: await deps.getJson<ActivePost>(
                `/api/social/ext/next?platform=${request.platform}&projectId=${encodeURIComponent(request.projectId)}`,
                `the post waiting for ${platformLabels[request.platform]}`,
              ),
            },
          };
        case "social-file":
          return {
            reply: {
              ok: true,
              value: base64(
                await deps.getBytes(
                  `/api/social/ext/files/${encodeURIComponent(request.projectId)}/${encodeURIComponent(request.file)}`,
                  "the post's file",
                ),
              ),
            },
          };
        case "social-result": {
          const url =
            request.url !== undefined && linkPatterns[request.platform].test(request.url)
              ? request.url
              : undefined;
          await deps.postJson(
            "/api/social/ext/result",
            {
              projectId: request.projectId,
              platform: request.platform,
              ...(request.item === undefined ? {} : { item: request.item }),
              state: request.state,
              ...(url === undefined ? {} : { url }),
              ...(request.message === undefined ? {} : { message: request.message.slice(0, 2000) }),
              at: new Date(deps.now()).toISOString(),
            },
            "what the fill did",
          );
          if (request.due === true && request.state === "filled")
            await notifyFilled(sender.tab?.id, request);
          return { reply: { ok: true, value: true }, closeTab: request.lookup === true };
        }
        case "social-lookup-done":
          return { reply: { ok: true, value: true }, closeTab: true };
        case "social-sites":
          return { reply: { ok: true, value: await reportSites() } };
      }
    } catch (error) {
      return {
        reply: { ok: false, message: error instanceof Error ? error.message : String(error) },
        closeTab: request.type === "social-result" && request.lookup === true,
      };
    }
  }

  return { answer, checkDue, onAlarm, findLinks, reportSites, onNotificationClick };
}
