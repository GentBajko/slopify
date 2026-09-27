import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { joinNarration } from "../narration/concat.js";
import { joinTurns } from "../rebuild/runtime-local.js";
import { resolveFfmpeg } from "../video/ffmpeg.js";
import { levelPieces } from "./level-pieces.js";
import { levelFilter, masterFile, measureFile, parseMeasured } from "./loudnorm.js";
import { pieceLufs, pieceTruePeak, videoTruePeak } from "./model.js";

// Level the volume with the bundled ffmpeg: pieces made at very different loudness (a quiet
// voice around -30 LUFS, a loud one around -12) come out of the levelling within half a LU of
// the common level, joined single-voice or as speaker turns, and the master lands the whole
// within a LU of -14.

const bin = resolveFfmpeg(process.env, ffmpegStatic);
const present = existsSync(bin) || bin === "ffmpeg";
const log = { write: (): void => {} };
const signal = new AbortController().signal;
const run = { bin, log, signal };
const goal = { lufs: pieceLufs, truePeak: pieceTruePeak };
let scratch = "";

// A voice stand-in: a tone that comes and goes like speech, over pink noise, as a TTS-like mp3.
function piece(name: string, gainDb: number, seconds = 5, rate = 24000): string {
  const path = join(scratch, name);
  execFileSync(bin, [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=220:duration=${String(seconds)}:sample_rate=${String(rate)}`,
    "-f",
    "lavfi",
    "-i",
    `anoisesrc=c=pink:a=0.2:seed=7:d=${String(seconds)}:r=${String(rate)}`,
    "-filter_complex",
    `[0:a][1:a]amix=inputs=2:normalize=0,tremolo=f=3:d=0.7,volume=${String(gainDb)}dB[a]`,
    "-map",
    "[a]",
    "-ac",
    "1",
    "-c:a",
    "libmp3lame",
    "-b:a",
    "64k",
    path,
  ]);
  return path;
}

beforeAll(() => {
  scratch = mkdtempSync(join(tmpdir(), "slopify-loudness-"));
});
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe("parseMeasured", () => {
  it("reads loudnorm's JSON, silence as minus infinity", () => {
    const measured = parseMeasured(
      'noise\n[Parsed_loudnorm_0 @ 0x1]\n{\n\t"input_i" : "-inf",\n\t"input_tp" : "-inf",\n\t"input_lra" : "0.00",\n\t"input_thresh" : "-70.00",\n\t"output_i" : "-inf",\n\t"target_offset" : "inf"\n}\n',
    );
    expect(measured?.integrated).toBe(Number.NEGATIVE_INFINITY);
    expect(measured?.threshold).toBe(-70);
    expect(parseMeasured("no json here")).toBeUndefined();
  });

  it("leaves a piece there was nothing to measure in at unity", () => {
    const silent = {
      integrated: Number.NEGATIVE_INFINITY,
      truePeak: Number.NEGATIVE_INFINITY,
      range: 0,
      threshold: -70,
      offset: 0,
    };
    expect(levelFilter(goal, silent, 44100)).toBe("aresample=44100");
    expect(
      levelFilter(
        goal,
        { integrated: -30, truePeak: -12, range: 3, threshold: -40, offset: 0.1 },
        44100,
      ),
    ).toBe(
      "loudnorm=I=-18.0:TP=-2.0:LRA=7:measured_I=-30.00:measured_TP=-12.00:measured_LRA=3.00:measured_thresh=-40.00:offset=0.10:linear=true:print_format=summary,aresample=44100",
    );
  });
});

describe.skipIf(!present)("levelling with the bundled ffmpeg", () => {
  it("brings quiet and loud pieces to the common level, and the master to -14 LUFS", async () => {
    const quiet = piece("quiet.mp3", -5);
    const loud = piece("loud.mp3", 13);
    const middle = piece("middle.mp3", 4, 4, 44100);
    const before = [
      (await measureFile(run, quiet, goal)).integrated,
      (await measureFile(run, loud, goal)).integrated,
    ];
    // The stand-ins really are far apart, about -30 and -12 LUFS.
    expect(before[0]).toBeLessThan(-26);
    expect(before[1]).toBeGreaterThan(-15);

    const levelled = await levelPieces(run, [quiet, loud, middle], join(scratch, "pieces"));
    for (const file of levelled.files) {
      const after = await measureFile(run, file, goal);
      expect(Math.abs(after.integrated - pieceLufs)).toBeLessThanOrEqual(0.5);
      expect(after.truePeak).toBeLessThanOrEqual(pieceTruePeak + 0.3);
    }
    expect(levelled.report.pieces).toBe(3);
    expect(levelled.report.skipped).toBe(0);
    expect(levelled.report.spreadBefore).toBeGreaterThan(15);
    expect(levelled.report.spreadAfter).toBeLessThanOrEqual(0.5);

    const joined = join(scratch, "narration.mp3");
    const durationMs = await joinNarration(
      { bin, log },
      {
        files: levelled.files,
        output: joined,
        listPath: join(scratch, "parts.txt"),
        signal,
        reencode: true,
      },
    );
    expect(durationMs).toBeGreaterThan(13900);
    expect(durationMs).toBeLessThan(14200);
    // As long as the plain join the word timing reads, so the captions stay on the words.
    const plainMs = await joinNarration(
      { bin, log },
      {
        files: [quiet, loud, middle],
        output: join(scratch, "plain.mp3"),
        listPath: join(scratch, "plain.txt"),
        signal,
      },
    );
    expect(Math.abs(durationMs - plainMs)).toBeLessThanOrEqual(30);

    const report = await masterFile(
      run,
      joined,
      join(scratch, "master.wav"),
      { lufs: -14, truePeak: videoTruePeak },
      { sampleRate: 44100, channels: 2 },
    );
    expect(Math.abs(report.integrated - -14)).toBeLessThanOrEqual(1);
    expect(report.truePeak).toBeLessThanOrEqual(videoTruePeak + 0.5);
  }, 60_000);

  it("levels a multi-voice script's turns before they are joined", async () => {
    const host = piece("host.mp3", -3);
    const guest = piece("guest.mp3", 11, 5, 44100);
    const levelled = await levelPieces(run, [host, guest, host], join(scratch, "turns"));
    const output = join(scratch, "turns.mp3");
    const durationMs = await joinTurns(
      run,
      levelled.files,
      [
        [],
        [
          [1, 0.5],
          [1.1, 0.5],
          [1, 0],
        ],
      ],
      output,
    );
    expect(durationMs).toBeGreaterThan(14000);
    for (const file of levelled.files) {
      const after = await measureFile(run, file, goal);
      expect(Math.abs(after.integrated - pieceLufs)).toBeLessThanOrEqual(0.5);
    }
    // The joined turns sit at the common level too.
    const whole = await measureFile(run, output, goal);
    expect(Math.abs(whole.integrated - pieceLufs)).toBeLessThanOrEqual(1);
  }, 60_000);

  it("keeps a piece too quiet to measure as it is, and says so", async () => {
    const silence = join(scratch, "silence.mp3");
    execFileSync(bin, [
      "-v",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "anullsrc=r=24000:cl=mono",
      "-t",
      "1",
      "-c:a",
      "libmp3lame",
      silence,
    ]);
    const levelled = await levelPieces(run, [silence, piece("one.mp3", 0)], join(scratch, "q"));
    expect(levelled.report.skipped).toBe(1);
    expect(levelled.report.spreadAfter).toBe(0);
  }, 30_000);
});
