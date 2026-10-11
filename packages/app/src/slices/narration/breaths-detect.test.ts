import { describe, expect, it } from "vitest";
import {
  breathRate,
  findBreaths,
  powerSpectrumCentroid,
  type Stretch,
  scanBreaths,
  softenChunk,
} from "./breaths-detect.js";
import { chunked, ms, noise, pcm, seeded, silence, tone } from "./breaths-fixture.js";

const speech = 0.125; // about -18 dB RMS
const breathLevel = 0.03; // about -30 dB RMS

const lowGain = 10 ** (-12 / 20);

function softened(samples: Int16Array, stretches: readonly Stretch[]): Int16Array {
  return softenChunk(samples, 0, stretches);
}

function rmsDb(samples: Int16Array, from: number, to: number): number {
  let sum = 0;
  for (let at = from; at < to; at += 1) sum += ((samples[at] ?? 0) / 32768) ** 2;
  return 20 * Math.log10(Math.sqrt(sum / Math.max(1, to - from)) + 1e-9);
}

describe("the breath detector", () => {
  const word = tone(ms(1000), speech);
  const gap = silence(ms(100));
  const breath = noise(ms(350), 900, 2400, breathLevel, 7);
  const clip = pcm([word, gap, breath, gap, word]);
  const breathStart = ms(1100);
  const breathEnd = ms(1450);
  const secondWord = ms(1550);

  it("finds a low, noisy breath between two words and turns it down 12 dB, not to silence", async () => {
    const stretches = await findBreaths(chunked(clip));
    expect(stretches).toHaveLength(1);
    const [found] = stretches as [Stretch];
    expect(found.start).toBeLessThanOrEqual(breathStart + ms(10));
    expect(found.end).toBeGreaterThanOrEqual(breathEnd - ms(10));
    const out = softened(clip, stretches);
    const inner = [found.start + ms(45), found.end - ms(45)] as const;
    expect(rmsDb(clip, breathStart, breathEnd)).toBeGreaterThan(-32);
    expect(rmsDb(out, ...inner)).toBeCloseTo(rmsDb(clip, ...inner) - 12, 1);
  });

  it("leaves a stretch alone whose loudest 10 ms is above the word ceiling", async () => {
    // A word sound inside the breath: 30 ms at about -24 dB. The voice here is about -18 dB, so
    // the breath ceiling the detector reads is -22.7 dB (so it is still found) and the word
    // ceiling -26.7 dB (-26 at the calibration of -17.26).
    const word = noise(ms(30), 900, 2400, 0.063, 9);
    const touched = pcm([
      tone(ms(1000), speech),
      gap,
      noise(ms(150), 900, 2400, breathLevel, 7),
      word,
      noise(ms(180), 900, 2400, breathLevel, 8),
      gap,
      tone(ms(1000), speech),
    ]);
    const scan = await scanBreaths(chunked(touched));
    expect(scan.stretches).toEqual([]);
    expect(scan.skipped).toHaveLength(1);
    expect(softened(touched, scan.stretches)).toEqual(touched);
  });

  it("never reaches into the words on either side", async () => {
    const stretches = await findBreaths(chunked(clip));
    const out = softened(clip, stretches);
    expect(out.subarray(0, ms(1000))).toEqual(clip.subarray(0, ms(1000)));
    expect(out.subarray(secondWord)).toEqual(clip.subarray(secondWord));
    for (const one of stretches) {
      expect(one.start).toBeGreaterThanOrEqual(ms(1000));
      expect(one.end).toBeLessThanOrEqual(secondWord);
    }
  });

  it("leaves a fricative right after a word alone (its sound sits above 2.8 kHz)", async () => {
    const fricative = noise(ms(300), 4500, 8500, breathLevel, 11);
    const sibilant = pcm([word, fricative, silence(ms(300)), word]);
    expect(await findBreaths(chunked(sibilant))).toEqual([]);
  });

  it("leaves a noise shorter than 140 ms alone", async () => {
    const short = pcm([word, gap, noise(ms(100), 900, 2400, breathLevel, 5), gap, word]);
    expect(await findBreaths(chunked(short))).toEqual([]);
  });

  it("finds the same breath in a quieter voice, its levels read from the voice's own", async () => {
    const loud = await findBreaths(chunked(clip));
    const quiet = await findBreaths(chunked(pcm([word, gap, breath, gap, word], 0.5)));
    expect(quiet).toEqual(loud);
  });

  it("finds nothing in a clip without speech", async () => {
    expect(await findBreaths(chunked(new Int16Array(ms(2000))))).toEqual([]);
  });
});

describe("softening a stretch", () => {
  const flat = new Int16Array(ms(1000)).fill(10000);
  const start = ms(100);
  const end = ms(500);
  const fade = ms(45);

  it("turns it down 12 dB with 45 ms fades inside the stretch, never outside it", () => {
    const out = softenChunk(flat, 0, [{ start, end }]);
    expect(out[start - 1]).toBe(10000);
    expect(out[start]).toBe(10000);
    expect(out[end - 1]).toBe(10000);
    expect(out[end]).toBe(10000);
    const low = Math.round(10000 * lowGain);
    expect(out[start + fade - 1]).toBe(low);
    expect(out[ms(300)]).toBe(low);
    expect(out[end - fade]).toBe(low);
    // Linear: halfway down the fade is halfway between the two gains.
    const half = start + Math.round((fade - 1) / 2);
    expect(Math.abs((out[half] ?? 0) - (10000 + low) / 2)).toBeLessThan(10);
    expect(out[start + 100] ?? 0).toBeGreaterThan(out[start + 1000] ?? 0);
  });

  it("softens the right samples of a chunk that starts partway through the piece", () => {
    const out = softenChunk(flat.subarray(0, 1000), ms(300), [{ start, end }]);
    expect(out[0]).toBe(Math.round(10000 * lowGain));
    const after = softenChunk(flat.subarray(0, 1000), end, [{ start, end }]);
    expect(after[0]).toBe(10000);
  });

  it("leaves a stretch of 90 ms or less untouched", () => {
    expect(softenChunk(flat, 0, [{ start, end: start + ms(90) }])).toEqual(flat);
    const longer = softenChunk(flat, 0, [{ start, end: start + ms(90) + 2 }]);
    expect(longer).not.toEqual(flat);
  });
});

describe("the spectral centroid", () => {
  it("puts a pure tone at its own frequency", () => {
    const frame = new Float64Array(960);
    for (let at = 0; at < frame.length; at += 1)
      frame[at] = Math.sin((2 * Math.PI * 1000 * at) / breathRate);
    expect(Math.abs(powerSpectrumCentroid(frame) - 1000)).toBeLessThan(15);
  });

  it("matches a plain discrete Fourier transform of the Hann-windowed frame", () => {
    const random = seeded(3);
    const frame = Float64Array.from({ length: 960 }, () => random() * 2 - 1);
    let weighted = 0;
    let total = 0;
    for (let bin = 0; bin <= 480; bin += 1) {
      let re = 0;
      let im = 0;
      for (let at = 0; at < 960; at += 1) {
        const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * at) / 959);
        const angle = (-2 * Math.PI * bin * at) / 960;
        re += (frame[at] ?? 0) * hann * Math.cos(angle);
        im += (frame[at] ?? 0) * hann * Math.sin(angle);
      }
      const power = re * re + im * im;
      weighted += ((bin * breathRate) / 960) * power;
      total += power;
    }
    expect(powerSpectrumCentroid(frame)).toBeCloseTo(weighted / total, 6);
  });
});
