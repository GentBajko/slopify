import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Config } from "../src/kernel/config/index.js";
import { readVersion } from "../src/kernel/version.js";
import { boot } from "../src/main.js";
import type { RunDraft } from "../src/slices/admission/model.js";
import { resolveFfmpeg } from "../src/slices/video/ffmpeg.js";

// The whole point of the fake: the app under test posts to a real socket over real HTTP,
// and what arrives there is asserted as the collector would see it.
interface Collector {
  readonly url: string;
  readonly received: CollectorEvent[];
  readonly close: () => Promise<void>;
}

interface CollectorEvent {
  readonly id: string;
  readonly machineId: string;
  readonly type: string;
  readonly payload: Record<string, unknown>;
  readonly createdAt: string;
}

const ffmpeg = resolveFfmpeg(process.env, ffmpegStatic);
const running: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const stop of running.splice(0)) {
    await stop();
  }
  delete process.env.SLOPIFY_COLLECTOR_URL;
});

function fakeCollector(status = 200): Promise<Collector> {
  const received: CollectorEvent[] = [];
  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
        events: CollectorEvent[];
      };
      if (status === 200) {
        received.push(...body.events);
      }
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: status === 200 }));
    });
  });
  return new Promise<Collector>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address === null || typeof address === "string" ? 0 : address.port;
      resolve({
        url: `http://127.0.0.1:${port}`,
        received,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

function ff(args: readonly string[]): void {
  execFileSync(ffmpeg, [...args], { stdio: ["ignore", "pipe", "pipe"] });
}

// One tone and one still, made with the binary the render uses.
function fixtures(): { readonly audio: Buffer; readonly image: Buffer } {
  const dir = mkdtempSync(join(tmpdir(), "slopify-telemetry-fixture-"));
  const audio = join(dir, "body.mp3");
  const image = join(dir, "shot.png");
  ff([
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=1:sample_rate=44100",
    "-ac",
    "2",
    audio,
  ]);
  ff([
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc=size=320x180:rate=1:duration=1",
    "-frames:v",
    "1",
    image,
  ]);
  return { audio: readFileSync(audio), image: readFileSync(image) };
}

async function started(collectorUrl: string): Promise<{ url: string; dataDir: string }> {
  process.env.SLOPIFY_COLLECTOR_URL = collectorUrl;
  const dataDir = mkdtempSync(join(tmpdir(), "slopify-telemetry-run-"));
  const config: Config = { port: 0, host: "127.0.0.1", dataDir, open: false };
  const { url, stop } = await boot(config);
  running.push(stop);
  return { url, dataDir };
}

async function stage(url: string, kind: string, name: string, bytes: Buffer): Promise<string> {
  const form = new FormData();
  form.set("file", new File([new Uint8Array(bytes)], name));
  const response = await fetch(`${url}/api/staging/${kind}`, { method: "POST", body: form });
  return ((await response.json()) as { id: string }).id;
}

function draft(audio: string, image: string): RunDraft {
  return {
    title: "Rope Tricks",
    format: "16:9",
    sources: {
      research: "off",
      article: "provide",
      audio: "provide",
      images: "provide",
      thumbnail: "off",
      video: "generate",
    },
    imagePrompts: [],
    values: {},
    provided: {
      article: "Everything you never wanted to know about rope.",
      audio,
      images: [image],
    },
    silenceGapSeconds: 0,
  };
}

async function runOneProject(url: string): Promise<void> {
  const files = fixtures();
  const audio = await stage(url, "audio", "body.mp3", files.audio);
  const image = await stage(url, "images", "shot.png", files.image);
  const created = await fetch(`${url}/api/projects`, {
    method: "POST",
    body: JSON.stringify(draft(audio, image)),
    headers: { "content-type": "application/json" },
  });
  expect(created.status).toBe(201);
  const { project } = (await created.json()) as { project: { id: string } };
  await vi.waitFor(
    async () => {
      const read = (await (await fetch(`${url}/api/projects/${project.id}`)).json()) as {
        project: { status: string };
      };
      expect(read.project.status).toBe("done");
    },
    { timeout: 120_000, interval: 200 },
  );
}

describe("a run against a collector", () => {
  it("delivers the install, the project and the finished stage", async () => {
    const collector = await fakeCollector();
    running.push(collector.close);
    const { url } = await started(collector.url);

    // Nothing has been promised to the user yet, so nothing may be sent.
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(collector.received).toEqual([]);

    expect((await fetch(`${url}/api/telemetry/notice`, { method: "POST" })).status).toBe(200);
    await runOneProject(url);
    await vi.waitFor(() => expect(collector.received).toHaveLength(3), {
      timeout: 30_000,
      interval: 100,
    });

    const machineIds = new Set(collector.received.map((event) => event.machineId));
    expect(machineIds.size).toBe(1);
    expect([...machineIds][0]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );

    // Read rather than pinned: every release bumps it, and a literal here fails the
    // suite on the version commit itself.
    const appVersion = readVersion();
    expect(
      collector.received.map((event) => ({ type: event.type, payload: event.payload })),
    ).toEqual([
      { type: "install", payload: { appVersion } },
      { type: "project.created", payload: { appVersion } },
      { type: "stage.completed", payload: { appVersion, stage: "video" } },
    ]);

    for (const event of collector.received) {
      expect(event.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
      expect(event.createdAt).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
      // The never-list of logic/16 step 4, checked against what actually crossed the
      // socket: the run above had a title, an article, two uploaded files and a project
      // id, and none of them may appear anywhere in the delivered event.
      const wire = JSON.stringify(event);
      for (const secret of ["Rope Tricks", "rope", "body.mp3", "shot.png", "never wanted"]) {
        expect(wire).not.toContain(secret);
      }
      expect(Object.keys(event.payload).every((key) => key !== "projectId")).toBe(true);
    }
  }, 180_000);

  it("keeps the events queued when the collector refuses to answer", async () => {
    const collector = await fakeCollector(503);
    running.push(collector.close);
    const { url, dataDir } = await started(collector.url);

    await fetch(`${url}/api/telemetry/notice`, { method: "POST" });
    await runOneProject(url);
    await new Promise((resolve) => setTimeout(resolve, 2_000));

    expect(collector.received).toEqual([]);
    // Queued, not lost: the next start sends them, and the collector deduplicates.
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(join(dataDir, "slopify.db"), { readOnly: true });
    expect(
      db.prepare("SELECT count(*) AS n FROM telemetry_events WHERE delivered_at IS NULL").get(),
    ).toEqual({ n: 3 });
    db.close();
  }, 180_000);
});
