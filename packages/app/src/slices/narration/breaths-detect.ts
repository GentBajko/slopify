import { setImmediate as nextTurn } from "node:timers/promises";

// The breath detector behind Remove breaths (`breaths-model.ts` says why). It reads 16-bit mono
// PCM at 48 kHz in 20 ms frames, 10 ms apart, and gives each frame three numbers: its level
// (RMS in dB), how often it crosses zero (noise crosses often, a voiced vowel seldom) and its
// spectral centroid (where its sound sits: an in-breath low, an "s" or "f" high).
// 1. A frame is breath-like when it is noisy (crosses zero in at least 6% of its samples),
//    between a whisper and speech in level, and centred under 2.8 kHz.
// 2. A run of breath-like frames 140 ms or longer is a breath. It grows back over the quiet
//    frames before it until silence, a voiced word's tail or a fricative, and forward over the
//    quiet after it until silence or the next word's voice.
// 3. Each breath is muted to -60 dB with 5 ms fades inside its own stretch: a fade outside
//    it once landed on the next word's first sound.
// Levels are relative to the voice's own: the median level of its voiced frames. A quieter or
// louder voice finds the same breaths. The thresholds are the ones of the prototype Gent
// approved by ear, on a narration whose median voiced frame is -21.03 dB.

export const breathRate = 48_000;
const frameLength = 960; // 20 ms
const hop = 480; // 10 ms

const referenceSpeech = -21.03;
const breathCeiling = -22;
const breathFloor = -55;
const voicedFloor = -42;
const silenceFloor = -58;
const noisyCrossings = 0.06;
const breathCentroid = 2800;
const breathFrames = 14; // 140 ms
// A voiced frame for the reference: under the noisy crossing rate and within 30 dB of the
// voice's loud frames (the 95th percentile).
const voicedSpan = 30;
const mutedGain = 10 ** (-60 / 20);
const fadeSamples = 240; // 5 ms
// ceiling: 200 frames (2 s of audio, about 15 ms of work) between yields, so a long piece never
// holds the server's event loop long enough for the page to notice.
const framesPerTurn = 200;

// A muted stretch, in samples of the piece at 48 kHz: [start, end).
export interface Stretch {
  readonly start: number;
  readonly end: number;
}

interface Features {
  readonly count: number;
  readonly db: Float32Array;
  readonly crossings: Float32Array;
  readonly centroid: Float32Array;
}

// Where the breaths are in a piece, read once from its PCM in order.
export async function findBreaths(
  chunks: Iterable<Int16Array> | AsyncIterable<Int16Array>,
): Promise<readonly Stretch[]> {
  return breathsIn(await featuresOf(chunks));
}

// The chunk starting `offset` samples into the piece with the stretches muted; a new array.
export function muteChunk(
  chunk: Int16Array,
  offset: number,
  stretches: readonly Stretch[],
): Int16Array {
  const out = Int16Array.from(chunk);
  const end = offset + chunk.length;
  for (const stretch of stretches) {
    if (stretch.end <= offset || stretch.start >= end) continue;
    const fade = Math.min(fadeSamples, Math.floor((stretch.end - stretch.start) / 2));
    const from = Math.max(stretch.start, offset);
    const to = Math.min(stretch.end, end);
    for (let at = from; at < to; at += 1) {
      const local = at - offset;
      out[local] = Math.round((chunk[local] ?? 0) * gainAt(stretch, fade, at));
    }
  }
  return out;
}

function gainAt(stretch: Stretch, fade: number, at: number): number {
  const into = at - stretch.start;
  if (into < fade) return fade === 1 ? 1 : 1 + ((mutedGain - 1) * into) / (fade - 1);
  const out = at - (stretch.end - fade);
  if (out >= 0) return fade === 1 ? 1 : mutedGain + ((1 - mutedGain) * out) / (fade - 1);
  return mutedGain;
}

async function featuresOf(
  chunks: Iterable<Int16Array> | AsyncIterable<Int16Array>,
): Promise<Features> {
  let capacity = 4096;
  let db = new Float32Array(capacity);
  let crossings = new Float32Array(capacity);
  let centroid = new Float32Array(capacity);
  let count = 0;
  const work = fftWorkspace();
  const frame = new Float64Array(frameLength);
  let carry = new Int16Array(0);
  let base = 0;
  for await (const chunk of chunks) {
    const pending = new Int16Array(carry.length + chunk.length);
    pending.set(carry);
    pending.set(chunk, carry.length);
    // A frame is read once a sample after it has arrived, so the last frame of the piece is
    // the last that ends before its final sample, as the prototype read it.
    while (count * hop + frameLength < base + pending.length) {
      if (count === capacity) {
        capacity *= 2;
        db = grown(db, capacity);
        crossings = grown(crossings, capacity);
        centroid = grown(centroid, capacity);
      }
      const start = count * hop - base;
      for (let at = 0; at < frameLength; at += 1) frame[at] = (pending[start + at] ?? 0) / 32768;
      db[count] = levelOf(frame);
      crossings[count] = crossingsOf(frame);
      centroid[count] = powerSpectrumCentroid(frame, work);
      count += 1;
      if (count % framesPerTurn === 0) await nextTurn();
    }
    const keep = count * hop - base;
    carry = pending.slice(keep);
    base += keep;
  }
  return { count, db, crossings, centroid };
}

function grown(values: Float32Array, capacity: number): Float32Array<ArrayBuffer> {
  const next = new Float32Array(capacity);
  next.set(values);
  return next;
}

function breathsIn(features: Features): readonly Stretch[] {
  const speech = speechLevel(features);
  if (speech === undefined) return [];
  const level = (prototype: number): number => prototype - referenceSpeech + speech;
  const ceiling = level(breathCeiling);
  const floor = level(breathFloor);
  const voicedAbove = level(voicedFloor);
  const silentBelow = level(silenceFloor);
  const { count, db, crossings, centroid } = features;
  const at = (values: Float32Array, index: number): number => values[index] ?? 0;
  const voiced = (index: number): boolean =>
    at(db, index) > voicedAbove && at(crossings, index) < noisyCrossings;
  const hit = (index: number): boolean =>
    at(crossings, index) >= noisyCrossings &&
    at(db, index) > floor &&
    at(db, index) < ceiling &&
    at(centroid, index) < breathCentroid;
  const stretches: Stretch[] = [];
  let i = 0;
  while (i < count) {
    if (!hit(i)) {
      i += 1;
      continue;
    }
    let j = i;
    while (j < count && hit(j)) j += 1;
    if (j - i >= breathFrames) {
      let a = i;
      while (
        a > 0 &&
        at(db, a - 1) > silentBelow &&
        !voiced(a - 1) &&
        at(centroid, a - 1) < breathCentroid
      )
        a -= 1;
      let b = j;
      while (b < count && at(db, b) > silentBelow && !voiced(b)) b += 1;
      stretches.push({ start: a * hop, end: (b - 1) * hop + frameLength });
    }
    i = j;
  }
  return stretches;
}

// The voice's own level: the median of its voiced frames, those under the noisy crossing rate
// within 30 dB of its loud frames. Undefined for a piece without a voiced frame.
function speechLevel(features: Features): number | undefined {
  if (features.count === 0) return undefined;
  const levels = features.db.slice(0, features.count).sort();
  const loud = percentile(levels, 0.95);
  const voiced: number[] = [];
  for (let index = 0; index < features.count; index += 1) {
    const db = features.db[index] ?? 0;
    if ((features.crossings[index] ?? 1) < noisyCrossings && db > loud - voicedSpan)
      voiced.push(db);
  }
  if (voiced.length === 0) return undefined;
  return percentile(Float32Array.from(voiced).sort(), 0.5);
}

// numpy's default: linear between the two nearest ranks of sorted values.
function percentile(sorted: Float32Array, share: number): number {
  const position = share * (sorted.length - 1);
  const below = Math.floor(position);
  const low = sorted[below] ?? 0;
  const high = sorted[Math.min(sorted.length - 1, below + 1)] ?? low;
  return low + (high - low) * (position - below);
}

function levelOf(frame: Float64Array): number {
  let sum = 0;
  for (const value of frame) sum += value * value;
  return 20 * Math.log10(Math.sqrt(sum / frame.length) + 1e-9);
}

// The share of neighbouring samples whose sign differs, a zero counting half.
function crossingsOf(frame: Float64Array): number {
  let sum = 0;
  let previous = Math.sign(frame[0] ?? 0);
  for (let at = 1; at < frame.length; at += 1) {
    const sign = Math.sign(frame[at] ?? 0);
    sum += Math.abs(sign - previous);
    previous = sign;
  }
  return sum / 2 / (frame.length - 1);
}

interface FftWorkspace {
  readonly re: Float64Array;
  readonly im: Float64Array;
  readonly outRe: Float64Array;
  readonly outIm: Float64Array;
  readonly tempRe: Float64Array;
  readonly tempIm: Float64Array;
  readonly cos: Float64Array;
  readonly sin: Float64Array;
  readonly hann: Float64Array;
}

function fftWorkspace(): FftWorkspace {
  const angle = (index: number): number => (2 * Math.PI * index) / frameLength;
  return {
    re: new Float64Array(frameLength),
    im: new Float64Array(frameLength),
    outRe: new Float64Array(frameLength),
    outIm: new Float64Array(frameLength),
    tempRe: new Float64Array(8),
    tempIm: new Float64Array(8),
    cos: Float64Array.from({ length: frameLength }, (_one, index) => Math.cos(angle(index))),
    sin: Float64Array.from({ length: frameLength }, (_one, index) => Math.sin(angle(index))),
    // numpy's hanning: symmetric, zero at both ends.
    hann: Float64Array.from(
      { length: frameLength },
      (_one, index) => 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (frameLength - 1)),
    ),
  };
}

// Where a 20 ms frame's sound sits, in Hz: the power-weighted mean frequency of its
// Hann-windowed spectrum, 0 for a silent frame.
export function powerSpectrumCentroid(
  frame: Float64Array,
  work: FftWorkspace = fftWorkspace(),
): number {
  for (let at = 0; at < frameLength; at += 1) {
    work.re[at] = (frame[at] ?? 0) * (work.hann[at] ?? 0);
    work.im[at] = 0;
  }
  transform(work, frameLength, 0, 1, 0);
  let weighted = 0;
  let total = 0;
  for (let bin = 0; bin <= frameLength / 2; bin += 1) {
    const power = (work.outRe[bin] ?? 0) ** 2 + (work.outIm[bin] ?? 0) ** 2;
    weighted += ((bin * breathRate) / frameLength) * power;
    total += power;
  }
  return total > 0 ? weighted / total : 0;
}

// A mixed-radix decimation-in-time FFT (960 = 2^6 * 3 * 5) from `work.re/im` into
// `work.outRe/outIm`: the n-point transform of the samples at `from`, `from + stride`, … is
// written at `to`.
function transform(work: FftWorkspace, n: number, from: number, stride: number, to: number): void {
  if (n === 1) {
    work.outRe[to] = work.re[from] ?? 0;
    work.outIm[to] = work.im[from] ?? 0;
    return;
  }
  const radix = n % 2 === 0 ? 2 : n % 3 === 0 ? 3 : n % 5 === 0 ? 5 : n;
  const m = n / radix;
  for (let r = 0; r < radix; r += 1)
    transform(work, m, from + r * stride, stride * radix, to + r * m);
  const step = frameLength / n;
  for (let k = 0; k < m; k += 1) {
    for (let q = 0; q < radix; q += 1) {
      let sumRe = 0;
      let sumIm = 0;
      for (let r = 0; r < radix; r += 1) {
        const twiddle = ((r * (k + q * m)) % n) * step;
        const c = work.cos[twiddle] ?? 1;
        const s = work.sin[twiddle] ?? 0;
        const yRe = work.outRe[to + r * m + k] ?? 0;
        const yIm = work.outIm[to + r * m + k] ?? 0;
        // y · e^(-iθ)
        sumRe += yRe * c + yIm * s;
        sumIm += yIm * c - yRe * s;
      }
      work.tempRe[q] = sumRe;
      work.tempIm[q] = sumIm;
    }
    for (let q = 0; q < radix; q += 1) {
      work.outRe[to + q * m + k] = work.tempRe[q] ?? 0;
      work.outIm[to + q * m + k] = work.tempIm[q] ?? 0;
    }
  }
}
