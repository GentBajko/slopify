import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { afterEach, describe, expect, it } from "vitest";
import type { Config } from "../../src/kernel/config/index.js";
import type { Paths } from "../../src/kernel/paths.js";
import { boot } from "../../src/main.js";
import type { RunDraft } from "../../src/slices/admission/model.js";
import { resolveFfmpeg } from "../../src/slices/video/ffmpeg.js";

const ffmpeg = resolveFfmpeg(process.env, ffmpegStatic);
const bodySeconds = 2;
const running: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const stop of running.splice(0)) {
    await stop();
  }
});

function ff(args: readonly string[]): string {
  try {
    execFileSync(ffmpeg, [...args], { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
    return "";
  } catch (error) {
    // `ffmpeg -i file` with no output file is an error by design; the report is on stderr.
    return String((error as { stderr?: string }).stderr ?? "");
  }
}

function durationSecondsOf(video: string): number {
  const reported = ff(["-hide_banner", "-i", video]);
  const matched = /Duration: (\d\d):(\d\d):(\d\d\.\d\d)/.exec(reported);
  if (matched === null) {
    throw new Error(`ffmpeg -i reported no duration for ${video}:\n${reported}`);
  }
  return Number(matched[1]) * 3600 + Number(matched[2]) * 60 + Number(matched[3]);
}

// Three stills and a tone, made once with the same binary the render uses.
function fixtures(): { readonly audio: Buffer; readonly images: readonly Buffer[] } {
  const dir = mkdtempSync(join(tmpdir(), "slopify-fixture-"));
  const audio = join(dir, "body.mp3");
  ff([
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=440:duration=${bodySeconds}:sample_rate=44100`,
    "-ac",
    "2",
    audio,
  ]);
  const images = ["testsrc", "testsrc2", "smptebars"].map((pattern, at) => {
    const path = join(dir, `${at}.png`);
    ff([
      "-v",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      `${pattern}=size=320x180:rate=1:duration=1`,
      "-frames:v",
      "1",
      path,
    ]);
    return readFileSync(path);
  });
  return { audio: readFileSync(audio), images };
}

async function stage(url: string, kind: string, name: string, bytes: Buffer): Promise<string> {
  const form = new FormData();
  form.set("file", new File([new Uint8Array(bytes)], name));
  const response = await fetch(`${url}/api/staging/${kind}`, { method: "POST", body: form });
  if (response.status !== 201) {
    throw new Error(`staging ${name} answered ${response.status}`);
  }
  return ((await response.json()) as { id: string }).id;
}

interface Watcher {
  readonly events: Array<Record<string, unknown>>;
  readonly until: (matches: (event: Record<string, unknown>) => boolean) => Promise<void>;
  readonly close: () => void;
}

// A minimal SSE reader: enough to pull `data:` lines off a live socket.
async function watch(url: string): Promise<Watcher> {
  const controller = new AbortController();
  const response = await fetch(url, { signal: controller.signal });
  const reader = (response.body ?? new ReadableStream<Uint8Array>()).getReader();
  const events: Array<Record<string, unknown>> = [];
  const decoder = new TextDecoder();
  let pending = "";
  return {
    events,
    until: async (matches): Promise<void> => {
      if (events.some(matches)) {
        return;
      }
      for (;;) {
        const { value, done } = await reader.read();
        if (done) {
          throw new Error("the event stream ended before the event arrived");
        }
        pending += decoder.decode(value, { stream: true });
        const lines = pending.split("\n");
        pending = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data:")) {
            continue;
          }
          const event = JSON.parse(line.slice(5).trim()) as Record<string, unknown>;
          events.push(event);
        }
        if (events.some(matches)) {
          return;
        }
      }
    },
    close: (): void => {
      controller.abort();
    },
  };
}

async function started(): Promise<{ url: string; paths: Paths; stop: () => Promise<void> }> {
  const config: Config = {
    port: 0,
    host: "127.0.0.1",
    dataDir: mkdtempSync(join(tmpdir(), "slopify-skeleton-")),
    open: false,
  };
  const { url, paths, stop } = await boot(config);
  running.push(stop);
  return { url, paths, stop };
}

function draft(audio: string, images: readonly string[]): RunDraft {
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
    provided: { article: "Everything you never wanted to know about rope.", audio, images },
    silenceGapSeconds: 3,
  };
}

describe("a project whose every stage is provided renders an mp4", () => {
  it("runs from Play to a finished video over real sockets", async () => {
    const { url, paths } = await started();
    const files = fixtures();

    const global = await watch(`${url}/api/events/global`);
    const audio = await stage(url, "audio", "body.mp3", files.audio);
    const images: string[] = [];
    for (const [at, bytes] of files.images.entries()) {
      images.push(await stage(url, "images", `shot-${at}.png`, bytes));
    }

    const created = await fetch(`${url}/api/projects`, {
      method: "POST",
      body: JSON.stringify(draft(audio, images)),
      headers: { "content-type": "application/json" },
    });
    expect(created.status).toBe(201);
    const { project } = (await created.json()) as { project: { id: string; status: string } };
    // tick() runs inside the request, so the video stage is already going by the time the 201
    // is written. That is also why the stream below is not asked for `video:running`: the page
    // that navigates here after Play subscribes afterwards and refetches instead.
    expect(project.status).toBe("running");

    const events = await watch(`${url}/api/events/projects/${project.id}`);
    await events.until((event) => event.type === "project.state" && event.state === "done");
    events.close();

    expect(
      events.events
        .filter((event) => event.type === "stage.state")
        .map((event) => `${String(event.stage)}:${String(event.state)}`),
    ).toEqual(["video:done"]);
    expect(events.events.some((event) => event.type === "stage.progress")).toBe(true);

    await global.until(
      (event) =>
        event.type === "running.count" &&
        event.count === 0 &&
        global.events.some((seen) => seen.type === "running.count" && seen.count === 1),
    );
    global.close();

    const video = join(paths.projects, project.id, "video.mp4");
    expect(existsSync(video)).toBe(true);
    // A gap is inserted only beside a segment that exists, and a provided audio stage carries
    // the body alone, so this run's timeline has no gap to insert and the video is exactly as
    // long as the narration. The gap arithmetic over a real render is asserted in
    // test/video-render.test.ts.
    const plan = JSON.parse(
      readFileSync(join(paths.projects, project.id, "render.json"), "utf8"),
    ) as {
      audio: Array<{ kind: string; seconds: number }>;
      gapSeconds: number;
    };
    expect(plan.gapSeconds).toBe(3);
    expect(plan.audio.map((segment) => segment.kind)).toEqual(["body"]);
    const gaps = plan.audio
      .filter((segment) => segment.kind === "gap")
      .reduce((sum, segment) => sum + segment.seconds, 0);
    expect(durationSecondsOf(video)).toBeCloseTo(bodySeconds + gaps, 1);

    const read = (await (await fetch(`${url}/api/projects/${project.id}`)).json()) as {
      project: { status: string };
      stages: Array<{ kind: string; state: string }>;
      outputs: Array<{ role: string }>;
    };
    expect(read.project.status).toBe("done");
    expect(read.stages.map((row) => `${row.kind}:${row.state}`)).toEqual([
      "research:skipped",
      "article:provided",
      "audio:provided",
      "images:provided",
      "thumbnail:skipped",
      "video:done",
    ]);
    expect(read.outputs.map((output) => output.role)).toEqual([
      "article_txt",
      "audio_body",
      "image",
      "image",
      "image",
      "render_params",
      "video",
    ]);

    const download = await fetch(`${url}/files/${project.id}/video`);
    expect(download.status).toBe(200);
    expect(download.headers.get("content-type")).toBe("video/mp4");
    expect(download.headers.get("content-disposition")).toBe(
      'attachment; filename="rope-tricks-video.mp4"',
    );
  }, 180_000);
});

describe("shutdown", () => {
  it("stops accepting requests before it waits for the run it is aborting", async () => {
    const { url, paths, stop } = await started();
    const files = fixtures();
    const audio = await stage(url, "audio", "body.mp3", files.audio);
    const image = await stage(url, "images", "shot.png", files.images[0] ?? Buffer.alloc(0));
    const first = await fetch(`${url}/api/projects`, {
      method: "POST",
      body: JSON.stringify(draft(audio, [image])),
      headers: { "content-type": "application/json" },
    });
    const { project } = (await first.json()) as { project: { id: string } };

    // stop() is not awaited: the second Play lands while the shutdown is in progress.
    const stopping = stop();
    running.length = 0;
    const second = await fetch(`${url}/api/projects`, {
      method: "POST",
      body: JSON.stringify(draft(audio, [image])),
      headers: { "content-type": "application/json" },
    }).then(
      (response) => response.status,
      () => "refused" as const,
    );
    await stopping;

    // The listener is closed first, so the request never reaches startRun; were it the
    // other way round it would have spawned a render under a controller nobody aborts.
    expect(second).toBe("refused");
    expect(existsSync(join(paths.projects, project.id, "video.mp4"))).toBe(false);
  }, 180_000);
});
