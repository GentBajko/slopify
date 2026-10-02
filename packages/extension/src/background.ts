import { browserApi } from "./browser.js";
import type {
  ActivePack,
  FillPayload,
  PackItem,
  WaitingAbTest,
  WorkerAnswer,
  WorkerRequest,
} from "./pack.js";

// The background worker: the only part of the extension that talks to Slopify. It keeps the
// Slopify address and the pairing token, reads the chosen upload pack and its thumbnails, and
// hands them to the Studio page. It only reads; it never sends Slopify anything but the token.

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

// ---- A/B tests that wait for their videos to be public ----------------------------------
// Studio tests only public videos, and a scheduled one is private until its time. Every 15
// minutes (and when the browser starts) the worker asks Slopify for the waiting tests, checks
// each video with YouTube's public oEmbed (which answers only for a public or unlisted video,
// with no sign-in), and opens a public one's Details page in a background tab, where the
// Studio page script sets the test and reports back; the tab is then closed.

const opened = "abOpened";
// A tab opened for a test is not opened again for this long, in case its page never reports.
const retryMs = 30 * 60 * 1000;

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

async function waitingTests(): Promise<readonly WaitingAbTest[]> {
  const current = await paired();
  const response = await call("/api/studio/ext/ab-tests", current);
  if (!response.ok) throw new Error(await failure(response, "the waiting A/B tests"));
  return ((await response.json()) as { tests: readonly WaitingAbTest[] }).tests;
}

async function checkAbTests(): Promise<void> {
  if (api.tabs === undefined || (await pairing()) === undefined) return;
  const tests = await waitingTests().catch(() => []);
  const stored = await api.storage.local.get([opened]);
  const times = (stored[opened] ?? {}) as Record<string, number>;
  const now = Date.now();
  for (const test of tests) {
    if (now - (times[test.videoId] ?? 0) < retryMs) continue;
    if (!(await isPublic(test.videoId))) continue;
    times[test.videoId] = now;
    await api.storage.local.set({ [opened]: times });
    await api.tabs.create({
      url: `https://studio.youtube.com/video/${test.videoId}/edit#slopify-ab`,
      active: false,
    });
  }
}

// The Details page asks for its test: the item and its thumbnails' bytes.
async function abTest(videoId: string): Promise<FillPayload> {
  const current = await paired();
  const test = (await waitingTests()).find((one) => one.videoId === videoId);
  if (test === undefined)
    throw new Error("This video's A/B test is no longer waiting in Slopify, so nothing was set.");
  const thumbnails = await thumbnailsOf(current, test.projectId, test.item);
  return { projectId: test.projectId, item: test.item, thumbnails };
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
    if (request.type === "ab-test") return { ok: true, value: await abTest(request.videoId) };
    if (request.type === "ab-result") {
      await post(
        "/api/studio/ext/ab-tests/result",
        {
          projectId: request.projectId,
          short: request.short,
          ok: request.ok,
          message: request.message,
        },
        "the A/B test's result",
      );
      return { ok: true, value: true };
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
    if (request.type === "ab-result" && tab !== undefined) void api.tabs?.remove(tab);
  });
  // The answer comes later.
  return true;
});

// The toolbar button opens the pairing page.
api.action?.onClicked.addListener(() => {
  void api.runtime.openOptionsPage();
});

api.alarms?.onAlarm.addListener((alarm) => {
  if (alarm.name === "slopify-ab-tests") void checkAbTests();
});
const schedule = (): void => {
  api.alarms?.create("slopify-ab-tests", { periodInMinutes: 15, delayInMinutes: 1 });
};
api.runtime.onInstalled.addListener(schedule);
api.runtime.onStartup.addListener(() => {
  schedule();
  void checkAbTests();
});
