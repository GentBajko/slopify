import { breathRate } from "./breaths-detect.js";

// Synthetic narration at 48 kHz: a voiced tone stands for a word, band-limited noise for a
// breath (low band, under 2.8 kHz) or a fricative (high band, an "s" or "f").

export const ms = (value: number): number => Math.round((value / 1000) * breathRate);

export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

export function tone(length: number, rms: number): Float64Array {
  const out = new Float64Array(length);
  const amplitude = rms * Math.SQRT2;
  for (let at = 0; at < length; at += 1)
    out[at] = amplitude * Math.sin((2 * Math.PI * 180 * at) / breathRate);
  return out;
}

// Noise as many random-phase sines spread evenly over a band, scaled to the RMS asked for.
export function noise(
  length: number,
  low: number,
  high: number,
  rms: number,
  seed: number,
): Float64Array {
  const random = seeded(seed);
  const count = 48;
  const out = new Float64Array(length);
  for (let one = 0; one < count; one += 1) {
    const frequency = low + ((high - low) * (one + random())) / count;
    const phase = 2 * Math.PI * random();
    for (let at = 0; at < length; at += 1)
      out[at] = (out[at] ?? 0) + Math.sin((2 * Math.PI * frequency * at) / breathRate + phase);
  }
  const power = out.reduce((sum, value) => sum + value * value, 0) / length;
  const scale = rms / Math.sqrt(power);
  return out.map((value) => value * scale);
}

export function silence(length: number): Float64Array {
  return new Float64Array(length);
}

export function pcm(parts: readonly Float64Array[], gain = 1): Int16Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Int16Array(length);
  let at = 0;
  for (const part of parts)
    for (const value of part) {
      out[at] = Math.max(-32768, Math.min(32767, Math.round(value * gain * 32767)));
      at += 1;
    }
  return out;
}

// The whole clip in chunks of an odd size, so frames straddle the chunk edges.
export function* chunked(samples: Int16Array, size = 7777): Generator<Int16Array> {
  for (let at = 0; at < samples.length; at += size) yield samples.subarray(at, at + size);
}
