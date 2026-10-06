import { describe, expect, it } from "vitest";
import { envelopeExpression, openingEnvelope } from "./opening-level.js";

// Ten readings a second at `level` from `from` to `to` seconds.
const frames = (from: number, to: number, level: number) =>
  Array.from({ length: Math.round((to - from) * 10) }, (_value, at) => ({
    t: Math.round((from + at / 10) * 10) / 10,
    momentary: level,
  }));
// Speech at -24 with a pause at 6 s, and a loud moment now and then later on.
const body = [
  ...frames(6, 6.5, -60),
  ...Array.from({ length: 60 }, (_v, at) =>
    frames(6.5 + at, 7.5 + at, at % 10 === 0 ? -20 : -24),
  ).flat(),
];

describe("lowering a narration piece's louder opening", () => {
  it("leaves a piece alone when its opening is no louder than the rest", () => {
    expect(openingEnvelope([...frames(0.4, 6, -24), ...body])).toBeUndefined();
  });

  it("lowers a first sentence above the rest by what it is over 1 LU, until its pause", () => {
    expect(openingEnvelope([...frames(0.4, 6, -21), ...body])).toEqual({
      burstDb: -2,
      burstUntil: 0,
      sentenceDb: -2,
      sentenceUntil: 5.8,
    });
  });

  it("lowers a first word that bursts out above the piece's loud moments, and only it", () => {
    const opening = [...frames(0.4, 1.3, -14), ...frames(1.3, 1.4, -50), ...frames(1.4, 6, -24)];
    const envelope = openingEnvelope([...opening, ...body]);
    expect(envelope?.sentenceDb).toBe(0);
    // -14 is 6 over the loud moments at -20: lowered by the 5 over the allowance.
    expect(envelope?.burstDb).toBe(-5);
    // Back in the pause after the word (1.3 s to 1.4 s).
    expect(envelope?.burstUntil).toBeGreaterThan(1);
    expect(envelope?.burstUntil).toBeLessThan(1.4);
  });

  it("leaves a piece too short to compare", () => {
    expect(openingEnvelope([...frames(0.4, 6, -14), ...frames(6, 8, -24)])).toBeUndefined();
  });

  it("writes the gain over time for ffmpeg, coming back to full in the pause", () => {
    expect(
      envelopeExpression({ burstDb: -6, burstUntil: 1, sentenceDb: -2, sentenceUntil: 5 }),
    ).toBe(
      "if(lt(t,1.000),0.50119,if(lt(t,1.150),0.50119+(0.79433-0.50119)*(t-1.000)/(1.150-1.000),if(lt(t,5.000),0.79433,if(lt(t,5.150),0.79433+(1-0.79433)*(t-5.000)/(5.150-5.000),1))))",
    );
  });
});
