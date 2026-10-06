import { runFfmpeg } from "../video/ffmpeg.js";
import { type Frame, parseFrames } from "./line-level.js";
import type { FfmpegRun } from "./loudnorm.js";

// A narration piece is one request to the voice provider, and the voice starts each request
// with more energy than it keeps: the first word bursts out, and the first sentence often sits
// above the rest of the piece. Levelling the piece by its average can't see a few loud seconds
// in four minutes, so every chunk of a long narration started louder. Before the piece is
// levelled, its opening is brought down to the piece's own level, and nothing else is touched:
// - the first word, when its loudest 400 ms reading is above the piece's loud moments (the 95th
//   percentile of its other readings);
// - the first sentence, when its typical level (median) is above the rest's.
// Each is lowered only by what it is over by more than `allowLu`, and the gain comes back in the
// pause after it, so no word is cut into and the timing stays. The export's own levelling then
// brings the whole narration to its target, so the narration as a whole is not made quieter.

// ceiling: how far over the piece's own level an opening may stay.
const allowLu = 1;
// ceiling: the most the first word and the first sentence are lowered.
const burstCapDb = 8;
const sentenceCapDb = 6;
// A momentary reading under this is a pause, not speech.
const speechFloor = -45;
// The readings that count as the first word, from the start of speech.
const burstSeconds = 1.6;
// The first sentence ends in the quietest reading this many seconds after speech starts.
const sentenceFrom = 4;
const sentenceTo = 8;
// The momentary window: a reading at t covers the 400 ms before it.
const windowSeconds = 0.4;
// Too short a piece has no rest to compare its opening with.
const restReadingsMin = 50;
// How long the gain takes to come back, in seconds.
const rampSeconds = 0.15;

export interface OpeningEnvelope {
  // The gain over the first word, in dB, and when it ends (seconds into the piece).
  readonly burstDb: number;
  readonly burstUntil: number;
  // The gain over the rest of the first sentence, and when it ends.
  readonly sentenceDb: number;
  readonly sentenceUntil: number;
}

const median = (values: readonly number[]): number =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? Number.NaN;

// The quietest reading between two times, as the middle of its window: the pause to change in.
function pauseIn(frames: readonly Frame[], from: number, to: number): number | undefined {
  let quiet: Frame | undefined;
  for (const frame of frames)
    if (
      frame.t >= from &&
      frame.t <= to &&
      (quiet === undefined || frame.momentary < quiet.momentary)
    )
      quiet = frame;
  return quiet === undefined ? undefined : quiet.t - windowSeconds / 2;
}

const rounded = (value: number) => Math.round(value * 100) / 100;

// What to lower, from the piece's EBU R128 readings; undefined when the opening is no louder.
export function openingEnvelope(frames: readonly Frame[]): OpeningEnvelope | undefined {
  const speech = frames.filter((frame) => frame.momentary > speechFloor);
  const first = speech[0];
  if (first === undefined) return undefined;
  const start = Math.max(0, first.t - windowSeconds);
  const sentenceUntil = pauseIn(frames, start + sentenceFrom, start + sentenceTo);
  if (sentenceUntil === undefined) return undefined;
  const sentence = speech.filter((frame) => frame.t <= sentenceUntil);
  const rest = speech
    .filter((frame) => frame.t > sentenceUntil + windowSeconds)
    .map((frame) => frame.momentary);
  if (rest.length < restReadingsMin || sentence.length === 0) return undefined;
  const sentenceOver = median(sentence.map((frame) => frame.momentary)) - median(rest) - allowLu;
  const sentenceDb = sentenceOver > 0 ? -Math.min(sentenceCapDb, sentenceOver) : 0;
  const loud = [...rest].sort((a, b) => a - b)[Math.floor(rest.length * 0.95)] ?? Number.NaN;
  const opening = speech.filter((frame) => frame.t <= start + burstSeconds);
  const peak = opening.reduce<Frame | undefined>(
    (best, frame) => (best === undefined || frame.momentary > best.momentary ? frame : best),
    undefined,
  );
  // The first word is lowered with the sentence; only what is still over comes off it alone.
  const burstOver = peak === undefined ? 0 : peak.momentary + sentenceDb - loud - allowLu;
  const burstDb = sentenceDb - (burstOver > 0 ? Math.min(burstCapDb, burstOver) : 0);
  if (burstDb === 0 && sentenceDb === 0) return undefined;
  const burstUntil =
    burstDb === sentenceDb || peak === undefined
      ? start
      : Math.min(
          sentenceUntil,
          pauseIn(frames, peak.t, start + burstSeconds + 1) ?? start + burstSeconds,
        );
  return {
    burstDb: rounded(burstDb),
    burstUntil: rounded(burstUntil),
    sentenceDb: rounded(sentenceDb),
    sentenceUntil: rounded(sentenceUntil),
  };
}

// The envelope as a gain over time, for ffmpeg's volume filter: each part holds its gain until
// it ends, then moves to the next over `rampSeconds`.
export function envelopeExpression(envelope: OpeningEnvelope): string {
  const linear = (db: number) => (10 ** (db / 20)).toFixed(5);
  const b = linear(envelope.burstDb);
  const s = linear(envelope.sentenceDb);
  const bu = envelope.burstUntil.toFixed(3);
  const br = (envelope.burstUntil + rampSeconds).toFixed(3);
  const su = Math.max(envelope.sentenceUntil, envelope.burstUntil + rampSeconds).toFixed(3);
  const sr = (
    Math.max(envelope.sentenceUntil, envelope.burstUntil + rampSeconds) + rampSeconds
  ).toFixed(3);
  const ramp = (from: string, to: string, at: string, end: string) =>
    `${from}+(${to}-${from})*(t-${at})/(${end}-${at})`;
  return `if(lt(t,${bu}),${b},if(lt(t,${br}),${ramp(b, s, bu, br)},if(lt(t,${su}),${s},if(lt(t,${sr}),${ramp(s, "1", su, sr)},1))))`;
}

// `input` with its opening lowered into `output` (16-bit PCM WAV). False, with nothing written,
// when the opening is no louder than the piece.
export async function lowerOpening(
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
  const envelope = openingEnvelope(parseFrames(stderr));
  if (envelope === undefined) return false;
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
      `volume=volume='${envelopeExpression(envelope)}':eval=frame:precision=float`,
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
  return true;
}
