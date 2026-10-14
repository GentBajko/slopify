import { spawn } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve as resolvePath } from "node:path";
import { measurePiece, type Silence } from "../narration/pauses.js";
import { runFfmpeg } from "../video/ffmpeg.js";
import type { FfmpegRun } from "./loudnorm.js";
import { sentenceLevel } from "./sentence-level-model.js";

export { sentenceLevel } from "./sentence-level-model.js";

// Level each sentence (`levelSentences` on a run's config). The voice provider reads a narration
// a request at a time, and inside a request the voice drifts: the first sentences come out
// louder, the last ones quieter, and now and then one line stands well above or below the lines
// around it. Levelling a request by its average can't see that. With the setting on, once each
// request is brought to the common level (`level-pieces.ts`, without the phrase step), every
// sentence is measured (its K-weighted loudness, gated as EBU R128 gates a programme) and moved
// toward the median of the sentences in the minute around it, across the joins between
// requests too. A loud sentence comes down by up to `lowerDb`, a quiet one up by up to
// `raiseDb`, and never so far that its loudest sample would pass `peakCeilingDb` (what comes
// after is written as 16-bit PCM). The gain changes only in the quiet between two sentences, so
// no word is cut into and nothing moves in time. It runs before Soften breaths and Soften S
// sounds, which then work on the levelled voice.

// Fewer neighbours than this within the context, and the context is doubled.
const neighboursMin = 6;
// A change smaller than this isn't sent to the volume filter.
const changeDb = 0.05;
// The meter's rate: K-weighting's filters are specified at 48 kHz.
const meterRate = 48000;
// One reading per 10 ms.
const frameSamples = 480;
const framesPerSecond = meterRate / frameSamples;

// ITU-R BS.1770 K-weighting at 48 kHz: a high shelf, then the RLB high-pass.
const shelf = {
  b: [1.53512485958697, -2.69169618940638, 1.19839281085285],
  a: [-1.69065929318241, 0.73248077421585],
} as const;
const highPass = {
  b: [1.0, -2.0, 1.0],
  a: [-1.99004745483398, 0.99007225036621],
} as const;

// K-weighted mean power and sample peak per 10 ms, fed samples (48 kHz mono) as they come.
export class Meter {
  private readonly power: number[] = [];
  private readonly peaks: number[] = [];
  private s1 = [0, 0, 0, 0];
  private s2 = [0, 0, 0, 0];
  private sum = 0;
  private peak = 0;
  private count = 0;

  feed(samples: Float32Array): void {
    const [b0, b1, b2] = shelf.b;
    const [a1, a2] = shelf.a;
    const [c0, c1, c2] = highPass.b;
    const [d1, d2] = highPass.a;
    let [x1, x2, y1, y2] = this.s1 as [number, number, number, number];
    let [u1, u2, v1, v2] = this.s2 as [number, number, number, number];
    for (const x of samples) {
      const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1;
      x1 = x;
      y2 = y1;
      y1 = y;
      const v = c0 * y + c1 * u1 + c2 * u2 - d1 * v1 - d2 * v2;
      u2 = u1;
      u1 = y;
      v2 = v1;
      v1 = v;
      this.sum += v * v;
      const level = Math.abs(x);
      if (level > this.peak) this.peak = level;
      this.count += 1;
      if (this.count === frameSamples) {
        this.power.push(this.sum / frameSamples);
        this.peaks.push(this.peak);
        this.sum = 0;
        this.peak = 0;
        this.count = 0;
      }
    }
    this.s1 = [x1, x2, y1, y2];
    this.s2 = [u1, u2, v1, v2];
  }

  readings(): { readonly power: readonly number[]; readonly peaks: readonly number[] } {
    return { power: this.power, peaks: this.peaks };
  }
}

const loudnessOf = (power: number) => -0.691 + 10 * Math.log10(Math.max(power, 1e-12));

// The gated loudness of readings `from` to `to` (seconds), as EBU R128 gates a programme: 400 ms
// blocks every 100 ms, those under -70 LUFS and those 10 LU under the rest left out. Undefined
// when nothing in it is loud enough to count.
export function gatedLoudness(
  power: readonly number[],
  from: number,
  to: number,
): number | undefined {
  const a = Math.max(0, Math.round(from * framesPerSecond));
  const b = Math.min(power.length, Math.round(to * framesPerSecond));
  if (b - a < 10) return undefined;
  const block = 40;
  const blocks: number[] = [];
  if (b - a < block) {
    let sum = 0;
    for (let at = a; at < b; at++) sum += power[at] ?? 0;
    blocks.push(sum / (b - a));
  } else
    for (let start = a; start + block <= b; start += 10) {
      let sum = 0;
      for (let at = start; at < start + block; at++) sum += power[at] ?? 0;
      blocks.push(sum / block);
    }
  const heard = blocks.filter((one) => loudnessOf(one) > -70);
  if (heard.length === 0) return undefined;
  const mean = (values: readonly number[]) =>
    values.reduce((sum, one) => sum + one, 0) / values.length;
  const relative = loudnessOf(mean(heard)) - 10;
  const kept = heard.filter((one) => loudnessOf(one) > relative);
  return kept.length === 0 ? undefined : loudnessOf(mean(kept));
}

export interface SentenceReading {
  // The sentence's middle, in seconds on the whole narration's time.
  readonly at: number;
  // Its gated loudness, LUFS; undefined when there was nothing to measure.
  readonly loudness: number | undefined;
  // Its loudest sample, dBFS.
  readonly peakDb: number;
}

const median = (values: readonly number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

// Each sentence's gain in dB: toward the median of its neighbours, within the caps.
export function sentenceGains(readings: readonly SentenceReading[]): readonly number[] {
  const gains = readings.map(() => 0);
  const known = readings.flatMap((one, at) => (one.loudness === undefined ? [] : [at]));
  for (let pass = 0; pass < sentenceLevel.passes; pass++) {
    const now = readings.map((one, at) =>
      one.loudness === undefined ? undefined : one.loudness + (gains[at] ?? 0),
    );
    for (const at of known) {
      const reading = readings[at] as SentenceReading;
      const near = (seconds: number) =>
        known.filter(
          (other) =>
            other !== at &&
            Math.abs((readings[other] as SentenceReading).at - reading.at) <= seconds,
        );
      let around = near(sentenceLevel.contextSeconds);
      if (around.length < neighboursMin) around = near(2 * sentenceLevel.contextSeconds);
      if (around.length === 0) continue;
      const target = median(around.map((other) => now[other] as number)) as number;
      const wanted = (gains[at] ?? 0) + target - (now[at] as number);
      const headroom = Math.max(0, sentenceLevel.peakCeilingDb - reading.peakDb);
      gains[at] = Math.max(
        -sentenceLevel.lowerDb,
        Math.min(sentenceLevel.raiseDb, headroom, wanted),
      );
    }
  }
  return gains.map((gain) => Math.round(gain * 100) / 100);
}

// What a piece is levelled in: its speech cut at each pause of at least `cutSeconds`, a part
// shorter than `partSecondsMin` joined to the one before (or after, for the first). These are
// sentences, and the halves of a long one; the gain only ever changes in such a pause.
export function speechSpans(
  durationSeconds: number,
  silences: readonly Silence[],
): readonly { readonly start: number; readonly end: number }[] {
  const edge = 0.02;
  const lead = silences.find((one) => one.start <= edge);
  const tail = silences.find((one) => one !== lead && one.end >= durationSeconds - edge);
  const start = lead?.end ?? 0;
  const end = tail?.start ?? durationSeconds;
  if (end <= start) return [];
  const spans: { start: number; end: number }[] = [];
  let from = start;
  for (const silence of silences) {
    if (silence === lead || silence === tail) continue;
    if (silence.end - silence.start < sentenceLevel.cutSeconds) continue;
    if (silence.start <= from || silence.end >= end) continue;
    spans.push({ start: from, end: silence.start });
    from = silence.end;
  }
  spans.push({ start: from, end });
  const merged: { start: number; end: number }[] = [];
  for (const span of spans) {
    const last = merged.at(-1);
    if (
      last !== undefined &&
      (span.end - span.start < sentenceLevel.partSecondsMin ||
        last.end - last.start < sentenceLevel.partSecondsMin)
    )
      last.end = span.end;
    else merged.push({ ...span });
  }
  return merged;
}

// A piece's gain changes: the first sentence's from the start, each next one's from the middle of
// the quiet before it. Spans and times are the piece's own.
export function gainChanges(
  spans: readonly { readonly start: number; readonly end: number }[],
  gains: readonly number[],
): readonly { readonly at: number; readonly gainDb: number }[] {
  const changes: { at: number; gainDb: number }[] = [];
  let sent = Number.NaN;
  for (const [index, span] of spans.entries()) {
    const gain = gains[index] ?? 0;
    if (Math.abs(gain - sent) < changeDb) continue;
    const before = spans[index - 1];
    changes.push({
      at: before === undefined ? 0 : Math.round(((before.end + span.start) / 2) * 1000) / 1000,
      gainDb: gain,
    });
    sent = gain;
  }
  return changes;
}

// The piece's readings: decoded to 48 kHz mono and metered as it streams.
export async function meterFile(
  run: FfmpegRun,
  file: string,
): Promise<{ readonly power: readonly number[]; readonly peaks: readonly number[] }> {
  const meter = new Meter();
  await new Promise<void>((resolve, reject) => {
    const executable =
      !isAbsolute(run.bin) && /[\\/]/.test(run.bin) ? resolvePath(run.bin) : run.bin;
    const child = spawn(
      executable,
      [
        "-hide_banner",
        "-nostdin",
        "-loglevel",
        "error",
        "-i",
        file,
        "-ac",
        "1",
        "-ar",
        String(meterRate),
        "-f",
        "f32le",
        "pipe:1",
      ],
      { stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
    );
    let carry = Buffer.alloc(0);
    let errors = "";
    child.stdout.on("data", (chunk: Buffer) => {
      const bytes = carry.length === 0 ? chunk : Buffer.concat([carry, chunk]);
      const whole = bytes.length - (bytes.length % 4);
      const aligned = new Float32Array(whole / 4);
      new Uint8Array(aligned.buffer).set(bytes.subarray(0, whole));
      meter.feed(aligned);
      carry = Buffer.from(bytes.subarray(whole));
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (text: string) => {
      errors = (errors + text).slice(-2000);
    });
    const stop = () => child.kill("SIGKILL");
    run.signal.addEventListener("abort", stop, { once: true });
    child.on("error", (error) => {
      run.signal.removeEventListener("abort", stop);
      reject(
        new Error(
          `Slopify could not start ffmpeg to measure the narration (${error.message}). Reinstall Slopify, then Try again.`,
        ),
      );
    });
    child.on("close", (code) => {
      run.signal.removeEventListener("abort", stop);
      if (run.signal.aborted) reject(new Error("the levelling was canceled"));
      else if (code === 0) resolve();
      else
        reject(
          new Error(
            `Slopify couldn't measure a narration piece's sentences (ffmpeg said: ${errors.trim().split("\n").at(-1) ?? "nothing"}). Try again; if it happens again, turn off Level each sentence in Edit project → Pauses and volume, then use Download diagnostics in Settings and report it.`,
          ),
        );
    });
  });
  return meter.readings();
}

// The pieces with each sentence levelled, as WAVs in `directory`, in the order given; a piece
// none of whose sentences moves is passed on as it is. Returns the files and how many sentences
// were raised and lowered by more than 1 dB.
export async function levelSentences(
  run: FfmpegRun,
  files: readonly string[],
  directory: string,
): Promise<{
  readonly files: readonly string[];
  readonly raised: number;
  readonly lowered: number;
  readonly sentences: number;
}> {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const measured: {
    spans: readonly { readonly start: number; readonly end: number }[];
    readings: SentenceReading[];
  }[] = [];
  let offset = 0;
  for (const file of files) {
    run.signal.throwIfAborted();
    const { durationSeconds, silences } = await measurePiece(run, file);
    const spans = speechSpans(durationSeconds, silences);
    const { power, peaks } = await meterFile(run, file);
    const readings = spans.map((span) => {
      let loudest = 0;
      const a = Math.max(0, Math.floor(span.start * framesPerSecond));
      const b = Math.min(peaks.length, Math.ceil(span.end * framesPerSecond));
      for (let at = a; at < b; at++) loudest = Math.max(loudest, peaks[at] ?? 0);
      return {
        at: offset + (span.start + span.end) / 2,
        loudness: gatedLoudness(power, span.start, span.end),
        peakDb: 20 * Math.log10(Math.max(loudest, 1e-9)),
      };
    });
    measured.push({ spans, readings });
    offset += durationSeconds;
  }
  const gains = sentenceGains(measured.flatMap((one) => one.readings));
  const written: string[] = [];
  let next = 0;
  for (const [index, file] of files.entries()) {
    run.signal.throwIfAborted();
    const { spans } = measured[index] as (typeof measured)[number];
    const own = gains.slice(next, next + spans.length);
    next += spans.length;
    const changes = gainChanges(spans, own);
    if (changes.every((one) => Math.abs(one.gainDb) < changeDb)) {
      written.push(file);
      continue;
    }
    const output = join(directory, `sentences-${String(index + 1).padStart(4, "0")}.wav`);
    const commands = `${output}.gains.txt`;
    writeFileSync(
      commands,
      changes
        .map(
          (one) =>
            `${one.at.toFixed(3)} volume@sentences volume ${(10 ** (one.gainDb / 20)).toFixed(5)};`,
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
          file,
          "-af",
          `asendcmd=f=${commands.replaceAll("\\", "/").replaceAll(":", "\\\\:")},volume@sentences=volume=${(10 ** ((changes[0]?.at === 0 ? changes[0].gainDb : 0) / 20)).toFixed(5)}:precision=float:eval=frame`,
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
    } finally {
      rmSync(commands, { force: true });
    }
    written.push(output);
  }
  return {
    files: written,
    raised: gains.filter((gain) => gain > 1).length,
    lowered: gains.filter((gain) => gain < -1).length,
    sentences: gains.length,
  };
}
