import { browserApi } from "./browser.js";
import type {
  ActivePack,
  FillPayload,
  PackItem,
  WaitingTask,
  WorkerAnswer,
  WorkerRequest,
} from "./pack.js";

// The background worker: the only part of the extension that talks to Slopify. It keeps the
// Slopify address and the pairing token, reads upload packs and their files and hands them to
// the Studio pages, and reports back what happened there: links, confirmed uploads, task
// results and Studio's numbers. Every 15 minutes it opens the tabs for waiting tasks.

const api = browserApi();

interface Pairing {
  readonly base: string;
  readonly token: string;
}

async function pairing(): Promise<Pairing | undefined> {
  const stored = await api.storage.local.get(["base", "token"]);
  return typeof stored.base === "string" && typeof stored.token === "string"
    ? { base: stored.base, token: stored.token }
    : undefined;
}

// A problem+json body's detail, else a sentence about the status.
async function failure(response: Response, what: string): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string") return body.detail;
  } catch {
    // Not JSON: fall through.
  }
  return `Slopify answered ${String(response.status)} when asked for ${what}. Check Slopify is running, then try again.`;
}

async function call(path: string, current: Pairing): Promise<Response> {
  try {
    return await fetch(`${current.base}${path}`, {
      headers: { authorization: `Bearer ${current.token}` },
    });
  } catch {
    throw new Error(
      `Couldn't reach Slopify at ${current.base}. Start Slopify, check the address in the extension's options, then try again.`,
    );
  }
}

function base64(bytes: ArrayBuffer): string {
  let binary = "";
  const view = new Uint8Array(bytes);
  for (let at = 0; at < view.length; at += 0x8000)
    binary += String.fromCharCode(...view.subarray(at, at + 0x8000));
  return btoa(binary);
}

async function paired(): Promise<Pairing> {
  const current = await pairing();
  if (current === undefined)
    throw new Error(
      "The extension isn't paired with Slopify yet. Open the extension's options, paste the pairing token from Slopify's Settings → YouTube Studio and press Pair.",
    );
  return current;
}

// The item waiting next in Slopify, as Slopify sends it.
async function activePack(): Promise<ActivePack> {
  const current = await paired();
  const response = await call("/api/studio/ext/pack", current);
  if (!response.ok) throw new Error(await failure(response, "the upload pack"));
  return (await response.json()) as ActivePack;
}

async function thumbnailsOf(
  current: Pairing,
  projectId: string,
  item: PackItem,
): Promise<FillPayload["thumbnails"]> {
  const thumbnails = [];
  for (const file of item.thumbnails) {
    const got = await call(`/api/studio/ext/files/${projectId}/${file.asset}`, current);
    if (!got.ok) throw new Error(await failure(got, `thumbnail ${file.filename}`));
    thumbnails.push({
      filename: file.filename,
      contentType: file.contentType,
      base64: base64(await got.arrayBuffer()),
    });
  }
  return thumbnails;
}

async function payload(): Promise<FillPayload> {
  const current = await paired();
  const { pack, item, waiting } = await activePack();
  const thumbnails = await thumbnailsOf(current, pack.projectId, item);
  return { projectId: pack.projectId, waiting, item, thumbnails };
}

async function post(path: string, body: unknown, what: string): Promise<unknown> {
  const current = await paired();
  let response: Response;
  try {
    response = await fetch(`${current.base}${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${current.token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(`Couldn't reach Slopify at ${current.base} for ${what}. Start Slopify.`);
  }
  if (!response.ok) throw new Error(await failure(response, what));
  return response.json();
}

// ---- YouTube-side tasks ------------------------------------------------------------------
// Slopify keeps what waits on YouTube's side; the worker carries it out. Every 15 minutes (and
// when the browser starts) it asks Slopify for the waiting tasks and opens each one's page in a
// background tab, where the page script does it and reports back; the tab is then closed:
// - a confirmed upload's Details touches (a short's related video once the long video is public,
//   the long video's end screen and captions);
// - a pinned comment, once the video is public (YouTube's public oEmbed answers only for a
//   public or unlisted video, with no sign-in);
// - once a day, each known video's Analytics, for its numbers.

const opened = "tasksOpened";
// A tab opened for a task is not opened again for this long, in case its page never reports.
const retryMs = 30 * 60 * 1000;
const statsEveryMs = 24 * 60 * 60 * 1000;
const checksEveryMs = 2 * 60 * 60 * 1000;
// Whether the videos Slopify takes to be on YouTube still exist: every two hours, and when the
// popup opens if the last check is older than this.
const goneKey = "goneAt";
const goneEveryMs = 2 * 60 * 60 * 1000;
const goneOnPopupMs = 10 * 60 * 1000;

// A Studio tab in the background reads each video's edit page (`content.ts`'s `runGone`).
async function checkGone(olderThanMs: number): Promise<void> {
  if (api.tabs === undefined || (await pairing()) === undefined) return;
  const stored = await api.storage.local.get([goneKey]);
  const at = typeof stored[goneKey] === "number" ? stored[goneKey] : 0;
  if (Date.now() - at < olderThanMs) return;
  await api.storage.local.set({ [goneKey]: Date.now() });
  await api.tabs.create({ url: "https://studio.youtube.com/#slopify-gone", active: false });
}

async function isPublic(videoId: string): Promise<boolean> {
  try {
    const response = await fetch(
      `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`,
    );
    return response.ok;
  } catch {
    return false;
  }
}

async function getJson<T>(path: string, what: string): Promise<T> {
  const current = await paired();
  const response = await call(path, current);
  if (!response.ok) throw new Error(await failure(response, what));
  return (await response.json()) as T;
}

const query = (projectId: string, short: number | null) =>
  `p=${encodeURIComponent(projectId)}&s=${String(short ?? 0)}`;

async function checkTasks(): Promise<void> {
  if (api.tabs === undefined || (await pairing()) === undefined) return;
  const tasks = await getJson<{
    finish: readonly WaitingTask[];
    comments: readonly WaitingTask[];
    checks?: boolean;
  }>("/api/studio/ext/tasks", "the waiting tasks").catch(() => ({
    finish: [],
    comments: [],
    checks: false,
  }));
  const stored = await api.storage.local.get([opened]);
  const times = (stored[opened] ?? {}) as Record<string, number>;
  const now = Date.now();
  const open = async (key: string, url: string) => {
    if (now - (times[key] ?? 0) < retryMs) return;
    times[key] = now;
    await api.storage.local.set({ [opened]: times });
    await api.tabs?.create({ url, active: false });
  };
  for (const task of tasks.finish) {
    // A short's related video can only be a public video.
    if (task.item.relatedVideoId !== undefined && !(await isPublic(task.item.relatedVideoId)))
      continue;
    await open(
      `finish:${task.videoId}`,
      `https://studio.youtube.com/video/${task.videoId}/edit#slopify-finish&${query(task.projectId, task.short)}`,
    );
  }
  for (const task of tasks.comments) {
    if (!(await isPublic(task.videoId))) continue;
    await open(
      `comment:${task.videoId}`,
      `https://www.youtube.com/watch?v=${task.videoId}#slopify-comment&${query(task.projectId, task.short)}`,
    );
  }
  // A scheduled video whose checks aren't read yet: the Content list, in the background, every
  // two hours until they are (the page reads each row's Restrictions and closes itself).
  const channel = (await api.storage.local.get(["studioChannel"])).studioChannel;
  if (
    tasks.checks === true &&
    typeof channel === "string" &&
    now - (times.checks ?? 0) > checksEveryMs
  ) {
    times.checks = now;
    await api.storage.local.set({ [opened]: times });
    await api.tabs?.create({
      url: `https://studio.youtube.com/channel/${channel}/videos/upload#slopify-checks`,
      active: false,
    });
  }
  await checkGone(goneEveryMs);
  await sweepStats();
}

// Once a day: each known video's Analytics, one tab after another (the Reach tab, then the page
// moves itself to Engagement, then reports and the worker opens the next).
const statsKey = "statsSweep";
interface StatsSweep {
  readonly at: number;
  readonly left: readonly { projectId: string; short: number | null; videoId: string }[];
}

// Once a day, each channel's Analytics view (Settings in Slopify: Channels → YouTube), its end
// moved to today, is opened in the background to export (`content.ts`'s `runExport`).
const exportKey = "exportAt";

// The view's end moved to the end of today: Studio counts days from midnight Pacific time and
// keeps the end exclusive; the start stays as saved.
export function viewToday(url: string, now: Date): string {
  const parsed = new URL(url);
  const [start] = (parsed.searchParams.get("time_period") ?? "").split(",");
  const pacific = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [year, month, day] = pacific.split("-").map(Number);
  // Midnight Pacific of the next day: 07:00 or 08:00 UTC, whichever names midnight there.
  const next = Date.UTC(year ?? 1970, (month ?? 1) - 1, (day ?? 1) + 1, 7);
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Los_Angeles",
      hour: "numeric",
      hourCycle: "h23",
    }).format(new Date(next)),
  );
  // 07:00 UTC is midnight in summer time (PDT) and 23:00 the day before in winter (PST).
  const end = next + ((24 - hour) % 24) * 3_600_000;
  if (start !== undefined && start !== "")
    parsed.searchParams.set("time_period", `${start},${String(end)}`);
  return parsed.href;
}

async function exportViews(force = false): Promise<number> {
  const stored = await api.storage.local.get([exportKey]);
  const at = typeof stored[exportKey] === "number" ? stored[exportKey] : 0;
  if (!force && Date.now() - at < statsEveryMs) return 0;
  const { views } = await getJson<{ views: readonly { channelId: string; url: string }[] }>(
    "/api/studio/ext/export-views",
    "the Analytics views to export",
  ).catch(() => ({ views: [] }));
  if (views.length === 0) return 0;
  await api.storage.local.set({ [exportKey]: Date.now() });
  for (const view of views)
    await api.tabs?.create({
      url: `${viewToday(view.url, new Date())}#slopify-export&c=${encodeURIComponent(view.channelId)}`,
      active: false,
    });
  return views.length;
}

async function sweepStats(force = false): Promise<number> {
  await exportViews(force);
  const stored = await api.storage.local.get([statsKey]);
  const sweep = stored[statsKey] as StatsSweep | undefined;
  if (!force && sweep !== undefined && Date.now() - sweep.at < statsEveryMs) return 0;
  const { videos } = await getJson<{
    videos: readonly { projectId: string; short: number | null; videoId: string }[];
  }>("/api/studio/ext/known-videos", "the videos on YouTube").catch(() => ({ videos: [] }));
  // Nothing to read (Slopify not reachable, or no video known yet): the next check tries again,
  // rather than waiting a day.
  if (videos.length === 0) return 0;
  await api.storage.local.set({
    [statsKey]: { at: Date.now(), left: videos } satisfies StatsSweep,
  });
  await nextStats();
  return videos.length;
}

// The Analytics tab being read, and when it opened. A video Studio can't open (deleted in
// Studio, say) never reports, which used to stop the day's sweep there: past `statsTabMs` the
// tab is closed and the next video opens.
const statsTabKey = "statsTab";
const statsTabMs = 4 * 60 * 1000;

async function nextStats(): Promise<void> {
  const stored = await api.storage.local.get([statsKey]);
  const sweep = stored[statsKey] as StatsSweep | undefined;
  const next = sweep?.left[0];
  await api.storage.local.set({ [statsTabKey]: null });
  if (sweep === undefined || next === undefined) return;
  await api.storage.local.set({ [statsKey]: { ...sweep, left: sweep.left.slice(1) } });
  const tab = await api.tabs?.create({
    url: `https://studio.youtube.com/video/${next.videoId}/analytics/tab-reach_viewers/period-default#slopify-stats=1&${query(next.projectId, next.short)}`,
    active: false,
  });
  if (tab?.id !== undefined)
    await api.storage.local.set({ [statsTabKey]: { id: tab.id, at: Date.now() } });
}

// Closes an Analytics tab that hasn't reported in time and moves the sweep on.
async function unstickStats(): Promise<void> {
  const stored = await api.storage.local.get([statsTabKey]);
  const open = stored[statsTabKey] as { id: number; at: number } | null | undefined;
  if (open == null || Date.now() - open.at < statsTabMs) return;
  await api.tabs?.remove(open.id).catch(() => {});
  await nextStats();
}

// A page opened for one upload asks for it: the item, its thumbnails' and captions' bytes.
async function itemOf(projectId: string, short: number | null): Promise<FillPayload> {
  const current = await paired();
  const pack = await getJson<{ items: readonly PackItem[] }>(
    `/api/studio/ext/packs/${encodeURIComponent(projectId)}`,
    "the upload",
  );
  const item = pack.items.find((one) => (one.short ?? null) === short);
  if (item === undefined) throw new Error("That upload isn't in the project any more.");
  const thumbnails = await thumbnailsOf(current, projectId, item);
  let captions: FillPayload["captions"];
  if (item.captions !== undefined) {
    const got = await call(`/api/studio/ext/files/${projectId}/${item.captions.asset}`, current);
    if (got.ok)
      captions = { filename: item.captions.filename, base64: base64(await got.arrayBuffer()) };
  }
  return { projectId, item, thumbnails, ...(captions === undefined ? {} : { captions }) };
}

// Tells Slopify the page filled this item, so it leaves the queue; answers how many still wait.
async function filled(projectId: string, short: number | null): Promise<number> {
  const current = await pairing();
  if (current === undefined) return 0;
  let response: Response;
  try {
    response = await fetch(`${current.base}/api/studio/ext/filled`, {
      method: "POST",
      headers: { authorization: `Bearer ${current.token}`, "content-type": "application/json" },
      body: JSON.stringify({ projectId, short }),
    });
  } catch {
    throw new Error(
      `Couldn't reach Slopify at ${current.base} to mark this upload as filled, so the next upload dialog may be filled with it again. Remove it under Waiting for Studio in Slopify's Prepare upload.`,
    );
  }
  if (!response.ok) throw new Error(await failure(response, "marking the upload as filled"));
  const body = (await response.json()) as { waiting?: unknown };
  return typeof body.waiting === "number" ? body.waiting : 0;
}

async function pair(base: string, token: string): Promise<string> {
  const trimmed = base.trim().replace(/\/+$/, "");
  if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(trimmed))
    throw new Error(
      "The Slopify address must be this computer, like http://127.0.0.1:6969. Copy it from the browser tab Slopify is open in.",
    );
  let response: Response;
  try {
    response = await fetch(`${trimmed}/api/studio/ext/pair`, {
      method: "POST",
      headers: { authorization: `Bearer ${token.trim()}` },
    });
  } catch {
    throw new Error(`Couldn't reach Slopify at ${trimmed}. Start Slopify and check the address.`);
  }
  if (!response.ok) throw new Error(await failure(response, "pairing"));
  await api.storage.local.set({ base: trimmed, token: token.trim() });
  return trimmed;
}

async function answer(request: WorkerRequest): Promise<WorkerAnswer<unknown>> {
  try {
    if (request.type === "pair")
      return { ok: true, value: await pair(request.base, request.token) };
    if (request.type === "status") return { ok: true, value: (await pairing())?.base ?? null };
    if (request.type === "filled")
      return { ok: true, value: await filled(request.projectId, request.short) };
    if (request.type === "pack") return { ok: true, value: await activePack() };
    if (request.type === "video")
      return {
        ok: true,
        value: await post(
          "/api/studio/ext/video",
          { projectId: request.projectId, short: request.short, videoId: request.videoId },
          "the uploaded video",
        ),
      };
    if (request.type === "video-done")
      return {
        ok: true,
        value: await post(
          "/api/studio/ext/video/done",
          { projectId: request.projectId, short: request.short, videoId: request.videoId },
          "the finished upload",
        ),
      };
    if (request.type === "item")
      return { ok: true, value: await itemOf(request.projectId, request.short) };
    if (request.type === "upload-all") {
      const { url, count } = (await post(
        "/api/studio/ext/upload-all",
        { projectId: request.projectId },
        "the shorts",
      )) as { url: string; count: number };
      // The upload dialogs take them one after another until they are done.
      await api.storage.local.set({ uploadAllUntil: Date.now() + 3 * 60 * 60 * 1000 });
      await api.tabs?.create({ url, active: true });
      return { ok: true, value: count };
    }
    if (request.type === "task-result") {
      await post(
        "/api/studio/ext/task-result",
        {
          task: request.task,
          projectId: request.projectId,
          short: request.short,
          ok: request.ok,
          message: request.message,
        },
        "the task's result",
      );
      return { ok: true, value: true };
    }
    if (request.type === "stats") {
      const m = request.metrics;
      await post(
        "/api/studio/ext/stats",
        {
          projectId: request.projectId,
          short: request.short,
          videoId: request.videoId,
          ...(m.VIDEO_THUMBNAIL_IMPRESSIONS === undefined
            ? {}
            : { impressions: m.VIDEO_THUMBNAIL_IMPRESSIONS }),
          ...(m.VIDEO_THUMBNAIL_IMPRESSIONS_VTR === undefined
            ? {}
            : { ctr: m.VIDEO_THUMBNAIL_IMPRESSIONS_VTR }),
          ...(m.EXTERNAL_VIEWS === undefined ? {} : { views: m.EXTERNAL_VIEWS }),
          ...(m.AVERAGE_WATCH_TIME === undefined
            ? {}
            : { averageViewSeconds: m.AVERAGE_WATCH_TIME }),
          ...(m.EXTERNAL_WATCH_TIME === undefined ? {} : { watchHours: m.EXTERNAL_WATCH_TIME }),
          ...(request.abVariants === undefined ? {} : { abVariants: request.abVariants }),
        },
        "the video's numbers",
      );
      return { ok: true, value: true };
    }
    if (request.type === "report")
      return {
        ok: true,
        value: await post(
          "/api/studio/ext/report",
          { channelId: request.channelId, zippedData: request.zippedData },
          "Studio's export",
        ),
      };
    if (request.type === "export-done") return { ok: true, value: true };
    if (request.type === "gone-list") {
      const { videos } = await getJson<{ videos: unknown }>(
        "/api/studio/ext/recorded-videos",
        "the videos on YouTube",
      );
      return { ok: true, value: videos };
    }
    if (request.type === "gone")
      return {
        ok: true,
        value:
          request.videos.length === 0
            ? { forgotten: 0 }
            : await post("/api/studio/ext/gone", { videos: request.videos }, "the deleted videos"),
      };
    if (request.type === "backfill")
      return {
        ok: true,
        value: await post("/api/studio/ext/backfill", { videos: request.videos }, "Studio's list"),
      };
    if (request.type === "stats-now") {
      // Read Studio now also checks at once which videos were deleted there.
      await checkGone(0);
      return { ok: true, value: await sweepStats(true) };
    }
    if (request.type === "ready") {
      void checkGone(goneOnPopupMs);
      const current = await paired();
      const response = await call("/api/studio/ext/ready", current);
      if (!response.ok) throw new Error(await failure(response, "the projects ready to upload"));
      return { ok: true, value: ((await response.json()) as { projects: unknown }).projects };
    }
    if (request.type === "upload") {
      const { url } = (await post(
        "/api/studio/ext/upload",
        { projectId: request.projectId, short: request.short },
        "the upload",
      )) as { url: string };
      await api.tabs?.create({ url, active: true });
      return { ok: true, value: url };
    }
    return { ok: true, value: await payload() };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

api.runtime.onMessage.addListener((message, sender, respond) => {
  const request = message as WorkerRequest;
  void answer(request).then((reply) => {
    respond(reply);
    // The test's tab did its work: close it.
    const tab = sender.tab?.id;
    if (tab === undefined) return;
    if (request.type === "task-result") void api.tabs?.remove(tab);
    if (request.type === "export-done") void api.tabs?.remove(tab);
    if (request.type === "gone") void api.tabs?.remove(tab);
    if (request.type === "backfill" && request.close === true) void api.tabs?.remove(tab);
    if (request.type === "stats" && request.last) {
      void api.tabs?.remove(tab);
      void nextStats();
    }
  });
  // The answer comes later.
  return true;
});

// The toolbar button opens the pairing page.
api.action?.onClicked.addListener(() => {
  void api.runtime.openOptionsPage();
});

api.alarms?.onAlarm.addListener((alarm) => {
  if (alarm.name === "slopify-ab-tests") void checkTasks();
  if (alarm.name === "slopify-stats-watch") void unstickStats();
});
const schedule = (): void => {
  api.alarms?.create("slopify-ab-tests", { periodInMinutes: 15, delayInMinutes: 1 });
  api.alarms?.create("slopify-stats-watch", { periodInMinutes: 1, delayInMinutes: 1 });
};
api.runtime.onInstalled.addListener(schedule);
api.runtime.onStartup.addListener(() => {
  schedule();
  void checkTasks();
});
