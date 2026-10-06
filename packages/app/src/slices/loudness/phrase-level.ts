import { rmSync, writeFileSync } from "node:fs";
import { runFfmpeg } from "../video/ffmpeg.js";
import { type Frame, parseFrames } from "./line-level.js";
import type { FfmpegRun } from "./loudnorm.js";

// The voice provider speaks a narration piece in one request, and now and then a phrase bursts
// out above the narration around it - above all the first words of a request, which start with
// more energy than the voice keeps. Levelling the piece by its average can't see a few loud
// seconds in four minutes. Before the piece is levelled, it is taken phrase by phrase (split at
// the dips between them), and each phrase whose loudest 400 ms reading is above the loud words
// of the half minute around it (their 90th percentile) is lowered by that much. The gain drops
// in the dip before a loud phrase and comes back slowly, no faster than `releaseDbPerSecond`,
// like a compressor letting go: snapping back after a lowered phrase made the next one jump
// out. Phrases at the usual level are left as they are, nothing moves in time, and the export's
// own levelling then brings the narration to its target, so it is not made quieter.

// How often the narration is taken phrase by phrase (`level-pieces.ts`): a second pass holds
// what is still loud against the narration the first left.
export const phrasePasses = 2;
// ceiling: the most a phrase is lowered.
const capDb = 8;
// A momentary reading under this is a pause, not speech.
const speechFloor = -45;
// The narration a phrase is held to: this long either side of it, and its loud words.
const contextSeconds = 30;
const loudShare = 0.9;
// A dip between two phrases is at least this far under the louder readings on both sides.
const dipLu = 6;
// The momentary window: a reading at t covers the 400 ms before it.
const windowSeconds = 0.4;
// Too little narration around a phrase to hold it to.
const contextReadingsMin = 50;
// How fast the gain comes back after a lowered phrase.
const releaseDbPerSecond = 1;
// The gain is worked out on the readings' own grid (ten a second).
const stepSeconds = 0.1;
// A change smaller than this isn't sent to the volume filter.
const changeDb = 0.05;

// The gain in dB from each time on (seconds into the piece), until the next.
export type PhraseGains = readonly { readonly at: number; readonly gainDb: number }[];

const rounded = (value: number) => Math.round(value * 100) / 100;

// The piece's phrases: its readings split at the dips between them.
export function phrasesOf(readings: readonly Frame[]): readonly (readonly Frame[])[] {
  const phrases: Frame[][] = [];
  let current: Frame[] = [];
  for (const [at, frame] of readings.entries()) {
    current.push(frame);
    const before = readings[at - 1];
    const after = readings[at + 1];
    if (before === undefined || after === undefined) continue;
    if (frame.momentary > before.momentary || frame.momentary > after.momentary) continue;
    const loudBefore = Math.max(...current.map((one) => one.momentary));
    const loudAfter = Math.max(...readings.slice(at + 1, at + 11).map((one) => one.momentary));
    if (
      loudBefore > speechFloor &&
      loudBefore - frame.momentary >= dipLu &&
      loudAfter - frame.momentary >= dipLu
    ) {
      phrases.push(current);
      current = [];
    }
  }
  if (current.length > 0) phrases.push(current);
  return phrases;
}

// What to lower, from the piece's EBU R128 readings; undefined when no phrase is louder than
// the narration around it.
export function phraseGains(frames: readonly Frame[]): PhraseGains | undefined {
  const speech = frames.filter((frame) => frame.momentary > speechFloor);
  // Each phrase's own need: lowered by what its loudest reading is over the loud words around.
  const needs = phrasesOf(frames).map((phrase) => {
    const from = phrase[0]?.t ?? 0;
    const to = phrase.at(-1)?.t ?? from;
    const around = speech
      .filter((frame) => frame.t >= from - contextSeconds && frame.t <= to + contextSeconds)
      .map((frame) => frame.momentary)
      .sort((a, b) => a - b);
    const peak = Math.max(...phrase.map((frame) => frame.momentary));
    const loud = around[Math.floor(around.length * loudShare)] ?? Number.POSITIVE_INFINITY;
    return {
      until: to - windowSeconds / 2,
      gainDb:
        around.length >= contextReadingsMin && peak > loud ? -Math.min(capDb, peak - loud) : 0,
    };
  });
  if (!needs.some((need) => need.gainDb < 0)) return undefined;
  const end = frames.at(-1)?.t ?? 0;
  const gains: { at: number; gainDb: number }[] = [];
  let phrase = 0;
  let gain = 0;
  let sent = Number.NaN;
  // Down at once to what a phrase needs, back up no faster than the release.
  for (let step = 0; step * stepSeconds <= end; step++) {
    const t = rounded(step * stepSeconds);
    while ((needs[phrase]?.until ?? Number.POSITIVE_INFINITY) <= t) phrase++;
    gain = Math.min(needs[phrase]?.gainDb ?? 0, gain + releaseDbPerSecond * stepSeconds);
    if (!(Math.abs(gain - sent) < changeDb)) {
      gains.push({ at: t, gainDb: rounded(gain) });
      sent = gain;
    }
  }
  return gains;
}

// `input` with its loud phrases lowered into `output` (16-bit PCM WAV). False, with nothing
// written, when no phrase is louder than the narration around it.
export async function lowerLoudPhrases(
  run: FfmpegRun,
  input: string,
  output: string,
): Promise<boolean> {
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
  const gains = phraseGains(parseFrames(stderr));
  if (gains === undefined) return false;
  // Each change, at its time, as a command to the volume filter.
  const commands = `${output}.phrases.txt`;
  writeFileSync(
    commands,
    gains
      .map(
        (one) =>
          `${one.at.toFixed(3)} volume@phrases volume ${(10 ** (one.gainDb / 20)).toFixed(5)};`,
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
        `asendcmd=f=${commands.replaceAll("\\", "/").replaceAll(":", "\\\\:")},volume@phrases=volume=1:precision=float:eval=frame`,
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
