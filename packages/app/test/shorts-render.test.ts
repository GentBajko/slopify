import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { afterAll, expect, it } from "vitest";
import type { Log } from "../src/kernel/log.js";
import { layout } from "../src/kernel/paths.js";
import { resolveBoldFont, resolveFont } from "../src/slices/fonts/index.js";
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

// The average level of one band of a file's sound between two times, in dB: the narration's
// tone and the music's sit an octave and more apart, so each is measured on its own.
function band(path: string, from: number, to: number, frequency: number): number {
  const said = spawnSync(
    ffmpeg,
    [
      "-hide_banner",
      "-i",
      path,
      "-af",
      `atrim=${String(from)}:${String(to)},bandpass=f=${String(frequency)}:width_type=q:w=8,volumedetect`,
      "-f",
      "null",
      "-",
    ],
    { encoding: "utf8" },
  ).stderr;
  const matched = /mean_volume: (-?[\d.]+|-inf) dB/.exec(said);
  return matched?.[1] === undefined || matched[1] === "-inf" ? -Infinity : Number(matched[1]);
}

// Bright pixels (white, or the gold of the word being spoken) in a horizontal band of the
// frame at a time.
function brightIn(path: string, at: number, top: number, height: number): number {
  const pixels = execFileSync(
    ffmpeg,
    [
      "-v",
      "error",
      "-ss",
      String(at),
      "-i",
      path,
      "-frames:v",
      "1",
      "-vf",
      `crop=1080:${String(height)}:0:${String(top)}`,
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "-",
    ],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  let count = 0;
  for (let index = 0; index + 2 < pixels.length; index += 3)
    if ((pixels[index] ?? 0) > 200 && (pixels[index + 1] ?? 0) > 150) count += 1;
  return count;
}

it("plays faster, keeps the title on top, and ducks looped music under the narration", {
  timeout: 90_000,
}, async () => {
  // Narration: a 440 Hz tone from 3 s to 7 s of a 12 s timeline. Music: 1.5 s of 1000 Hz,
  // looped to the short's length.
  const voice = join(scratch, "voice.wav");
  ff(["-f", "lavfi", "-i", "sine=frequency=440:duration=4:sample_rate=44100", "-ac", "2", voice]);
  const music = join(scratch, "music.wav");
  ff([
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=1000:duration=1.5:sample_rate=44100",
    "-ac",
    "2",
    music,
  ]);
  const still = join(scratch, "black.png");
  ff(["-f", "lavfi", "-i", "color=c=black:s=270x480", "-frames:v", "1", still]);
  const output = join(scratch, "fast.mp4");
  await renderShort({
    bin: ffmpeg,
    timeline: [
      { kind: "edge", path: null, seconds: 3 },
      { kind: "body", path: voice, seconds: 4 },
      { kind: "edge", path: null, seconds: 5 },
    ],
    start: 0,
    end: 12,
    images: [still, still],
    imageSeconds: 6,
    motionStyle: "still",
    zoomPercent: 0,
    // The clip's own timeline; drawn at 1.25× these come 0.8 as early.
    words: [{ text: "TONE", start: 3.2, end: 6.8 }],
    font: await resolveBoldFont(layout(scratch), "default"),
    title: "Harbors at night",
    speed: 1.25,
    music: { path: music, volume: 50 },
    output,
    scratch,
    signal: new AbortController().signal,
    log: silent,
    onProgress: () => undefined,
  });

  // 12 s of timeline at 1.25× is 9.6 s, and the tone now runs 2.4 s to 5.6 s.
  const durationMs = await probeDurationMs(ffmpeg, output, new AbortController().signal, silent);
  expect(durationMs).toBeGreaterThan(9500);
  expect(durationMs).toBeLessThan(9750);
  expect(band(output, 2.8, 5.2, 440)).toBeGreaterThan(band(output, 6.2, 7.2, 440) + 20);
  // The music plays through the silence, looped, and dips while the narration speaks.
  const before = band(output, 1.2, 2.2, 1000);
  const under = band(output, 3.2, 5.0, 1000);
  const after = band(output, 6.2, 7.2, 1000);
  expect(before).toBeGreaterThan(-40);
  expect(after).toBeGreaterThan(-40);
  expect(under).toBeLessThan(before - 6);
  expect(under).toBeLessThan(after - 6);
  // Faded out by the end.
  expect(band(output, 9.3, 9.55, 1000)).toBeLessThan(after - 10);

  // The title is on screen from the first frame, above the captions' band, which is still
  // empty then; the caption comes at 2.56 s, 0.8 of its 3.2 s.
  expect(brightIn(output, 0.1, 180, 260)).toBeGreaterThan(500);
  expect(brightIn(output, 9.4, 180, 260)).toBeGreaterThan(500);
  expect(brightIn(output, 0.1, 1070, 240)).toBe(0);
  expect(brightIn(output, 2.3, 1070, 240)).toBe(0);
  expect(brightIn(output, 3.0, 1070, 240)).toBeGreaterThan(500);
});
