import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, it } from "vitest";
import { audioExportArgs } from "../video/audio-export-args.js";
import { binary, wavParts } from "../video/export.fake.js";
import { runFfmpeg } from "../video/ffmpeg.js";
import { config } from "./recipe-fixture.js";
import { narrationTimeline } from "./runtime-export-inputs.js";

// The WAV export's timeline through the real bundled ffmpeg: the narration's parts joined in
// order with the configured silence between them and around them, and nothing added else.

const scratch = mkdtempSync(join(tmpdir(), "slopify-wav-join-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

function tone(name: string, extension: "wav" | "mp3", seconds: number): string {
  const path = join(scratch, `${name}.${extension}`);
  execFileSync(binary, [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=440:duration=${String(seconds)}:sample_rate=44100`,
    path,
  ]);
  return path;
}

const narrated = (gap: number, edge: number) => ({
  ...config,
  sources: { ...config.sources, audio: "generate" as const, video: "off" as const },
  intro: { name: "Intro", mode: "text" as const },
  outro: { name: "Outro", mode: "text" as const },
  silenceGapSeconds: gap,
  edgeSilenceSeconds: edge,
});

async function exported(
  name: string,
  timeline: ReturnType<typeof narrationTimeline>,
): Promise<ReturnType<typeof wavParts>> {
  const output = join(scratch, `${name}-export.wav`);
  await runFfmpeg({
    bin: binary,
    args: audioExportArgs(timeline, output),
    signal: new AbortController().signal,
    log: { write: () => undefined },
    onProgress: () => undefined,
  });
  return wavParts(output);
}

it("joins intro, body and outro with the configured silence between them", async () => {
  const timeline = narrationTimeline(narrated(0.15, 0), {
    intro: { path: tone("intro", "wav", 0.2), seconds: 0.2 },
    body: { path: tone("body", "mp3", 0.3), seconds: 0.3 },
    outro: { path: tone("outro", "wav", 0.2), seconds: 0.2 },
  });
  expect(timeline.map((segment) => segment.kind)).toEqual(["intro", "gap", "body", "gap", "outro"]);
  const wav = await exported("entries", timeline);
  expect([wav.signature, wav.container, wav.codec, wav.channels, wav.rate, wav.bits]).toEqual([
    "RIFF",
    "WAVE",
    1,
    2,
    48000,
    16,
  ]);
  expect(wav.duration).toBeCloseTo(1, 1);
  for (const at of [0.1, 0.45, 0.9]) expect(wav.peakAt(at)).toBeGreaterThan(1000);
  for (const at of [0.25, 0.7]) expect(wav.peakAt(at)).toBe(0);
});

it("puts the edge silence before and after the narration", async () => {
  const timeline = narrationTimeline(narrated(0, 0.5), {
    intro: undefined,
    body: { path: tone("edged", "wav", 0.3), seconds: 0.3 },
    outro: undefined,
  });
  expect(timeline.map((segment) => segment.kind)).toEqual(["edge", "body", "edge"]);
  const wav = await exported("edged", timeline);
  expect(wav.duration).toBeCloseTo(1.3, 2);
  expect(wav.peakAt(0.2)).toBe(0);
  expect(wav.peakAt(0.65)).toBeGreaterThan(1000);
  expect(wav.peakAt(1.1)).toBe(0);
});

it.each([0, 0.01])("honors a %s-second gap without adding silence at either end", async (gap) => {
  const timeline = narrationTimeline(narrated(gap, 0), {
    intro: { path: tone(`intro-${String(gap)}`, "wav", 0.2), seconds: 0.2 },
    body: { path: tone(`body-${String(gap)}`, "wav", 0.3), seconds: 0.3 },
    outro: undefined,
  });
  const wav = await exported(`gap-${String(gap)}`, timeline);
  expect(wav.duration).toBeCloseTo(0.5 + gap, 3);
  expect(wav.peakAt(0.001)).toBeGreaterThan(1000);
  expect(wav.peakAt(wav.duration - 0.02)).toBeGreaterThan(1000);
});
