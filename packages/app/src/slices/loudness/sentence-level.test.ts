import { describe, expect, it } from "vitest";
import {
  gainChanges,
  gatedLoudness,
  Meter,
  type SentenceReading,
  sentenceGains,
  sentenceLevel,
  speechSpans,
} from "./sentence-level.js";

// A sentence every 4 s at `level` LUFS, peaking 16 dB above it.
const readings = (levels: readonly number[]): SentenceReading[] =>
  levels.map((loudness, at) => ({ at: at * 4 + 2, loudness, peakDb: loudness + 16 }));

describe("levelling each sentence", () => {
  it("meters a 1 kHz tone as EBU R128 does: a -20 dBFS sine on one channel is -23 LUFS", () => {
    const meter = new Meter();
    const samples = new Float32Array(48000 * 3);
    for (let at = 0; at < samples.length; at++)
      samples[at] = 0.1 * Math.sin((2 * Math.PI * 997 * at) / 48000);
    meter.feed(samples.subarray(0, 12345));
    meter.feed(samples.subarray(12345));
    const { power, peaks } = meter.readings();
    expect(power).toHaveLength(300);
    expect(gatedLoudness(power, 0.5, 3)).toBeCloseTo(-23, 1);
    expect(Math.max(...peaks)).toBeCloseTo(0.1, 3);
  });

  it("leaves silence out of a sentence's loudness, as the programme gate does", () => {
    const power = [
      ...Array<number>(100).fill(10 ** ((-20 + 0.691) / 10)),
      ...Array<number>(100).fill(0),
    ];
    // Averaged with the silence it would read -23; only the blocks across the edge pull it down.
    expect(gatedLoudness(power, 0, 2)).toBeGreaterThan(-21);
    expect(gatedLoudness(power, 0, 2)).toBeLessThanOrEqual(-20 + 1e-9);
    expect(gatedLoudness(Array<number>(100).fill(0), 0, 1)).toBeUndefined();
  });

  it("brings a loud and a quiet sentence to the minute around them and leaves the rest", () => {
    const levels = Array<number>(15).fill(-20);
    levels[5] = -16;
    levels[9] = -22;
    const gains = sentenceGains(readings(levels));
    expect(gains[5]).toBeCloseTo(-4, 1);
    expect(gains[9]).toBeCloseTo(2, 1);
    expect(gains.filter((_gain, at) => at !== 5 && at !== 9).every((gain) => gain === 0)).toBe(
      true,
    );
  });

  it("raises a quiet sentence by at most 3 dB and lowers a loud one by at most 6 dB", () => {
    const levels = Array<number>(15).fill(-20);
    levels[3] = -12;
    levels[10] = -27;
    const gains = sentenceGains(readings(levels));
    expect(gains[3]).toBe(-sentenceLevel.lowerDb);
    expect(gains[10]).toBe(sentenceLevel.raiseDb);
  });

  it("never raises a sentence so far that its loudest sample passes -1 dBFS", () => {
    const quiet = readings(Array<number>(15).fill(-20)).map((one, at) =>
      at === 7 ? { ...one, loudness: -23, peakDb: -2.5 } : one,
    );
    expect(sentenceGains(quiet)[7]).toBeCloseTo(1.5, 2);
  });

  it("leaves a sentence it could not measure, and holds no one to it", () => {
    const levels: (number | undefined)[] = Array<number>(15).fill(-20);
    levels[4] = undefined;
    const gains = sentenceGains(
      levels.map((loudness, at) => ({ at: at * 4, loudness, peakDb: -10 })),
    );
    expect(gains.every((gain) => gain === 0)).toBe(true);
  });

  it("changes the gain in the middle of the quiet before a sentence, and only when it changes", () => {
    const spans = [
      { start: 0.2, end: 3 },
      { start: 3.6, end: 7 },
      { start: 7.4, end: 9 },
    ];
    expect(gainChanges(spans, [-2, -2, 1.5])).toEqual([
      { at: 0, gainDb: -2 },
      { at: 7.2, gainDb: 1.5 },
    ]);
  });

  it("cuts the speech at real pauses, joining a part too short to judge to its neighbour", () => {
    const silences = [
      { start: 0, end: 0.3 },
      { start: 3, end: 3.5 },
      { start: 4.2, end: 4.6 },
      { start: 9, end: 9.1 },
      { start: 12, end: 12.4 },
      { start: 15.8, end: 16 },
    ];
    // The 0.1 s dip is a breath, not a pause; the 0.7 s part after 3.5 s joins the one before.
    expect(speechSpans(16, silences)).toEqual([
      { start: 0.3, end: 4.2 },
      { start: 4.6, end: 12 },
      { start: 12.4, end: 15.8 },
    ]);
  });
});
