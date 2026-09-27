import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { BuiltInBed } from "./ambient-bed.js";
import { probeDurationMs, resolveFfmpeg } from "./ffmpeg.js";
import { planRender } from "./plan.js";
import { renderSlideshow } from "./slideshow.js";

// The ambient bed rendered for real with the bundled ffmpeg, under a 3 s tone standing in for
// the narration: the video runs on for the tail, the bed is still heard after the voice ends,
// and it is ducked while the voice speaks. The rain and fire beds are filtered well above the
// 220 Hz tone, so above 1 kHz what is measured is the bed alone.

const bin = resolveFfmpeg(process.env, ffmpegStatic);
const log = { write: (): void => {} };
let scratch = "";

function make(name: string, args: readonly string[]): string {
  const path = join(scratch, name);
  execFileSync(bin, ["-v", "error", "-y", ...args, path]);
  return path;
}

beforeAll(() => {
  scratch = mkdtempSync(join(tmpdir(), "slopify-ambient-render-"));
  make("still.png", ["-f", "lavfi", "-i", "color=c=0x808080:s=320x180", "-frames:v", "1"]);
  make("voice.wav", ["-f", "lavfi", "-i", "sine=frequency=220:duration=3", "-af", "volume=6dB"]);
  make("quiet.wav", ["-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", "3"]);
  make("loop.wav", ["-f", "lavfi", "-i", "anoisesrc=c=white:a=0.5:seed=5:d=1.5"]);
});
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

async function render(
  name: string,
  body: string,
  source: { kind: "noise"; preset: BuiltInBed } | { kind: "file"; path: string },
  tailSeconds = 4,
): Promise<string> {
  const output = join(scratch, name);
  const plan = planRender({
    format: "16:9",
    gapSeconds: 0,
    edgeSeconds: 1,
    imageSeconds: 30,
    zoomPercent: 0,
    motionStyle: "still",
    body: { path: join(scratch, body), seconds: 3 },
    images: [join(scratch, "still.png")],
    output,
    bed: { source, levelDb: -12, fadeInSeconds: 0, tailSeconds },
  });
  await renderSlideshow({
    bin,
    edit: plan.editList,
    output,
    burnSubtitles: false,
    scratch,
    signal: new AbortController().signal,
    log,
    onProgress: (): void => {},
  });
  return output;
}

// The RMS level in dBFS of the sound above 1 kHz from `from` for `seconds`.
function highRms(file: string, from: number, seconds: number): number {
  const said = spawnSync(
    bin,
    [
      ...["-hide_banner", "-ss", String(from), "-t", String(seconds), "-i", file],
      ...["-map", "0:a", "-af", "highpass=f=1000,astats=measure_perchannel=none"],
      ...["-f", "null", "-"],
    ],
    { encoding: "utf8" },
  ).stderr;
  const level = /RMS level dB:\s*(-?[\d.]+|-inf)/.exec(said)?.[1];
  return level === undefined || level === "-inf" ? -Infinity : Number(level);
}

// Real ffmpeg renders: slower than the default 5 s when the whole suite runs in parallel.
describe("the ambient bed", { timeout: 60_000 }, () => {
  it("runs the video on for the tail, audible after the narration ends", async () => {
    const video = await render("rain.mp4", "voice.wav", { kind: "noise", preset: "rain" });
    // 1 s lead-in, 3 s of narration, then the 4 s tail in place of the 1 s edge.
    const ms = await probeDurationMs(bin, video, new AbortController().signal, log);
    expect(ms).toBeGreaterThan(7800);
    expect(ms).toBeLessThan(8300);
    // Fading out from 4 s, still well above silence a second and a half in.
    expect(highRms(video, 4.5, 1.5)).toBeGreaterThan(-60);
  });

  it("is ducked while the voice speaks", async () => {
    const ducked = await render("ducked.mp4", "voice.wav", { kind: "noise", preset: "rain" });
    const open = await render("open.mp4", "quiet.wav", { kind: "noise", preset: "rain" });
    // The same bed over the middle of the narration, under the tone and under silence.
    const under = highRms(ducked, 2, 1.5);
    const alone = highRms(open, 2, 1.5);
    expect(alone).toBeGreaterThan(-60);
    expect(alone - under).toBeGreaterThan(5);
  });

  it("layers the fire and loops an uploaded file for the whole video", async () => {
    const fire = await render("fire.mp4", "voice.wav", { kind: "noise", preset: "fire" }, 2);
    const fireMs = await probeDurationMs(bin, fire, new AbortController().signal, log);
    expect(fireMs).toBeGreaterThan(5800);
    expect(fireMs).toBeLessThan(6300);
    const file = await render("file.mp4", "quiet.wav", {
      kind: "file",
      path: join(scratch, "loop.wav"),
    });
    // The 1.5 s file plays again past its end.
    expect(highRms(file, 2.5, 1)).toBeGreaterThan(-60);
  });
});
