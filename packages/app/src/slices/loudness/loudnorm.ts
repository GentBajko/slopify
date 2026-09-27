import { z } from "zod";
import type { Log } from "../../kernel/log.js";
import { runFfmpeg } from "../video/ffmpeg.js";
import type { LoudnessGoal, MasterReport } from "./model.js";

// ffmpeg's loudnorm filter (EBU R128), two-pass: the first pass measures a file's integrated
// loudness (I), loudness range (LRA), true peak (TP) and gate threshold and prints them as
// JSON; the second pass gives those back as `measured_*`, so the filter can apply one fixed
// gain (`linear=true`) instead of riding the level through the file. Linear keeps the voice's
// own dynamics; loudnorm falls back to its dynamic mode by itself only when one gain would
// push the peaks over the ceiling. Hand-rolled argument lists, like every ffmpeg call here.

export type { LoudnessGoal } from "./model.js";

export interface Measured {
  readonly integrated: number;
  readonly truePeak: number;
  readonly range: number;
  readonly threshold: number;
  readonly offset: number;
}

export interface FfmpegRun {
  readonly bin: string;
  readonly log: Log;
  readonly signal: AbortSignal;
}

// ceiling: below -70 LUFS (the filter's absolute gate) or under 0.4 s (one measuring block)
// there is nothing to measure: a piece that quiet or short is left as it is.
const silentBelow = -70;

const measuredJson = z.object({
  input_i: z.string(),
  input_tp: z.string(),
  input_lra: z.string(),
  input_thresh: z.string(),
  target_offset: z.string(),
});

// The loudness range the second pass allows. loudnorm cannot stay linear when the file's own
// range is wider than its target, so the target follows the file, within the filter's bounds.
function rangeFor(measured: Measured | undefined): number {
  if (measured === undefined || !Number.isFinite(measured.range)) return 11;
  return Math.min(20, Math.max(7, Math.ceil(measured.range) + 1));
}

function goalFilter(goal: LoudnessGoal, measured?: Measured): string {
  const base = `loudnorm=I=${goal.lufs.toFixed(1)}:TP=${goal.truePeak.toFixed(1)}:LRA=${String(rangeFor(measured))}`;
  if (measured === undefined) return `${base}:print_format=json`;
  return `${base}:measured_I=${measured.integrated.toFixed(2)}:measured_TP=${measured.truePeak.toFixed(2)}:measured_LRA=${measured.range.toFixed(2)}:measured_thresh=${measured.threshold.toFixed(2)}:offset=${measured.offset.toFixed(2)}:linear=true:print_format=summary`;
}

// The first pass: decode, measure, write nothing. `input` is ffmpeg input arguments, so a
// filter graph (the video's mix) can be measured as well as a file.
export function measureArgs(input: readonly string[], goal: LoudnessGoal, chain = ""): string[] {
  return [
    "-hide_banner",
    "-nostdin",
    // loudnorm prints its JSON at the info level.
    "-loglevel",
    "info",
    "-nostats",
    ...input,
    "-af",
    `${chain === "" ? "" : `${chain},`}${goalFilter(goal)}`,
    "-f",
    "null",
    "-",
  ];
}

// The second pass's filter, and the resample loudnorm needs after it: it works, and writes,
// at 192 kHz. Unity for a piece there was nothing to measure in.
export function levelFilter(
  goal: LoudnessGoal,
  measured: Measured | undefined,
  sampleRate: number,
): string {
  const resample = `aresample=${String(sampleRate)}`;
  if (measured === undefined || !measurable(measured)) return resample;
  return `${goalFilter(goal, measured)},${resample}`;
}

export function measurable(measured: Measured): boolean {
  return Number.isFinite(measured.integrated) && measured.integrated > silentBelow;
}

// The last JSON block loudnorm printed. Its numbers are strings, and "-inf" for silence.
export function parseMeasured(stderr: string): Measured | undefined {
  const start = stderr.lastIndexOf("{");
  const end = stderr.lastIndexOf("}");
  if (start < 0 || end < start) return undefined;
  let raw: unknown;
  try {
    raw = JSON.parse(stderr.slice(start, end + 1));
  } catch {
    return undefined;
  }
  const parsed = measuredJson.safeParse(raw);
  if (!parsed.success) return undefined;
  const number = (text: string): number => {
    const value = Number(text);
    return Number.isNaN(value) ? Number.NEGATIVE_INFINITY : value;
  };
  return {
    integrated: number(parsed.data.input_i),
    truePeak: number(parsed.data.input_tp),
    range: number(parsed.data.input_lra),
    threshold: number(parsed.data.input_thresh),
    offset: number(parsed.data.target_offset),
  };
}

// Measure `input` (ffmpeg input arguments, `chain` an optional filter before the measurement).
export async function measure(
  run: FfmpegRun,
  input: readonly string[],
  goal: LoudnessGoal,
  chain = "",
): Promise<Measured> {
  let stderr = "";
  await runFfmpeg({
    bin: run.bin,
    args: measureArgs(input, goal, chain),
    signal: run.signal,
    log: run.log,
    onProgress: (): void => {},
    onStderr: (text) => {
      stderr += text;
    },
  });
  const measured = parseMeasured(stderr);
  if (measured === undefined)
    throw new Error(
      "Slopify couldn't measure the loudness of the narration (ffmpeg printed no measurement). Try again; if it happens again, turn off Level the volume in Edit project → Pauses and volume, then use Download diagnostics in Settings and report it.",
    );
  return measured;
}

export async function measureFile(
  run: FfmpegRun,
  path: string,
  goal: LoudnessGoal,
): Promise<Measured> {
  return measure(run, ["-i", path], goal);
}

// One file measured and written again at `goal`, as 16-bit PCM WAV at `sampleRate` with
// `channels` channels. Returns what the first pass measured.
export async function normalizeFile(
  run: FfmpegRun,
  input: string,
  output: string,
  goal: LoudnessGoal,
  format: { readonly sampleRate: number; readonly channels: number },
): Promise<Measured> {
  const measured = await measureFile(run, input, goal);
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
      "-map",
      "0:a:0",
      "-af",
      levelFilter(goal, measured, format.sampleRate),
      "-ac",
      String(format.channels),
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
  return measured;
}

// A finished file's sound brought to its master target, then measured again: what the export
// keeps on its output (`MasterReport`).
export async function masterFile(
  run: FfmpegRun,
  input: string,
  output: string,
  goal: LoudnessGoal,
  format: { readonly sampleRate: number; readonly channels: number },
): Promise<MasterReport> {
  await normalizeFile(run, input, output, goal, format);
  const check = await measureFile(run, output, goal);
  return {
    target: goal.lufs,
    integrated: Math.round(check.integrated * 10) / 10,
    truePeak: Math.round(check.truePeak * 10) / 10,
  };
}
