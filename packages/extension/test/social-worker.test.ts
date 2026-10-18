import { describe, expect, it, vi } from "vitest";
import type { ExtensionApi, SitePermissions } from "../src/browser.js";
import { allowSite, scriptId, stopSite, syncScripts } from "../src/social/grant.js";
import { siteMatches, siteOrigins } from "../src/social/matches.js";
import { renderSites } from "../src/social/options-sites.js";
import type { DuePost, LinkLookup } from "../src/social/types.js";
import { alarmPrefix, socialWorker } from "../src/social/worker.js";

// A browser that remembers permissions, registered scripts, alarms, tabs and notifications.
function fakeBrowser(options: { granted?: readonly string[]; accept?: boolean } = {}) {
  const origins = new Set(options.granted ?? []);
  const permissions = new Set<string>();
  const scripts = new Map<string, readonly string[]>();
  const store: Record<string, unknown> = {};
  const alarms = new Map<string, number | undefined>();
  const tabs: { url: string; active: boolean }[] = [];
  const notifications: { id: string; title: string; message: string }[] = [];
  const updated: number[] = [];
  const has = (asked: SitePermissions) =>
    (asked.origins ?? []).every((one) => origins.has(one)) &&
    (asked.permissions ?? []).every((one) => permissions.has(one));
  const api = {
    runtime: { getURL: (path: string) => `chrome-extension://id/${path}` },
    storage: {
      local: {
        get: async (keys: readonly string[]) =>
          Object.fromEntries(keys.filter((key) => key in store).map((key) => [key, store[key]])),
        set: async (items: Record<string, unknown>) => {
          Object.assign(store, items);
        },
      },
    },
    alarms: {
      create: (name: string, info: { when?: number }) => alarms.set(name, info.when),
      onAlarm: { addListener: () => {} },
    },
    tabs: {
      create: async (tab: { url: string; active: boolean }) => {
        tabs.push(tab);
        return { id: tabs.length };
      },
      remove: async () => {},
      update: async (id: number) => {
        updated.push(id);
        return { windowId: 1 };
      },
    },
    windows: { update: vi.fn(async () => ({})) },
    permissions: {
      request: vi.fn(async (asked: SitePermissions) => {
        if (options.accept === false) return false;
        for (const one of asked.origins ?? []) origins.add(one);
        for (const one of asked.permissions ?? []) permissions.add(one);
        return true;
      }),
      contains: async (asked: SitePermissions) => has(asked),
      remove: async (asked: SitePermissions) => {
        for (const one of asked.origins ?? []) origins.delete(one);
        return true;
      },
    },
    scripting: {
      registerContentScripts: vi.fn(
        async (list: readonly { id: string; matches: readonly string[] }[]) => {
          for (const one of list) {
            if (scripts.has(one.id)) throw new Error(`Duplicate script ID '${one.id}'`);
            scripts.set(one.id, one.matches);
          }
        },
      ),
      getRegisteredContentScripts: async () => [...scripts.keys()].map((id) => ({ id })),
      unregisterContentScripts: async (filter?: { ids?: readonly string[] }) => {
        for (const id of filter?.ids ?? []) scripts.delete(id);
      },
    },
    notifications: {
      create: async (id: string, note: { title: string; message: string }) => {
        notifications.push({ id, title: note.title, message: note.message });
        return id;
      },
      onClicked: { addListener: () => {} },
      clear: async () => true,
    },
  } as unknown as ExtensionApi;
  return { api, origins, permissions, scripts, store, alarms, tabs, notifications, updated };
}

const now = Date.parse("2026-10-20T19:50:00Z");
function worker(
  browser: ReturnType<typeof fakeBrowser>,
  answers: Record<string, unknown> = {},
  paired = true,
) {
  const posted: { path: string; body: unknown }[] = [];
  const got: string[] = [];
  const social = socialWorker({
    api: browser.api,
    paired: async () => paired,
    getJson: async <T>(path: string) => {
      got.push(path);
      const route = path.split("?")[0] ?? path;
      if (!(route in answers)) throw new Error("Slopify answered 404");
      return answers[route] as T;
    },
    postJson: async (path, body) => {
      posted.push({ path, body });
      return {};
    },
    getBytes: async () => new TextEncoder().encode("png").buffer as ArrayBuffer,
    now: () => now,
  });
  return { social, posted, got };
}

const due = (platform: DuePost["platform"], at: string, late = false): DuePost => ({
  projectId: "p1",
  projectTitle: "The Fox",
  platform,
  at,
  late,
  composeUrl:
    platform === "reddit"
      ? "https://www.reddit.com/r/fantasy/submit?title=Fox"
      : "https://www.instagram.com/",
});

describe("site access", () => {
  it("asks for the site only on Allow, then registers its content script once", async () => {
    const browser = fakeBrowser();
    expect(await allowSite(browser.api, "instagram")).toBe(true);
    expect(browser.api.permissions?.request).toHaveBeenCalledWith({
      origins: ["https://www.instagram.com/*"],
      permissions: ["notifications"],
    });
    expect([...browser.scripts.keys()]).toEqual([scriptId("instagram")]);
    // Again (startup, another change): nothing registered twice.
    expect(await syncScripts(browser.api)).toEqual(["instagram"]);
    expect(browser.api.scripting?.registerContentScripts).toHaveBeenCalledTimes(1);
  });

  it("asks a site with a scheduler for its pages alone", async () => {
    const browser = fakeBrowser();
    await allowSite(browser.api, "x");
    expect(browser.api.permissions?.request).toHaveBeenCalledWith({ origins: ["https://x.com/*"] });
  });

  it("registers nothing when the person declines, and unregisters a site taken back", async () => {
    const declined = fakeBrowser({ accept: false });
    expect(await allowSite(declined.api, "tiktok")).toBe(false);
    expect(declined.scripts.size).toBe(0);
    const browser = fakeBrowser();
    await allowSite(browser.api, "tiktok");
    await stopSite(browser.api, "tiktok");
    expect(browser.scripts.size).toBe(0);
    // Taken back in the browser's own settings: the next sync unregisters it.
    await allowSite(browser.api, "x");
    browser.origins.clear();
    expect(await syncScripts(browser.api)).toEqual([]);
    expect(browser.scripts.size).toBe(0);
  });

  it("the options list allows a site from its button and tells the worker", async () => {
    const browser = fakeBrowser();
    const list = document.createElement("ul");
    document.body.append(list);
    const send = vi.fn(async () => ({ ok: true }));
    await renderSites(list, browser.api, send);
    const buttons = [...list.querySelectorAll("button")].map((one) => one.textContent);
    expect(buttons).toEqual([
      "Allow posting on X",
      "Allow posting on LinkedIn",
      "Allow posting on Instagram",
      "Allow posting on TikTok",
      "Allow posting on Reddit",
      "Allow posting on Bluesky",
    ]);
    (list.querySelector('button[data-site="bluesky"]') as HTMLButtonElement).click();
    await vi.waitFor(() =>
      expect(list.querySelector('button[data-site="bluesky"]')?.textContent).toBe(
        "Stop posting on Bluesky",
      ),
    );
    expect(send).toHaveBeenCalledWith({ type: "social-sites" });
    expect(browser.scripts.has("slopify-social-bluesky")).toBe(true);
  });
});

describe("the posting worker", () => {
  it("does nothing on a site the person hasn't allowed, or unpaired", async () => {
    const browser = fakeBrowser();
    const { social } = worker(browser, {
      "/api/social/ext/due": { posts: [due("instagram", "2026-10-20T19:58:00Z")] },
    });
    expect(await social.checkDue()).toBe(0);
    expect(browser.alarms.size).toBe(0);
    const unpaired = worker(fakeBrowser({ granted: siteMatches.instagram }), {}, false);
    expect(await unpaired.social.checkDue()).toBe(0);
    expect(unpaired.got).toEqual([]);
  });

  it("sets an alarm at each due post's fill time, and opens its form in a background tab", async () => {
    const browser = fakeBrowser({ granted: [...siteMatches.instagram, ...siteMatches.reddit] });
    const { social } = worker(browser, {
      "/api/social/ext/due": {
        posts: [
          due("instagram", "2026-10-20T19:58:00Z"),
          due("reddit", "2026-10-20T08:00:00Z", true),
        ],
      },
    });
    expect(await social.checkDue()).toBe(2);
    expect(browser.alarms.get(`${alarmPrefix}p1:instagram`)).toBe(
      Date.parse("2026-10-20T19:58:00Z"),
    );
    // A late one (the browser was closed at its time): at once.
    expect(browser.alarms.get(`${alarmPrefix}p1:reddit`)).toBe(now + 1000);
    expect(await social.onAlarm(`${alarmPrefix}p1:instagram`)).toBe(true);
    expect(await social.onAlarm(`${alarmPrefix}p1:reddit`)).toBe(true);
    expect(browser.tabs).toEqual([
      { url: "https://www.instagram.com/#slopify-post=p1:instagram&due=1", active: false },
      {
        url: "https://www.reddit.com/r/fantasy/submit?title=Fox#slopify-post=p1:reddit&due=1&late=1",
        active: false,
      },
    ]);
    // An alarm again within half an hour: not opened twice.
    expect(await social.onAlarm(`${alarmPrefix}p1:instagram`)).toBe(false);
    expect(await social.onAlarm("slopify-ab-tests")).toBe(false);
  });

  it("an older Slopify without posting is left alone", async () => {
    const browser = fakeBrowser({ granted: siteOrigins.map((origin) => `${origin}/*`) });
    const { social } = worker(browser, {});
    expect(await social.checkDue()).toBe(0);
    expect(await social.findLinks()).toBe(0);
    expect(browser.tabs).toEqual([]);
  });

  it("reports a fill, and notifies when a due post is filled", async () => {
    const browser = fakeBrowser({ granted: siteMatches.bluesky });
    browser.permissions.add("notifications");
    const { social, posted } = worker(browser);
    const answer = await social.answer(
      {
        type: "social-result",
        projectId: "p1",
        platform: "bluesky",
        state: "filled",
        due: true,
        late: true,
        title: "The Fox",
        url: "https://evil.example/post/1",
      },
      { tab: { id: 7 } },
    );
    expect(answer.reply.ok).toBe(true);
    expect(posted).toEqual([
      {
        path: "/api/social/ext/result",
        body: {
          projectId: "p1",
          platform: "bluesky",
          state: "filled",
          at: new Date(now).toISOString(),
        },
      },
    ]);
    expect(browser.notifications).toEqual([
      {
        id: "slopify-post-tab:7",
        title: "Ready to post on Bluesky",
        message:
          "The Fox: Slopify filled it late, as the browser was closed at its time. Check it and press Bluesky's Post yourself.",
      },
    ]);
    await social.onNotificationClick("slopify-post-tab:7");
    expect(browser.updated).toEqual([7]);
  });

  it("brings the tab forward when notifications aren't allowed", async () => {
    const browser = fakeBrowser({ granted: siteMatches.reddit });
    const { social } = worker(browser);
    await social.answer(
      { type: "social-result", projectId: "p1", platform: "reddit", state: "filled", due: true },
      { tab: { id: 3 } },
    );
    expect(browser.notifications).toEqual([]);
    expect(browser.updated).toEqual([3]);
  });

  it("opens each profile page to find a link, at most every six hours, and closes it after", async () => {
    const browser = fakeBrowser({ granted: siteMatches.x });
    const lookup: LinkLookup = {
      projectId: "p1",
      platform: "x",
      profileUrl: "https://x.com/me",
      start: "The fox learns",
    };
    const { social } = worker(browser, { "/api/social/ext/find-links": { posts: [lookup] } });
    expect(await social.findLinks()).toBe(1);
    expect(await social.findLinks()).toBe(0);
    const url = new URL(browser.tabs[0]?.url ?? "");
    expect(url.pathname).toBe("/me");
    expect(JSON.parse(decodeURIComponent(url.hash.replace("#slopify-find=", "")))).toEqual({
      projectId: "p1",
      platform: "x",
      start: "The fox learns",
    });
    const found = await social.answer(
      {
        type: "social-result",
        projectId: "p1",
        platform: "x",
        state: "posted",
        url: "https://x.com/me/status/1",
        lookup: true,
      },
      { tab: { id: 1 } },
    );
    expect(found.closeTab).toBe(true);
    expect((await social.answer({ type: "social-lookup-done" }, {})).closeTab).toBe(true);
  });

  it("claims only the post of the project whose tab Slopify opened", async () => {
    const browser = fakeBrowser({ granted: siteMatches.x });
    const { social, got } = worker(browser, { "/api/social/ext/next": { waiting: 0 } });
    const next = await social.answer(
      { type: "social-next", platform: "x", projectId: "p 1" },
      { tab: { id: 3 } },
    );
    expect(next.reply.ok).toBe(true);
    expect(got).toEqual(["/api/social/ext/next?platform=x&projectId=p%201"]);
  });

  it("hands a file over as base64 and tells Slopify the allowed sites", async () => {
    const browser = fakeBrowser({ granted: siteMatches.tiktok });
    const { social, posted } = worker(browser);
    const file = await social.answer({ type: "social-file", projectId: "p1", file: "pic-1" }, {});
    expect(file.reply).toEqual({ ok: true, value: btoa("png") });
    await social.answer({ type: "social-sites" }, {});
    expect(posted).toEqual([{ path: "/api/social/ext/sites", body: { sites: ["tiktok"] } }]);
  });
});
