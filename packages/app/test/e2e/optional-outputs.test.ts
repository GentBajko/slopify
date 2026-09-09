import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { afterEach, describe, expect, it } from "vitest";
import { type Boot, boot } from "../../src/main.js";
import type { ProjectSummary, RunDraft, Stage } from "../../src/slices/admission/model.js";
import type { Output } from "../../src/slices/storage/model.js";
import { resolveFfmpeg } from "../../src/slices/video/ffmpeg.js";

const ffmpeg = resolveFfmpeg(process.env, ffmpegStatic);
const running: Boot[] = [];
afterEach(async () => {
  for (const app of running.splice(0)) await app.stop();
});

async function start(): Promise<Boot> {
  const app = await boot({
    port: 0,
    host: "127.0.0.1",
    dataDir: mkdtempSync(join(tmpdir(), "slopify-optional-")),
    open: false,
  });
  running.push(app);
  return app;
}

function draft(over: Partial<RunDraft> = {}): RunDraft {
  return {
    title: "Optional outputs",
    format: "16:9",
    sources: {
      research: "off",
      article: "provide",
      audio: "off",
      images: "off",
      thumbnail: "off",
      video: "off",
    },
    imagePrompts: [],
    values: {},
    provided: { article: "The required article." },
    silenceGapSeconds: 3,
    ...over,
  };
}

interface View {
  readonly project: ProjectSummary;
  readonly stages: readonly Stage[];
  readonly outputs: readonly Output[];
}

async function create(app: Boot, body: RunDraft): Promise<string> {
  const response = await fetch(`${app.url}/api/projects`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  expect(response.status).toBe(201);
  const made = (await response.json()) as { project: ProjectSummary };
  return made.project.id;
}

async function finished(app: Boot, id: string): Promise<View> {
  let latest: View | undefined;
  await expect
    .poll(
      async () => {
        const response = await fetch(`${app.url}/api/projects/${id}`);
        latest = (await response.json()) as View;
        if (latest.project.status === "failed") throw new Error(JSON.stringify(latest.stages));
        return latest.project.status;
      },
      { timeout: 30000, interval: 50 },
    )
    .toBe("done");
  if (!latest) throw new Error("No project response");
  return latest;
}

async function upload(app: Boot, kind: "audio" | "images", path: string): Promise<string> {
  const data = new FormData();
  data.set(
    "file",
    new File([new Uint8Array(readFileSync(path))], kind === "audio" ? "tone.mp3" : "still.png"),
  );
  const response = await fetch(`${app.url}/api/staging/${kind}`, { method: "POST", body: data });
  expect(response.status).toBe(201);
  return ((await response.json()) as { id: string }).id;
}

function fixture(kind: "audio" | "images"): string {
  const dir = mkdtempSync(join(tmpdir(), "slopify-optional-media-"));
  const path = join(dir, kind === "audio" ? "tone.mp3" : "still.png");
  const input = kind === "audio" ? "sine=frequency=440:duration=0.2" : "color=c=blue:s=32x18:d=1";
  execFileSync(
    ffmpeg,
    [
      "-v",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      input,
      ...(kind === "images" ? ["-frames:v", "1"] : []),
      path,
    ],
    { windowsHide: true, stdio: "pipe" },
  );
  return path;
}

function probe(path: string): string {
  try {
    execFileSync(ffmpeg, ["-hide_banner", "-i", path], { windowsHide: true, stdio: "pipe" });
    return "";
  } catch (error) {
    return String((error as { stderr?: Buffer }).stderr ?? "");
  }
}

describe("optional outputs through the real app", () => {
  it("finishes and downloads an Article-only run without a media provider", async () => {
    const app = await start();
    const id = await create(app, draft());
    const view = await finished(app, id);
    expect(view.stages.filter((stage) => stage.state === "skipped")).toHaveLength(5);
    expect(view.outputs.map((output) => output.role)).toEqual(["article_txt"]);
    const response = await fetch(`${app.url}/files/${id}/article-txt`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("The required article.");
  });

  it("normalizes no-images into a real downloadable WAV from supplied MP3", async () => {
    const app = await start();
    const audio = await upload(app, "audio", fixture("audio"));
    const id = await create(
      app,
      draft({
        sources: { ...draft().sources, audio: "provide", video: "generate" },
        provided: { article: "Article", audio },
      }),
    );
    const view = await finished(app, id);
    expect(view.project.config.sources.video).toBe("off");
    expect(view.outputs.some((output) => output.role === "video")).toBe(false);
    expect(view.outputs.some((output) => output.role === "audio_export")).toBe(true);
    const response = await fetch(`${app.url}/files/${id}/audio-export`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/wav");
    expect(response.headers.get("content-disposition")).toContain(".wav");
    const bytes = Buffer.from(await response.arrayBuffer());
    expect(bytes.subarray(0, 4).toString()).toBe("RIFF");
    expect(bytes.subarray(8, 12).toString()).toBe("WAVE");
    expect(probe(join(app.paths.projects, id, "audio.wav"))).toMatch(
      /Audio: pcm_s16le.*48000 Hz, stereo/,
    );
  });

  it("renders a silent five-second slideshow when narration is Off", async () => {
    const app = await start();
    const image = await upload(app, "images", fixture("images"));
    const id = await create(
      app,
      draft({
        sources: { ...draft().sources, images: "provide", video: "generate" },
        provided: { article: "Article", images: [image] },
      }),
    );
    await finished(app, id);
    const report = probe(join(app.paths.projects, id, "video.mp4"));
    expect(report).toContain("Video:");
    expect(report).not.toContain("Audio:");
    expect(report).toContain("Duration: 00:00:05.00");
    expect((await fetch(`${app.url}/files/${id}/video`)).status).toBe(200);
  }, 30000);
});
