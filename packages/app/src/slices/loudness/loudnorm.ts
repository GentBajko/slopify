import { renameSync } from "node:fs";
import { z } from "zod";
import type { Log } from "../../kernel/log.js";
import { runFfmpeg } from "../video/ffmpeg.js";
import type { LoudnessGoal, MasterReport } from "./model.js";

// Loudness in two passes. The first is ffmpeg's loudnorm filter (EBU R128) measuring a file:
// integrated loudness (I), loudness range (LRA), true peak (TP) and gate threshold, printed as
// JSON. The second applies the one fixed gain loudnorm's linear mode would, from those numbers,
// with ffmpeg's volume filter, so the voice keeps its own dynamics. Where that gain would push
// the peaks over the ceiling, a limiter running at 192 kHz (four times the usual rate, so it
// sees the peaks between the samples too) holds just those peaks. loudnorm's own second pass
// falls back to riding the whole level down in that case, and on anything shorter than its 3 s
// window, and lands a piece or a video 1 to 2 LU short; the gain lands on the level. A file that
// the limiter trimmed more than a fifth of a LU is corrected once (`levelFile`). Hand-rolled
// argument lists, like every ffmpeg call here.

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

function measureFilter(goal: LoudnessGoal): string {
  return `loudnorm=I=${goal.lufs.toFixed(1)}:TP=${goal.truePeak.toFixed(1)}:LRA=11:print_format=json`;
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
    // Only the sound is measured: a finished video's picture was decoded too, 20 minutes and
    // more of a CPU's time for a two-hour export, while the next render waited for it.
    "-vn",
    "-sn",
    "-dn",
    "-af",
    `${chain === "" ? "" : `${chain},`}${measureFilter(goal)}`,
    "-f",
    "null",
    "-",
  ];
}

// The second pass: the gain that lands the file on the level, the peak limiter where the gain
// would push the peaks over the ceiling, and the file's sample rate. Unity for a file there was
// nothing to measure in.
export function gainFilter(
  goal: LoudnessGoal,
  measured: Measured | undefined,
  sampleRate: number,
): string {
  const resample = `aresample=${String(sampleRate)}`;
  if (measured === undefined || !measurable(measured)) return resample;
  const gain = goal.lufs - measured.integrated;
  const limit =
    Number.isFinite(measured.truePeak) && measured.truePeak + gain > goal.truePeak
      ? `,aresample=192000,alimiter=limit=${(10 ** (goal.truePeak / 20)).toFixed(4)}:attack=5:release=50:level=false`
      : "";
  return `volume=${gain.toFixed(2)}dB${limit},${resample}`;
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

// One file measured and written again at `goal`, as WAV at `sampleRate` with `channels`
// channels (32-bit float, so nothing clips between here and the encode). Returns what the first
// pass measured.
export async function normalizeFile(
  run: FfmpegRun,
  input: string,
  output: string,
  goal: LoudnessGoal,
  format: { readonly sampleRate: number; readonly channels: number },
): Promise<Measured> {
  // The channels are set before anything is measured: a stereo file mixed down to mono is
  // louder per channel (the mix keeps its loudness, so each sample is about 3 dB higher), and
  // the gain and the peak ceiling have to hold for what is written.
  const channels = `aformat=channel_layouts=${format.channels === 1 ? "mono" : "stereo"}`;
  const measured = await measure(run, ["-i", input], goal, channels);
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
      `${channels},${gainFilter(goal, measured, format.sampleRate)}`,
      "-c:a",
      "pcm_f32le",
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

// ceiling: within a fifth of a LU of the level no one hears the difference.
const correctAbove = 0.2;

// One file brought to `goal` (`normalizeFile`), measured again, and corrected once when the
// limiter left it more than a fifth of a LU under the level. Returns the first measurement and
// the last.
export async function levelFile(
  run: FfmpegRun,
  input: string,
  output: string,
  goal: LoudnessGoal,
  format: { readonly sampleRate: number; readonly channels: number },
): Promise<{ readonly before: Measured; readonly after: Measured }> {
  const before = await normalizeFile(run, input, output, goal, format);
  let after = await measureFile(run, output, goal);
  if (measurable(after) && Math.abs(after.integrated - goal.lufs) > correctAbove) {
    const corrected = `${output}.corrected.wav`;
    await normalizeFile(run, output, corrected, goal, format);
    renameSync(corrected, output);
    after = await measureFile(run, output, goal);
  }
  return { before, after };
}

// A finished file's sound brought to its master target.
export async function masterFile(
  run: FfmpegRun,
  input: string,
  output: string,
  goal: LoudnessGoal,
  format: { readonly sampleRate: number; readonly channels: number },
): Promise<void> {
  await levelFile(run, input, output, goal, format);
}

// What a finished file measures, for its output (`MasterReport`).
export async function masterReport(
  run: FfmpegRun,
  file: string,
  goal: LoudnessGoal,
): Promise<MasterReport> {
  const check = await measureFile(run, file, goal);
  return {
    target: goal.lufs,
    integrated: Math.round(check.integrated * 10) / 10,
    truePeak: Math.round(check.truePeak * 10) / 10,
  };
}
