import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { afterAll, expect, it } from "vitest";
import type { Log } from "../src/kernel/log.js";
import { layout } from "../src/kernel/paths.js";
import { resolveFont } from "../src/slices/fonts/index.js";
import { renderShort } from "../src/slices/shorts/render.js";
import { probeDurationMs, resolveFfmpeg } from "../src/slices/video/ffmpeg.js";

// A short cut from a timeline of silence, a tone and silence, over solid-colour stills, with
// the bundled ffmpeg: the sound is cut at the clip's own seconds, the picture is 1080×1920
// H.264 with AAC, and the captions are burned in.

const silent: Log = { write: (): void => {} };
const ffmpeg = resolveFfmpeg(process.env, ffmpegStatic);
const scratch = mkdtempSync(join(tmpdir(), "slopify-short-render-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

function ff(args: readonly string[]): void {
  execFileSync(ffmpeg, ["-v", "error", "-y", ...args], { stdio: ["ignore", "pipe", "pipe"] });
}

// What ffmpeg says about a file on its error stream when given no output.
function describe(path: string): string {
  return spawnSync(ffmpeg, ["-hide_banner", "-i", path], { encoding: "utf8" }).stderr;
}

// The loudest sample between two times of a file's sound, in dB.
function loudest(path: string, from: number, to: number): number {
  const said = spawnSync(
    ffmpeg,
    [
      "-hide_banner",
      "-i",
      path,
      "-af",
      `atrim=${String(from)}:${String(to)},volumedetect`,
      "-f",
      "null",
      "-",
    ],
    { encoding: "utf8" },
  ).stderr;
  const matched = /max_volume: (-?[\d.]+|-inf) dB/.exec(said);
  return matched?.[1] === undefined || matched[1] === "-inf" ? -Infinity : Number(matched[1]);
}

// Several ffmpeg runs; a busy machine running the whole suite needs more than the default.
it("cuts the clip's sound off the timeline and burns big captions over vertical stills", {
  timeout: 60_000,
}, async () => {
  const tone = join(scratch, "tone.wav");
  ff(["-f", "lavfi", "-i", "sine=frequency=440:duration=4:sample_rate=44100", "-ac", "2", tone]);
  const stills = ["teal", "navy"].map((colour) => {
    const path = join(scratch, `${colour}.png`);
    ff(["-f", "lavfi", "-i", `color=c=${colour}:s=270x480`, "-frames:v", "1", path]);
    return path;
  });
  const output = join(scratch, "short.mp4");
  const font = await resolveFont(layout(scratch), "default");
  // The timeline the word timing walked: a second of silence, four seconds of narration and
  // a second of silence. The clip runs 0.5 s to 3.5 s: half a second of the lead-in, then the
  // first two and a half seconds of the tone.
  await renderShort({
    bin: ffmpeg,
    timeline: [
      { kind: "edge", path: null, seconds: 1 },
      { kind: "body", path: tone, seconds: 4 },
      { kind: "edge", path: null, seconds: 1 },
    ],
    start: 0.5,
    end: 3.5,
    images: stills,
    imageSeconds: 2,
    motionStyle: "still",
    zoomPercent: 22.5,
    words: [
      { text: "HELLO", start: 0.6, end: 1.4 },
      { text: "WORLD", start: 1.5, end: 2.4 },
    ],
    font,
    output,
    scratch,
    signal: new AbortController().signal,
    log: silent,
    onProgress: () => undefined,
  });

  const said = describe(output);
  expect(said).toMatch(/Video: h264[^\n]*1080x1920/);
  expect(said).toMatch(/Audio: aac/);
  const durationMs = await probeDurationMs(ffmpeg, output, new AbortController().signal, silent);
  expect(durationMs).toBeGreaterThan(2950);
  expect(durationMs).toBeLessThan(3100);
  // Silent until the narration starts half a second in, loud after.
  expect(loudest(output, 0, 0.4)).toBeLessThan(-60);
  expect(loudest(output, 0.7, 2.5)).toBeGreaterThan(-30);

  // The caption band, a little below the middle, holds bright caption pixels over the teal
  // still while a word is on screen, and nothing but teal before the first word.
  const band = (at: number): Buffer =>
    execFileSync(
      ffmpeg,
      [
        "-v",
        "error",
        "-ss",
        String(at),
        "-i",
        output,
        "-frames:v",
        "1",
        "-vf",
        "crop=1080:240:0:1070",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "-",
      ],
      { maxBuffer: 64 * 1024 * 1024 },
    );
  const bright = (pixels: Buffer): number => {
    let count = 0;
    for (let at = 0; at + 2 < pixels.length; at += 3)
      if ((pixels[at] ?? 0) > 200 && (pixels[at + 1] ?? 0) > 150) count += 1;
    return count;
  };
  expect(bright(band(1.0))).toBeGreaterThan(500);
  expect(bright(band(0.2))).toBe(0);
});
