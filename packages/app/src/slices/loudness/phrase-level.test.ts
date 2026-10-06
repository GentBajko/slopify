import { describe, expect, it } from "vitest";
import { phraseGains, phrasesOf } from "./phrase-level.js";

// Ten readings a second at `level` from `from` to `to` seconds.
const frames = (from: number, to: number, level: number) =>
  Array.from({ length: Math.round((to - from) * 10) }, (_value, at) => ({
    t: Math.round((from + at / 10) * 10) / 10,
    momentary: level,
  }));
// A phrase of `seconds` at `level`, then a 0.2 s dip.
const phrase = (from: number, seconds: number, level: number) => [
  ...frames(from, from + seconds, level),
  ...frames(from + seconds, from + seconds + 0.2, -60),
];
// A minute of narration from `from`: two-second phrases at -24 with a -20 one every fourth.
const narration = (from: number) =>
  Array.from({ length: 27 }, (_v, at) =>
    phrase(from + at * 2.2, 2, at % 4 === 0 ? -20 : -24),
  ).flat();

describe("lowering phrases that burst out of the narration around them", () => {
  it("splits the readings into phrases at the dips between them", () => {
    expect(phrasesOf([...phrase(0, 2, -20), ...phrase(2.2, 2, -24)])).toHaveLength(2);
  });

  it("leaves a narration with no phrase above its loud words", () => {
    expect(phraseGains(narration(0))).toBeUndefined();
  });

  it("lowers a loud phrase by its excess and lets go at 1 dB a second", () => {
    const gains = phraseGains([...phrase(0, 2, -14), ...narration(2.2)]) ?? [];
    // -14 is 6 over the loud words at -20.
    expect(gains[0]).toEqual({ at: 0, gainDb: -6 });
    const back = gains.find((one) => one.gainDb === 0);
    // Held through the phrase (until 1.9 s), then six seconds back to full.
    expect(back?.at).toBeGreaterThan(7.5);
    expect(back?.at).toBeLessThan(8.5);
    // Rising, never jumping: no step up bigger than a tenth of a second's release.
    for (const [at, one] of gains.entries())
      if (at > 0) expect(one.gainDb - (gains[at - 1]?.gainDb ?? 0)).toBeLessThanOrEqual(0.11);
  });

  it("lowers a burst in the middle of the narration as well, at most 8 dB", () => {
    const gains = phraseGains([...narration(0), ...phrase(59.4, 2, -6), ...narration(61.6)]) ?? [];
    expect(Math.min(...gains.map((one) => one.gainDb))).toBe(-8);
    expect(gains.find((one) => one.gainDb === -8)?.at).toBeCloseTo(59.4, 0);
  });
});
