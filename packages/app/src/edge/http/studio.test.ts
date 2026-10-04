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
import { writeSetting } from "../../slices/settings/repo.js";
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
    await call("/settings/playlists", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ playlists: [{ name: " Fox tales ", byDefault: true }] }),
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
    // The pack's video too, for Studio's upload dialog; never another file.
    const video = await h.call("/ext/files/p1/video", {
      headers: { authorization: `Bearer ${token}`, origin: extension },
    });
    expect(video.status).toBe(200);
    expect(await video.text()).toBe("mp4");
    const other = await h.call("/ext/files/p1/youtube-description", {
      headers: { authorization: `Bearer ${token}`, origin: extension },
    });
    expect(other.status).toBe(404);
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

  it("names the channel's own playlists, else the default list", async () => {
    const h = harness();
    finished(h.output);
    const video = async () => ((await (await h.call("/packs/p1")).json()) as UploadPack).items[0];
    expect((await video())?.playlists).toEqual([]);
    await h.call(
      "/settings/playlists",
      put({ playlists: [{ name: "Everything", byDefault: true }] }),
    );
    expect((await video())?.playlists).toEqual(["Everything"]);
    const own = await h.call(
      "/settings/playlists",
      put({
        playlists: [
          { name: " Fox tales ", byDefault: true },
          { name: "Cliff series", byDefault: false },
          { name: "  ", byDefault: true },
        ],
        channelId: defaultChannel,
      }),
    );
    expect(await own.json()).toEqual({
      playlists: [
        { name: "Fox tales", byDefault: true },
        { name: "Cliff series", byDefault: false },
      ],
      channelId: defaultChannel,
    });
    // Only the ones ticked by default; the first also as `playlist`, for older extensions.
    expect(await video()).toMatchObject({ playlists: ["Fox tales"], playlist: "Fox tales" });
    expect(await (await h.call("/settings")).json()).toMatchObject({
      playlists: [{ name: "Everything", byDefault: true }],
      channelPlaylists: { [defaultChannel]: [{ name: "Fox tales" }, { name: "Cliff series" }] },
    });
    // Emptied, the channel uses the default list again.
    await h.call("/settings/playlists", put({ playlists: [], channelId: defaultChannel }));
    expect((await video())?.playlists).toEqual(["Everything"]);
    const twice = await h.call(
      "/settings/playlists",
      put({
        playlists: [
          { name: "Owls", byDefault: true },
          { name: "owls", byDefault: false },
        ],
      }),
    );
    expect(twice.status).toBe(400);
    expect(((await twice.json()) as { detail: string }).detail).toContain("listed twice");
    const unknown = await h.call(
      "/settings/playlists",
      put({
        playlists: [{ name: "Owls", byDefault: true }],
        channelId: "11111111-1111-4111-8111-111111111111",
      }),
    );
    expect(unknown.status).toBe(404);
    expect(((await unknown.json()) as { detail: string }).detail).toContain(
      "Settings → YouTube Studio",
    );
  });

  it("reads a playlist saved before lists as one ticked by default", async () => {
    const h = harness();
    finished(h.output);
    writeSetting(h.db, "studio.playlist", JSON.stringify("Fox tales"));
    const pack = (await (await h.call("/packs/p1")).json()) as UploadPack;
    expect(pack.playlistChoices).toEqual([{ name: "Fox tales", chosen: true }]);
    expect(pack.items[0]?.playlists).toEqual(["Fox tales"]);
  });

  it("keeps a project's own playlist ticks, and drops one the channel no longer lists", async () => {
    const h = harness();
    finished(h.output);
    await h.call(
      "/settings/playlists",
      put({
        playlists: [
          { name: "Everything", byDefault: true },
          { name: "Cliff series", byDefault: false },
        ],
      }),
    );
    const chosen = await h.call("/packs/p1/playlists", put({ playlists: ["Cliff series"] }));
    const pack = (await chosen.json()) as UploadPack;
    expect(pack.playlistChoices).toEqual([
      { name: "Everything", chosen: false },
      { name: "Cliff series", chosen: true },
    ]);
    // The shorts go into the same playlists as the video.
    expect(pack.items.map((item) => item.playlists)).toEqual(
      pack.items.map(() => ["Cliff series"]),
    );
    await h.call(
      "/settings/playlists",
      put({ playlists: [{ name: "Everything", byDefault: true }] }),
    );
    const after = (await (await h.call("/packs/p1")).json()) as UploadPack;
    expect(after.items[0]?.playlists).toEqual([]);
    // Back to the channel's defaults.
    await h.call("/packs/p1/playlists", put({ playlists: null }));
    expect(((await (await h.call("/packs/p1")).json()) as UploadPack).items[0]?.playlists).toEqual([
      "Everything",
    ]);
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

describe("YouTube videos and their A/B tests", () => {
  const ext = (token: string, body?: unknown): RequestInit => ({
    method: body === undefined ? "GET" : "POST",
    headers: {
      authorization: `Bearer ${token}`,
      origin: extension,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  it("keeps an upload's link once Studio confirms it, and queues its Details touches", async () => {
    const h = harness();
    finished(h.output);
    h.output("subtitles_srt", "captions.srt", "1\n00:00:00,000 --> 00:00:02,000\nA fox.\n");
    const token = await paired(h);
    // The upload dialog showed the new video's link: filled, not on YouTube yet.
    const upload = { projectId: "p1", short: null, videoId: "lKS3FAjekpI" };
    await h.call("/ext/video", ext(token, upload));
    expect(await (await h.call("/videos/p1")).json()).toMatchObject({
      videos: [{ uploadState: "filled", finishState: "none" }],
    });
    // "Video scheduled": on YouTube, and its captions wait for the Details page.
    expect(await (await h.call("/ext/video/done", ext(token, upload))).json()).toEqual({
      confirmed: true,
    });
    expect(await (await h.call("/videos/p1")).json()).toMatchObject({
      videos: [{ uploadState: "done", finishState: "waiting" }],
    });
    const tasks = (await (await h.call("/ext/tasks", ext(token))).json()) as {
      finish: { videoId: string }[];
    };
    expect(tasks.finish.map((one) => one.videoId)).toEqual(["lKS3FAjekpI"]);
    // The Details page gets the captions file from the pack.
    const pack = (await (await h.call("/ext/packs/p1", ext(token))).json()) as {
      items: { kind: string; captions?: { asset: string } }[];
    };
    const captions = pack.items.find((item) => item.kind === "video")?.captions;
    expect(captions).toBeDefined();
    const file = await h.call(`/ext/files/p1/${captions?.asset ?? ""}`, ext(token));
    expect(file.status).toBe(200);
    expect(await file.text()).toContain("A fox.");
    await h.call(
      "/ext/task-result",
      ext(token, {
        task: "finish",
        projectId: "p1",
        short: null,
        ok: true,
        message: "Captions uploaded.",
      }),
    );
    expect(await (await h.call("/videos/p1")).json()).toMatchObject({
      videos: [{ finishState: "done", finishMessage: "Captions uploaded." }],
    });
    expect((await h.call("/ext/tasks")).status).toBe(401);
  });

  it("asks for the checks of a scheduled video until Studio's Content list clears them", async () => {
    const h = harness();
    finished(h.output);
    const token = await paired(h);
    const upload = { projectId: "p1", short: null, videoId: "lKS3FAjekpI" };
    await h.call("/ext/video", ext(token, upload));
    await h.call("/ext/video/done", ext(token, upload));
    await h.call("/releases/p1", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ short: 0, at: "2030-01-06T20:00:00.000Z" }),
    });
    const tasks = async () =>
      ((await (await h.call("/ext/tasks", ext(token))).json()) as { checks: boolean }).checks;
    expect(await tasks()).toBe(true);
    await h.call(
      "/ext/backfill",
      ext(token, { videos: [{ title: "Not ours", videoId: "lKS3FAjekpI", checks: "ok" }] }),
    );
    expect(await tasks()).toBe(false);
  });

  it("totals a channel's numbers: CTR over all impressions, view duration weighted by views", async () => {
    const h = harness();
    finished(h.output);
    const token = await paired(h);
    const long = { projectId: "p1", short: null, videoId: "lKS3FAjekpI" };
    const short = { projectId: "p1", short: 1, videoId: "xQgNw85mvH4" };
    for (const one of [long, short]) {
      await h.call("/ext/video", ext(token, one));
      await h.call("/ext/video/done", ext(token, one));
    }
    await h.call(
      "/ext/stats",
      ext(token, {
        ...long,
        impressions: 1000,
        ctr: 2,
        views: 100,
        averageViewSeconds: 600,
        watchHours: 16.7,
      }),
    );
    await h.call("/ext/stats", ext(token, { ...short, views: 300, averageViewSeconds: 20 }));
    const body = (await (
      await h.call("/channels/00000000-0000-4000-8000-000000000001/performance")
    ).json()) as {
      projects: { long: { stats: { views: number } } | null; shorts: unknown[] }[];
      long: { views: number; ctr: number | null; averageViewSeconds: number | null };
      shorts: { views: number; impressions: number | null; averageViewSeconds: number | null };
    };
    expect(body.projects).toHaveLength(1);
    expect(body.projects[0]?.shorts).toHaveLength(1);
    expect(body.long).toMatchObject({ views: 100, ctr: 2, averageViewSeconds: 600 });
    expect(body.shorts).toMatchObject({ views: 300, impressions: null, averageViewSeconds: 20 });
  });

  it("takes a pasted link for an upload made by hand", async () => {
    const h = harness();
    finished(h.output);
    const put = (link: string) =>
      h.call("/videos/p1", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ short: null, link }),
      });
    expect((await put("not a link")).status).toBe(400);
    expect(await (await put("https://youtu.be/6tRcYUoxyQo")).json()).toMatchObject({
      videos: [{ videoId: "6tRcYUoxyQo", uploadState: "done" }],
    });
    expect(await (await put("")).json()).toEqual({ videos: [] });
  });
});

it("keeps Prepare upload's pick: the upload's thumbnail first, every one still in the pack", async () => {
  const h = harness();
  finished(h.output);
  const response = await h.call("/packs/p1/pick", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: 0, thumbnail: 2 }),
  });
  const pack = (await response.json()) as {
    items: { thumbnails: { asset: string }[]; pickable?: { thumbnail: number } }[];
  };
  const video = pack.items[0];
  expect(video?.thumbnails.map((one) => one.asset)).toEqual([
    "thumbnail-3",
    "thumbnail",
    "thumbnail-2",
  ]);
  expect(video?.pickable?.thumbnail).toBe(2);
});

it("lists finished projects not marked uploaded for the popup, and puts the clicked upload first", async () => {
  const h = harness();
  finished(h.output);
  h.db
    .prepare(
      "INSERT INTO stages (id,project_id,kind,source,state,attempt_count) VALUES ('s-video','p1','video','generate','done',1)",
    )
    .run();
  const token = await paired(h);
  const headers = { authorization: `Bearer ${token}`, origin: extension };
  const ready = (await (await h.call("/ext/ready", { headers })).json()) as {
    projects: {
      projectId: string;
      items: { kind: string; short: number | null; uploaded: boolean }[];
    }[];
  };
  expect(ready.projects.map((project) => project.projectId)).toEqual(["p1"]);
  expect(ready.projects[0]?.items[0]).toMatchObject({
    kind: "video",
    short: null,
    uploaded: false,
  });
  const clicked = await h.call("/ext/upload", {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify({ projectId: "p1", short: 1 }),
  });
  expect(await clicked.json()).toEqual({ url: "https://www.youtube.com/upload" });
  // The upload dialog gets that short first.
  expect(await (await h.call("/ext/pack", { headers })).json()).toMatchObject({
    item: { kind: "short", short: 1 },
  });
});

it("fills in links from Studio's Content list by title, never over a known one", async () => {
  const h = harness();
  finished(h.output);
  const token = await paired(h);
  const send = (videos: { title: string; videoId: string }[]) =>
    h.call("/ext/backfill", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        origin: extension,
        "content-type": "application/json",
      },
      body: JSON.stringify({ videos }),
    });
  const pack = (await (await h.call("/packs/p1")).json()) as {
    items: { kind: string; short?: number; title: string }[];
  };
  const video = pack.items.find((item) => item.kind === "video");
  const short = pack.items.find((item) => item.kind === "short");
  if (video === undefined || short === undefined) throw new Error("fixture lacks an item");
  const found = await send([
    { title: `  ${video.title.toUpperCase()} `, videoId: "aaaaaaaaaaa" },
    { title: short.title, videoId: "bbbbbbbbbbb" },
    { title: "Someone else's video", videoId: "ccccccccccc" },
  ]);
  expect(await found.json()).toEqual({ found: 2 });
  // Known now: a second list with another id for the same title changes nothing.
  expect(await (await send([{ title: video.title, videoId: "ddddddddddd" }])).json()).toEqual({
    found: 0,
  });
  const videos = (await (await h.call("/videos/p1")).json()) as {
    videos: { short: number | null; videoId: string }[];
  };
  expect(videos.videos.map((one) => [one.short, one.videoId])).toEqual([
    [null, "aaaaaaaaaaa"],
    [short.short ?? null, "bbbbbbbbbbb"],
  ]);
  // The shorts now link the full video.
  const after = (await (await h.call("/packs/p1")).json()) as {
    items: { kind: string; description: string }[];
  };
  expect(after.items.find((item) => item.kind === "short")?.description).toContain(
    "Watch the full video: https://youtu.be/aaaaaaaaaaa",
  );
});

describe("the posting plan, Upload all Shorts and Studio's numbers", () => {
  const extHeaders = (token: string) => ({
    authorization: `Bearer ${token}`,
    origin: extension,
    "content-type": "application/json",
  });

  it("gives a finished project the plan's next free slot, with its shorts' times after it", async () => {
    const h = harness();
    finished(h.output);
    // No plan yet: nothing is scheduled.
    const none = (await (await h.call("/packs/p1")).json()) as { schedule?: unknown };
    expect(none.schedule).toBeUndefined();
    const slot = (day: number, time: string) => ({ day, time });
    const saved = await h.call("/plan", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        timeZone: "Europe/Berlin",
        rows: [
          { name: "1", long: slot(0, "20:00"), shorts: [slot(1, "17:00"), slot(2, "17:00")] },
          { name: "2", long: slot(3, "20:00"), shorts: [slot(4, "17:00")] },
        ],
      }),
    });
    expect(saved.status).toBe(200);
    const pack = (await (await h.call("/packs/p1")).json()) as {
      schedule?: { row: string; longAt: string; shortsAt: string[] };
      slotChoices: { row: string; longAt: string }[];
      items: { kind: string; scheduleAt?: string }[];
    };
    expect(pack.schedule?.row).toBeDefined();
    expect(pack.items[0]?.scheduleAt).toBe(pack.schedule?.longAt);
    // The shorts go out after their video.
    for (const at of pack.schedule?.shortsAt ?? [])
      expect(Date.parse(at)).toBeGreaterThan(Date.parse(pack.schedule?.longAt ?? ""));
    // The taken slot isn't offered again; another one can be chosen.
    expect(pack.slotChoices.some((one) => one.longAt === pack.schedule?.longAt)).toBe(false);
    const other = pack.slotChoices[0];
    if (other === undefined) throw new Error("no free slot");
    const moved = await h.call("/packs/p1/slot", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slot: other }),
    });
    expect(((await moved.json()) as { schedule?: { longAt: string } }).schedule?.longAt).toBe(
      other.longAt,
    );
    // "Not scheduled" sticks: reading the pack again gives it no slot.
    await h.call("/packs/p1/slot", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slot: null }),
    });
    const again = (await (await h.call("/packs/p1")).json()) as {
      schedule?: unknown;
      items: { scheduleAt?: string }[];
    };
    expect(again.schedule).toBeUndefined();
    expect(again.items[0]?.scheduleAt).toBeUndefined();
  });

  it("shows the calendar: a finished project in the plan's next time with its shorts, then free times", async () => {
    const h = harness();
    finished(h.output);
    const json = (body: unknown) => ({
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const slot = (day: number, time: string) => ({ day, time });
    await h.call(
      "/plan",
      json({
        timeZone: "UTC",
        rows: [
          { name: "1", series: "", long: slot(0, "20:00"), shorts: [slot(1, "17:00")] },
          { name: "2", series: "", long: slot(3, "20:00"), shorts: [] },
        ],
      }),
    );
    expect((await h.call("/settings/lead-hours", json({ hours: 48 }))).status).toBe(200);
    // Preparing its upload gives it its release times.
    await h.call("/packs/p1");
    const calendar = (await (await h.call("/releases?weeks=2")).json()) as {
      leadHours: number;
      entries: {
        at: string;
        project: { id: string } | null;
        items: { short: number; at: string | null; uploadBy: string | null; state: string }[];
      }[];
      candidates: { id: string }[];
    };
    expect(calendar.leadHours).toBe(48);
    const mine = calendar.entries.find((entry) => entry.project?.id === "p1");
    expect(mine).toBeDefined();
    const long = mine?.items.find((item) => item.short === 0);
    expect(Date.parse(long?.at ?? "") - Date.parse(long?.uploadBy ?? "")).toBe(48 * 3600_000);
    expect(calendar.entries.some((entry) => entry.project === null)).toBe(true);
    // The project page reads the same times, with each one's upload-by.
    const own = (await (await h.call("/releases/p1")).json()) as {
      items: { short: number; at: string | null; uploadBy: string | null }[];
    };
    expect(own.items.find((item) => item.short === 0)?.at).toBe(long?.at);
    expect(own.items.find((item) => item.short === 0)?.uploadBy).toBe(long?.uploadBy);
    // Moved by hand to "not scheduled": it leaves the calendar, and its time is free again.
    const moved = await h.call("/releases/p1", json({ short: 0, at: null }));
    expect(moved.status).toBe(200);
    const after = (await (await h.call("/releases")).json()) as typeof calendar;
    expect(after.entries.some((entry) => entry.project?.id === "p1")).toBe(false);
    expect(after.entries.some((entry) => entry.project === null && entry.at === mine?.at)).toBe(
      true,
    );
  });

  it("queues every short for Upload all Shorts, short 1 first", async () => {
    const h = harness();
    finished(h.output);
    const token = await paired(h);
    const all = await h.call("/ext/upload-all", {
      method: "POST",
      headers: extHeaders(token),
      body: JSON.stringify({ projectId: "p1" }),
    });
    const body = (await all.json()) as { count: number };
    expect(body.count).toBeGreaterThan(0);
    expect(await (await h.call("/ext/pack", { headers: extHeaders(token) })).json()).toMatchObject({
      item: { kind: "short", short: 1 },
    });
  });

  it("waits for only the one upload picked, dropping what an earlier Upload all left", async () => {
    const h = harness();
    finished(h.output);
    const token = await paired(h);
    await h.call("/ext/upload-all", {
      method: "POST",
      headers: extHeaders(token),
      body: JSON.stringify({ projectId: "p1" }),
    });
    await h.call("/ext/upload", {
      method: "POST",
      headers: extHeaders(token),
      body: JSON.stringify({ projectId: "p1", short: null }),
    });
    const pack = (await (await h.call("/ext/pack", { headers: extHeaders(token) })).json()) as {
      item: { kind: string };
      waiting: number;
    };
    expect(pack).toMatchObject({ item: { kind: "video" }, waiting: 1 });
  });

  it("keeps Studio's numbers and an A/B result for the project and the Library", async () => {
    const h = harness();
    finished(h.output);
    const token = await paired(h);
    await h.call("/ext/stats", {
      method: "POST",
      headers: extHeaders(token),
      body: JSON.stringify({
        projectId: "p1",
        short: null,
        videoId: "lKS3FAjekpI",
        impressions: 493,
        ctr: 2.2,
        views: 66,
        averageViewSeconds: 1939,
        abVariants: [
          { title: "A", thumbnail: null, share: 60, winner: true },
          { title: "B", thumbnail: null, share: 40, winner: false },
        ],
      }),
    });
    expect(await (await h.call("/stats/p1")).json()).toMatchObject({
      stats: [{ views: 66, ctr: 2.2, impressions: 493, averageViewSeconds: 1939 }],
    });
    expect(await (await h.call("/ab-results")).json()).toMatchObject({
      results: [{ projectId: "p1", variants: [{ title: "A", winner: true }, { title: "B" }] }],
    });
  });
});
