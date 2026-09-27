import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import type { Log } from "../../kernel/log.js";
import { ensureDirs, layout } from "../../kernel/paths.js";
import type { RunConfig } from "../../slices/admission/model.js";
import { insertProject } from "../../slices/admission/repo.js";
import { outputPath } from "../../slices/storage/layout.js";
import type { Output, OutputMeta, OutputRole } from "../../slices/storage/model.js";
import { insertOutput } from "../../slices/storage/repo.js";
import type { UploadPack } from "../../slices/studio/model.js";
import { createHub } from "../events/hub.js";
import { createApp } from "./app.js";

const clock = fixedClock("2026-09-27T10:00:00.000Z");
const log: Log = { write: (): void => {} };
const extension = "chrome-extension://abcdefghijklmnopabcdefghijklmnop";

const config: RunConfig = {
  title: "The Fox of Cliffside",
  format: "16:9",
  imagePrompts: [],
  values: {},
  rendered: {},
  provided: {},
  silenceGapSeconds: 0,
  imageSeconds: 15,
  zoomPercent: 22.5,
  motionStyle: "zoom",
  edgeSilenceSeconds: 0,
  youtubeDescription: true,
  thumbnailCount: 3,
  shorts: { enabled: true, count: 1, minSeconds: 60, maxSeconds: 120 },
  sources: {
    research: "off",
    article: "provide",
    audio: "generate",
    images: "generate",
    thumbnail: "from_prompt",
    video: "generate",
  },
};

function harness(project: RunConfig = config, extensionDist?: string) {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-studio-")));
  ensureDirs(paths, { mode: 0o700 });
  const db = openDb(paths.db);
  migrate(db, clock);
  let n = 0;
  const ids = { next: (): string => `id${String(++n)}` };
  insertProject(db, {
    id: "p1",
    title: project.title,
    format: project.format,
    config: project,
    createdAt: clock.now().toISOString(),
    updatedAt: clock.now().toISOString(),
  });
  const output = (
    role: OutputRole,
    path: string,
    body: string,
    meta: OutputMeta = {},
    stageKind: Output["stageKind"] = "video",
  ): void => {
    const target = outputPath(paths, "p1", path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, body);
    insertOutput(db, {
      id: ids.next(),
      projectId: "p1",
      stageKind,
      role,
      path,
      originalFilename: null,
      bytes: Buffer.byteLength(body),
      durationMs: null,
      meta,
      createdAt: clock.now().toISOString(),
    });
  };
  const makeApp = () =>
    createApp({
      db,
      paths,
      hub: createHub({ ids, log }),
      runner: {
        tick: (): void => {},
        settled: async (): Promise<void> => {},
        abortProject: async (): Promise<void> => {},
        abortAll: async (): Promise<void> => {},
      },
      clock,
      ids,
      log,
      version: "1.2.3",
      webDist: join(paths.dataDir, "missing"),
      extensionDist,
      flushSoon: (): void => {},
      probe: () => Promise.resolve({ ran: false, stdout: "" }),
    });
  let app = makeApp();
  const call = (path: string, init: RequestInit = {}) =>
    app.request(`http://127.0.0.1:4545/api/studio${path}`, init);
  // A restart: a new app on the same database, as after quitting Slopify.
  const restart = (): void => {
    app = makeApp();
  };
  return {
    get app() {
      return app;
    },
    call,
    output,
    db,
    paths,
    restart,
  };
}

function finished(output: ReturnType<typeof harness>["output"]): void {
  output("video", "video.mp4", "mp4");
  output(
    "youtube_description",
    "description.txt",
    "A fox learns to fly.\n\n0:00 Intro\n0:40 The Cliff\n1:30 Flight\n\n#fox #cliffs\n",
  );
  output("youtube_tags", "tags.txt", "fox, cliff diving, animal stories\n");
  output("thumbnail", "thumb-1.png", "one", {}, "thumbnail");
  output("thumbnail", "thumb-3.png", "three", { index: 3 }, "thumbnail");
  output("thumbnail", "thumb-2.png", "two", { index: 2 }, "thumbnail");
  output(
    "shorts",
    "shorts.json",
    JSON.stringify({
      shorts: [
        {
          number: 1,
          first: 2,
          last: 5,
          start: 10,
          end: 80,
          title: "The fox jumps",
          description: "Watch the moment it leaps.",
          hashtags: ["#fox", "#shorts"],
        },
      ],
    }),
  );
  output("short_video", "shorts/short-01.mp4", "short", { short: 1, sentences: [2, 5] });
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

describe("the upload pack", () => {
  it("lists every part Studio asks for, in its order, for the video and each short", async () => {
    const { call, output } = harness();
    finished(output);
    await call("/settings/playlist", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ playlist: " Fox tales " }),
    });
    const response = await call("/packs/p1");
    expect(response.status).toBe(200);
    const pack = (await response.json()) as UploadPack;
    expect(pack.missing).toEqual([]);
    const [video, short] = pack.items;
    expect(video).toMatchObject({
      kind: "video",
      title: "The Fox of Cliffside",
      tags: ["fox", "cliff diving", "animal stories"],
      audience: "not_made_for_kids",
      playlist: "Fox tales",
      video: { url: "/files/p1/video", filename: "the-fox-of-cliffside-video.mp4" },
    });
    expect(video?.description).toContain("0:40 The Cliff");
    expect(video?.thumbnails.map((file) => file.asset)).toEqual([
      "thumbnail",
      "thumbnail-2",
      "thumbnail-3",
    ]);
    expect(short).toMatchObject({
      kind: "short",
      short: 1,
      title: "The fox jumps",
      tags: ["fox", "shorts"],
      thumbnails: [],
      video: { asset: "short-video-1" },
    });
    expect(short?.description).toBe(
      "Watch the moment it leaps.\nWatch the full video: [PASTE THE FULL VIDEO LINK HERE]\n\n#fox #shorts",
    );
    // An AI voice and AI images, none of them marked: none of YouTube's three cases.
    expect(video?.alteredContent.altered).toBe(false);
    expect(video?.alteredContent.why).toContain("none of YouTube's three AI use cases applies");
    expect(short?.alteredContent.altered).toBe(false);
    expect(video?.chapterNotice).toBeUndefined();
  });

  it("answers AI use from the marked voice, prompt and footage, and the channel's setting", async () => {
    const { app, call, output } = harness({
      ...config,
      audio: { provider: "elevenlabs", model: "eleven_multilingual_v2", voice: "clone-7" },
      imagePrompts: [{ name: "Studio photo", number: 1 }],
    });
    finished(output);
    const api = (path: string, method: string, body?: unknown) =>
      app.request(`http://127.0.0.1:4545/api${path}`, {
        method,
        headers: { "content-type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    const read = async () => (await (await call("/packs/p1")).json()) as UploadPack;
    expect((await read()).items.map((item) => item.alteredContent.altered)).toEqual([false, false]);

    // Case 1: the narrating voice is marked as imitating a real person.
    const added = await api("/settings/voices", "POST", {
      provider: "elevenlabs",
      name: "Anna clone",
      voiceId: "clone-7",
      languages: ["en"],
    });
    expect(added.status).toBe(201);
    const voice = (await added.json()) as { id: string };
    expect(
      (await api(`/settings/voices/${voice.id}/real-person`, "PUT", { imitatesRealPerson: true }))
        .status,
    ).toBe(204);
    const voices = (await (await api("/settings/voices", "GET")).json()) as {
      voices: { imitatesRealPerson?: boolean }[];
    };
    expect(voices.voices[0]?.imitatesRealPerson).toBe(true);
    let [video, short] = (await read()).items;
    expect(video?.alteredContent.altered).toBe(true);
    expect(video?.alteredContent.why).toContain('the voice "Anna clone"');
    expect(short?.alteredContent.altered).toBe(true);
    await api(`/settings/voices/${voice.id}/real-person`, "PUT", { imitatesRealPerson: false });
    expect((await read()).items[0]?.alteredContent.altered).toBe(false);

    // Case 3: the project's Image prompt is marked photorealistic; the short has its own.
    const prompt = (await (
      await api("/prompts", "POST", { kind: "image", name: "Studio photo", body: "A photo." })
    ).json()) as { id: string };
    expect(
      (await api(`/prompts/${prompt.id}/photorealistic`, "PUT", { photorealistic: true })).status,
    ).toBe(204);
    const listed = (await (await api("/prompts", "GET")).json()) as {
      prompts: { photorealistic?: boolean }[];
    };
    expect(listed.prompts[0]?.photorealistic).toBe(true);
    [video, short] = (await read()).items;
    expect(video?.alteredContent.why).toContain("case 3");
    expect(short?.alteredContent.altered).toBe(false);
    await api(`/prompts/${prompt.id}/photorealistic`, "PUT", { photorealistic: false });

    // Always Yes and Always No win over the rule.
    const set = (value: string) =>
      api("/channels/00000000-0000-4000-8000-000000000001/ai-disclosure", "PUT", {
        aiDisclosure: value,
      });
    expect((await set("yes")).status).toBe(200);
    expect((await read()).items.map((item) => item.alteredContent.altered)).toEqual([true, true]);
    expect((await set("no")).status).toBe(200);
    expect((await read()).items[1]?.alteredContent.why).toContain("Always No");
  });

  it("answers Yes for uploaded clips marked real footage under the Look's overlay", async () => {
    const { call, output } = harness({
      ...config,
      sources: { ...config.sources, audio: "provide", images: "provide" },
      videoEdit: {
        cuts: "narration",
        transition: "cut",
        transitionSeconds: 0.6,
        vignette: "off",
        grain: "off",
        grade: "warm",
        atmosphere: "fog",
        chapterCards: false,
        animate: "off",
        animateEvery: 3,
        animateModel: "",
      },
    });
    finished(output);
    output("image", "images/street.mp4", "clip", {}, "images");
    output("image", "images/still.png", "png", {}, "images");
    const read = async () => (await (await call("/packs/p1")).json()) as UploadPack;
    const before = await read();
    expect(before.footage).toEqual({ clips: 1, real: false });
    expect(before.items[0]?.alteredContent.altered).toBe(false);
    const marked = await call("/packs/p1/real-footage", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ realFootage: true }),
    });
    expect(marked.status).toBe(200);
    const after = (await marked.json()) as UploadPack;
    expect(after.footage).toEqual({ clips: 1, real: true });
    expect(after.items[0]?.alteredContent.why).toContain("the Look's fog overlay");
    // A short shows new pictures, never the clips.
    expect(after.items[1]?.alteredContent.altered).toBe(false);
  });

  it("fits the description's chapters to YouTube's rules and says so", async () => {
    const { call, output } = harness();
    output(
      "youtube_description",
      "description.txt",
      "A fox.\n\n0:02 Intro\n0:40 The Cliff\n0:45 Blink\n1:30 Flight\n\n#fox\n",
    );
    const [video] = ((await (await call("/packs/p1")).json()) as UploadPack).items;
    expect(video?.description).toBe("A fox.\n\n0:00 Intro\n0:45 Blink\n1:30 Flight\n\n#fox");
    expect(video?.chapterNotice).toBe(
      'Chapters adjusted for YouTube: moved the first, "Intro", from 0:02 to 0:00; merged "The Cliff" (5 s) into "Intro".',
    );
  });

  it("names what is missing and how to fix it, and leaves out thumbnails no longer made", async () => {
    const { call, output } = harness({ ...config, thumbnailCount: undefined });
    output("thumbnail", "thumb-1.png", "one", {}, "thumbnail");
    output("thumbnail", "thumb-2.png", "two", { index: 2 }, "thumbnail");
    const pack = (await (await call("/packs/p1")).json()) as UploadPack;
    expect(pack.items[0]?.thumbnails.map((file) => file.asset)).toEqual(["thumbnail"]);
    expect(pack.items[0]?.video).toBeNull();
    expect(pack.missing.join("\n")).toContain("The video isn't made yet");
    expect(pack.missing.join("\n")).toContain("Settings → YouTube Studio");
  });

  it("answers 404 for a project that doesn't exist", async () => {
    const { call } = harness();
    expect((await call("/packs/nope")).status).toBe(404);
  });
});

async function paired(h: ReturnType<typeof harness>): Promise<string> {
  const settings = (await (await h.call("/settings")).json()) as {
    pairing: { token: string; origin: string | null };
  };
  expect(settings.pairing.origin).toBeNull();
  const response = await h.call("/ext/pair", {
    method: "POST",
    headers: { authorization: `Bearer ${settings.pairing.token}`, origin: extension },
  });
  expect(response.status).toBe(200);
  expect(response.headers.get("access-control-allow-origin")).toBe(extension);
  return settings.pairing.token;
}

describe("pairing and CORS", () => {
  it("pairs the extension with the token and then answers only its origin", async () => {
    const h = harness();
    finished(h.output);
    const token = await paired(h);
    expect(await (await h.call("/settings")).json()).toMatchObject({
      pairing: { origin: extension },
    });
    // Nothing chosen yet.
    const before = await h.call("/ext/pack", {
      headers: { authorization: `Bearer ${token}`, origin: extension },
    });
    expect(before.status).toBe(404);
    expect(((await before.json()) as { detail: string }).detail).toContain("Prepare upload");
    expect((await h.call("/packs/p1/choose", json({}))).status).toBe(200);
    const pack = await h.call("/ext/pack", {
      headers: { authorization: `Bearer ${token}`, origin: extension },
    });
    expect(pack.status).toBe(200);
    expect(pack.headers.get("access-control-allow-origin")).toBe(extension);
    expect(await pack.json()).toMatchObject({ item: { kind: "video" } });
    const thumbnail = await h.call("/ext/files/p1/thumbnail-2", {
      headers: { authorization: `Bearer ${token}`, origin: extension },
    });
    expect(thumbnail.status).toBe(200);
    expect(await thumbnail.text()).toBe("two");
    // Only a pack's thumbnails are served, never another file.
    const video = await h.call("/ext/files/p1/video", {
      headers: { authorization: `Bearer ${token}`, origin: extension },
    });
    expect(video.status).toBe(404);
    // A short is chosen by its number, and waits behind the video until it is filled.
    await h.call("/packs/p1/choose", json({ short: 1 }));
    await h.call("/ext/filled", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        origin: extension,
        "content-type": "application/json",
      },
      body: JSON.stringify({ projectId: "p1" }),
    });
    expect(
      await (
        await h.call("/ext/pack", {
          headers: { authorization: `Bearer ${token}`, origin: extension },
        })
      ).json(),
    ).toMatchObject({ item: { kind: "short", short: 1 } });
    expect((await h.call("/packs/p1/choose", json({ short: 7 }))).status).toBe(404);
  });

  it("never answers a web page, a wrong token or another extension", async () => {
    const h = harness();
    finished(h.output);
    const token = await paired(h);
    await h.call("/packs/p1/choose", json({}));
    const page = await h.call("/ext/pack", {
      headers: { authorization: `Bearer ${token}`, origin: "https://evil.example" },
    });
    expect(page.status).toBe(401);
    expect(page.headers.get("access-control-allow-origin")).toBeNull();
    const preflight = await h.call("/ext/pack", {
      method: "OPTIONS",
      headers: { origin: "https://evil.example", "access-control-request-method": "GET" },
    });
    expect(preflight.headers.get("access-control-allow-origin")).toBeNull();
    const other = "chrome-extension://zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz";
    const stranger = await h.call("/ext/pack", {
      headers: { authorization: `Bearer ${token}`, origin: other },
    });
    expect(stranger.status).toBe(401);
    expect(stranger.headers.get("access-control-allow-origin")).toBeNull();
    const wrong = await h.call("/ext/pack", {
      headers: { authorization: "Bearer not-the-token-at-all-000000", origin: extension },
    });
    expect(wrong.status).toBe(401);
    expect(((await wrong.json()) as { detail: string }).detail).toContain(
      "Settings → YouTube Studio",
    );
    // The paired origin's preflight is answered.
    const allowed = await h.call("/ext/pack", {
      method: "OPTIONS",
      headers: { origin: extension, "access-control-request-method": "GET" },
    });
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("access-control-allow-origin")).toBe(extension);
    expect(allowed.headers.get("access-control-allow-headers")).toContain("authorization");
  });

  it("refuses to pair a web page or a wrong token, and forgets the extension on a new token", async () => {
    const h = harness();
    const settings = (await (await h.call("/settings")).json()) as { pairing: { token: string } };
    const page = await h.call("/ext/pair", {
      method: "POST",
      headers: {
        authorization: `Bearer ${settings.pairing.token}`,
        origin: "https://evil.example",
      },
    });
    expect(page.status).toBe(403);
    const wrong = await h.call("/ext/pair", {
      method: "POST",
      headers: { authorization: "Bearer wrong", origin: extension },
    });
    expect(wrong.status).toBe(401);
    const token = await paired(h);
    const reset = await h.call("/settings/pairing", json({}));
    const fresh = (await reset.json()) as { pairing: { token: string; origin: string | null } };
    expect(fresh.pairing.token).not.toBe(token);
    expect(fresh.pairing.origin).toBeNull();
    const old = await h.call("/ext/pack", {
      headers: { authorization: `Bearer ${token}`, origin: extension },
    });
    expect(old.status).toBe(401);
  });

  it("keeps the token and the choice to the Slopify page itself", async () => {
    const h = harness();
    const cross = { headers: { origin: "https://evil.example" } };
    expect((await h.call("/settings", cross)).status).toBe(403);
    const choose = await h.call("/packs/p1/choose", {
      ...json({}),
      headers: { "content-type": "application/json", origin: "https://evil.example" },
    });
    expect(choose.status).toBe(403);
    const same = await h.call("/settings", { headers: { origin: "http://127.0.0.1:4545" } });
    expect(same.status).toBe(200);
  });
});

describe("the fill queue", () => {
  const asExtension = (token: string): RequestInit => ({
    headers: { authorization: `Bearer ${token}`, origin: extension },
  });
  const filled = (token: string, body: unknown): RequestInit => ({
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      origin: extension,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  it("fills each chosen item once, in order, and keeps what waits across a restart", async () => {
    const h = harness();
    finished(h.output);
    const token = await paired(h);
    await h.call("/packs/p1/choose", json({ short: 1 }));
    await h.call("/packs/p1/choose", json({}));
    // Choosing an item already waiting keeps its place.
    const again = await h.call("/packs/p1/choose", json({ short: 1 }));
    expect(((await again.json()) as { queue: unknown[] }).queue).toHaveLength(2);
    expect(await (await h.call("/queue")).json()).toEqual({
      queue: [
        {
          projectId: "p1",
          projectTitle: "The Fox of Cliffside",
          short: 1,
          at: clock.now().toISOString(),
        },
        {
          projectId: "p1",
          projectTitle: "The Fox of Cliffside",
          short: null,
          at: clock.now().toISOString(),
        },
      ],
    });

    // Slopify restarts: nothing chosen is lost.
    h.restart();
    const first = await h.call("/ext/pack", asExtension(token));
    expect(await first.json()).toMatchObject({ item: { kind: "short", short: 1 }, waiting: 2 });
    // The same item again until the extension says it filled it ("Fill again").
    expect(await (await h.call("/ext/pack", asExtension(token))).json()).toMatchObject({
      item: { short: 1 },
    });
    const done = await h.call("/ext/filled", filled(token, { projectId: "p1", short: 1 }));
    expect(done.status).toBe(200);
    expect(done.headers.get("access-control-allow-origin")).toBe(extension);
    expect(await done.json()).toEqual({ waiting: 1 });
    expect(await (await h.call("/ext/pack", asExtension(token))).json()).toMatchObject({
      item: { kind: "video" },
      waiting: 1,
    });
    await h.call("/ext/filled", filled(token, { projectId: "p1", short: null }));
    expect((await h.call("/ext/pack", asExtension(token))).status).toBe(404);
  });

  it("lets the page remove an item, refuses the extension's report without the token, and forgets the queue on a new token", async () => {
    const h = harness();
    finished(h.output);
    const token = await paired(h);
    await h.call("/packs/p1/choose", json({}));
    await h.call("/packs/p1/choose", json({ short: 1 }));
    const removed = await h.call("/queue/remove", json({ projectId: "p1", short: null }));
    expect(await removed.json()).toMatchObject({ queue: [{ short: 1 }] });
    const stranger = await h.call("/ext/filled", {
      ...filled("not-the-token-at-all-000000", { projectId: "p1", short: 1 }),
    });
    expect(stranger.status).toBe(401);
    expect(((await (await h.call("/queue")).json()) as { queue: unknown[] }).queue).toHaveLength(1);
    // Another page can't read or change the queue.
    expect((await h.call("/queue", { headers: { origin: "https://evil.example" } })).status).toBe(
      403,
    );
    await h.call("/settings/pairing", json({}));
    expect(await (await h.call("/queue")).json()).toEqual({ queue: [] });
    expect(token).not.toBe("");
  });

  it("drops a waiting item whose project is gone", async () => {
    const h = harness();
    finished(h.output);
    const token = await paired(h);
    await h.call("/packs/p1/choose", json({}));
    // Deleted: in the trash.
    h.db
      .prepare("INSERT INTO project_trash(project_id,deleted_at) VALUES('p1','2026-09-27')")
      .run();
    const answer = await h.call("/ext/pack", asExtension(token));
    expect(answer.status).toBe(404);
    expect(((await answer.json()) as { detail: string }).detail).toContain("is gone");
  });
});

describe("a playlist per channel", () => {
  const put = (body: unknown): RequestInit => ({ ...json(body), method: "PUT" });
  const defaultChannel = "00000000-0000-4000-8000-000000000001";

  it("names the channel's own playlist, else the default", async () => {
    const h = harness();
    finished(h.output);
    const playlist = async () =>
      ((await (await h.call("/packs/p1")).json()) as UploadPack).items[0]?.playlist;
    expect(await playlist()).toBeNull();
    await h.call("/settings/playlist", put({ playlist: "Everything" }));
    expect(await playlist()).toBe("Everything");
    const own = await h.call(
      "/settings/playlist",
      put({ playlist: " Fox tales ", channelId: defaultChannel }),
    );
    expect(await own.json()).toEqual({ playlist: "Fox tales", channelId: defaultChannel });
    expect(await playlist()).toBe("Fox tales");
    expect(await (await h.call("/settings")).json()).toMatchObject({
      playlist: "Everything",
      channelPlaylists: { [defaultChannel]: "Fox tales" },
    });
    // Emptied, the channel uses the default again.
    await h.call("/settings/playlist", put({ playlist: "", channelId: defaultChannel }));
    expect(await playlist()).toBe("Everything");
    const unknown = await h.call(
      "/settings/playlist",
      put({ playlist: "Owls", channelId: "11111111-1111-4111-8111-111111111111" }),
    );
    expect(unknown.status).toBe(404);
    expect(((await unknown.json()) as { detail: string }).detail).toContain(
      "Settings → YouTube Studio",
    );
  });
});

describe("the extension download", () => {
  it("serves the built zips and says plainly when this copy has none", async () => {
    const dist = mkdtempSync(join(tmpdir(), "slopify-extension-"));
    writeFileSync(join(dist, "slopify-studio-chrome.zip"), "PK-chrome");
    const h = harness(config, dist);
    const chrome = await h.call("/extension/chrome.zip");
    expect(chrome.status).toBe(200);
    expect(chrome.headers.get("content-type")).toBe("application/zip");
    expect(chrome.headers.get("content-disposition")).toBe(
      'attachment; filename="slopify-studio-chrome.zip"',
    );
    expect(await chrome.text()).toBe("PK-chrome");
    // The Firefox zip isn't in this fixture's build.
    const firefox = await h.call("/extension/firefox.zip");
    expect(firefox.status).toBe(404);
    expect(((await firefox.json()) as { detail: string }).detail).toContain("npm run build");
    expect((await h.call("/extension/..%2Fdb.zip")).status).toBe(400);
    expect((await harness().call("/extension/chrome.zip")).status).toBe(404);
  });
});
