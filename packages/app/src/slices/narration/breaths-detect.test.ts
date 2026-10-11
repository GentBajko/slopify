import { describe, expect, it } from "vitest";
import {
  breathRate,
  findBreaths,
  muteChunk,
  powerSpectrumCentroid,
  type Stretch,
} from "./breaths-detect.js";
import { chunked, ms, noise, pcm, seeded, silence, tone } from "./breaths-fixture.js";

const speech = 0.125; // about -18 dB RMS
const breathLevel = 0.03; // about -30 dB RMS

function muted(samples: Int16Array, stretches: readonly Stretch[]): Int16Array {
  return muteChunk(samples, 0, stretches);
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

  it("finds a low, noisy breath between two words and mutes it", async () => {
    const stretches = await findBreaths(chunked(clip));
    expect(stretches).toHaveLength(1);
    const [found] = stretches as [Stretch];
    expect(found.start).toBeLessThanOrEqual(breathStart + ms(10));
    expect(found.end).toBeGreaterThanOrEqual(breathEnd - ms(10));
    const out = muted(clip, stretches);
    expect(rmsDb(clip, breathStart, breathEnd)).toBeGreaterThan(-32);
    expect(rmsDb(out, breathStart + ms(10), breathEnd - ms(10))).toBeLessThan(-85);
  });

  it("never reaches into the words on either side", async () => {
    const stretches = await findBreaths(chunked(clip));
    const out = muted(clip, stretches);
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

describe("muting a stretch", () => {
  const flat = new Int16Array(4000).fill(10000);

  it("fades down and back up inside the stretch, never outside it", () => {
    const out = muteChunk(flat, 0, [{ start: 1000, end: 2000 }]);
    expect(out[999]).toBe(10000);
    expect(out[1000]).toBe(10000);
    expect(out[2000]).toBe(10000);
    expect(out[1999]).toBe(10000);
    expect(Math.abs(out[1500] ?? 0)).toBeLessThanOrEqual(10);
    // 5 ms fades at 48 kHz: 240 samples each, falling then rising.
    expect(out[1120] ?? 0).toBeLessThan(10000);
    expect(out[1120] ?? 0).toBeGreaterThan(out[1239] ?? 0);
    expect(Math.abs(out[1240] ?? 0)).toBeLessThanOrEqual(10);
  });

  it("mutes the right samples of a chunk that starts partway through the piece", () => {
    const out = muteChunk(flat.subarray(0, 1000), 1500, [{ start: 1000, end: 2000 }]);
    expect(Math.abs(out[0] ?? 0)).toBeLessThanOrEqual(10);
    expect(out[600]).toBe(10000);
  });

  it("shortens the fades of a stretch shorter than two of them", () => {
    const out = muteChunk(flat, 0, [{ start: 100, end: 200 }]);
    expect(out[100]).toBe(10000);
    expect(out[199]).toBe(10000);
    expect(Math.abs(out[149] ?? 0)).toBeLessThanOrEqual(10);
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
