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

function harness(project: RunConfig = config) {
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
  const app = createApp({
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
    flushSoon: (): void => {},
    probe: () => Promise.resolve({ ran: false, stdout: "" }),
  });
  const call = (path: string, init: RequestInit = {}) =>
    app.request(`http://127.0.0.1:4545/api/studio${path}`, init);
  return { app, call, output, db };
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
    // An AI voice and AI images: Yes for the video and the short.
    expect(video?.alteredContent.altered).toBe(true);
    expect(video?.alteredContent.why).toContain("an AI voice narrates it");
    expect(short?.alteredContent.altered).toBe(true);
    expect(video?.chapterNotice).toBeUndefined();
  });

  it("answers the AI disclosure from the project's sources and the channel's setting", async () => {
    const own: RunConfig = {
      ...config,
      sources: { ...config.sources, audio: "provide", images: "provide" },
    };
    const { app, call, output } = harness(own);
    finished(output);
    const read = async () => ((await (await call("/packs/p1")).json()) as UploadPack).items;
    const [video, short] = await read();
    expect(video?.alteredContent).toEqual({
      altered: false,
      why: "No because the narration and the images are your own, with no AI voice or AI images in the video.",
    });
    // A short's images are always drawn anew by the image model.
    expect(short?.alteredContent.altered).toBe(true);
    expect(short?.alteredContent.why).toContain("AI image model");

    const set = (value: string) =>
      app.request(
        "http://127.0.0.1:4545/api/channels/00000000-0000-4000-8000-000000000001/ai-disclosure",
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ aiDisclosure: value }),
        },
      );
    expect((await set("no")).status).toBe(200);
    expect((await read()).map((item) => item.alteredContent.altered)).toEqual([false, false]);
    expect((await read())[1]?.alteredContent.why).toContain("Always No");
    expect((await set("yes")).status).toBe(200);
    expect((await read()).map((item) => item.alteredContent.altered)).toEqual([true, true]);
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

describe("pairing and CORS", () => {
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
    // A short is chosen by its number.
    await h.call("/packs/p1/choose", json({ short: 1 }));
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
