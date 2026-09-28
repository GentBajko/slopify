import { rmSync, writeFileSync } from "node:fs";
import { runFfmpeg } from "../video/ffmpeg.js";
import type { FfmpegRun } from "./loudnorm.js";

// Level the volume, line by line, for a narration with several speakers. The pieces are levelled
// before they are joined (`level-pieces.ts`), but a piece is one request to the voice provider,
// and with native dialogue one request speaks several people's lines. Its average hides them: a
// narrator with a few loud words averages the same as a character who speaks up throughout, and
// the character sits 2 dB above the narrator all the way. Once the words are timed, each line's
// typical level (the median of its 400 ms momentary loudness while it speaks) is brought to
// within `withinLu` of the narrator's; the gain changes in the pause between two lines, so no
// word is cut into and nothing moves in time, and the captions keep their timing.

// ceiling: how far from the narrator's typical level a line may stay.
export const withinLu = 1;
// ceiling: the most a line is moved either way; a line further off than this is left to the
// listener rather than turned into noise or distortion.
const gainCapDb = 10;
// A momentary reading under this is a pause, not speech.
const speechFloor = -45;
// The first readings of a line still hold the line before it (the window is 400 ms long).
const settleSeconds = 0.4;

export interface TimedLineWord {
  readonly start: number;
  readonly end: number;
  readonly speaker?: string | undefined;
}

export interface Line {
  readonly speaker: string;
  readonly start: number;
  readonly end: number;
}

export interface Frame {
  readonly t: number;
  readonly momentary: number;
}

// Consecutive words by one speaker, from the timed words, in `offset`'s time (the file's own).
export function linesOf(words: readonly TimedLineWord[], offset: number): readonly Line[] {
  const lines: Line[] = [];
  for (const word of words) {
    if (word.speaker === undefined) continue;
    const last = lines.at(-1);
    if (last !== undefined && last.speaker === word.speaker)
      lines[lines.length - 1] = { ...last, end: word.end - offset };
    else lines.push({ speaker: word.speaker, start: word.start - offset, end: word.end - offset });
  }
  return lines;
}

// Each line's gain in dB, and the time it starts at: the middle of the pause before the line.
export function lineGains(
  lines: readonly Line[],
  frames: readonly Frame[],
  narrator = "narrator",
): readonly { readonly at: number; readonly gainDb: number }[] {
  const typical = lines.map((line) => {
    const spoken = (from: number) =>
      frames
        .filter((frame) => frame.t >= from && frame.t <= line.end && frame.momentary > speechFloor)
        .map((frame) => frame.momentary)
        .sort((a, b) => a - b);
    // A short line has too few settled readings; its whole span is the best there is.
    const settled = spoken(line.start + settleSeconds);
    const readings = settled.length >= 3 ? settled : spoken(line.start);
    return readings.length === 0 ? undefined : readings[Math.floor(readings.length / 2)];
  });
  const median = (values: readonly number[]) =>
    [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const known = (values: readonly (number | undefined)[]) =>
    values.filter((value): value is number => value !== undefined);
  const reference =
    median(known(typical.filter((_value, at) => lines[at]?.speaker === narrator))) ??
    median(known(typical));
  if (reference === undefined) return [];
  return lines.map((line, at) => {
    const level = typical[at];
    const off = level === undefined ? 0 : level - reference;
    const gain = off > withinLu ? withinLu - off : off < -withinLu ? -withinLu - off : 0;
    const before = lines[at - 1];
    return {
      at: before === undefined ? 0 : (before.end + line.start) / 2,
      gainDb: Math.max(-gainCapDb, Math.min(gainCapDb, Math.round(gain * 100) / 100)),
    };
  });
}

// ffmpeg's EBU R128 readings, ten a second, as its verbose log prints them.
export function parseFrames(stderr: string): readonly Frame[] {
  const frames: Frame[] = [];
  for (const match of stderr.matchAll(/t:\s*([0-9.]+)\s+TARGET:[^\n]*?\sM:\s*(-?[0-9.]+)/g))
    frames.push({ t: Number(match[1]), momentary: Number(match[2]) });
  return frames;
}

// `input` levelled line by line into `output` (16-bit PCM WAV). `words` are timed on a timeline
// where the file starts at `offset` seconds. False, with nothing written, when there is nothing
// to level: no speakers in the words, or every line already within `withinLu`.
export async function levelLines(
  run: FfmpegRun,
  input: string,
  output: string,
  words: readonly TimedLineWord[],
  offset: number,
): Promise<boolean> {
  const lines = linesOf(words, offset);
  if (new Set(lines.map((line) => line.speaker)).size < 2) return false;
  let stderr = "";
  await runFfmpeg({
    bin: run.bin,
    args: [
      "-hide_banner",
      "-nostdin",
      "-v",
      "verbose",
      "-nostats",
      "-i",
      input,
      "-af",
      "ebur128",
      "-f",
      "null",
      "-",
    ],
    signal: run.signal,
    log: run.log,
    onProgress: (): void => {},
    onStderr: (text) => {
      stderr += text;
    },
  });
  const gains = lineGains(lines, parseFrames(stderr));
  if (gains.every((one) => one.gainDb === 0)) return false;
  // The gain for each line, set at its start by a timed command to the volume filter.
  const commands = `${output}.lines.txt`;
  writeFileSync(
    commands,
    gains
      .map(
        (one) =>
          `${Math.max(0, one.at).toFixed(3)} volume@lines volume ${(10 ** (one.gainDb / 20)).toFixed(5)};`,
      )
      .join("\n"),
    { mode: 0o600 },
  );
  try {
    await runFfmpeg({
      bin: run.bin,
      args: [
        "-hide_banner",
        "-nostdin",
        "-loglevel",
        "error",
        "-nostats",
        "-y",
        "-i",
        input,
        "-af",
        `asendcmd=f=${commands.replaceAll("\\", "/").replaceAll(":", "\\\\:")},volume@lines=volume=1:precision=float:eval=frame`,
        "-c:a",
        "pcm_s16le",
        "-f",
        "wav",
        output,
      ],
      signal: run.signal,
      log: run.log,
      onProgress: (): void => {},
    });
  } finally {
    rmSync(commands, { force: true });
  }
  return true;
}
