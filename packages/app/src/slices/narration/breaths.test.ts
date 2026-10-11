import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveFfmpeg } from "../video/ffmpeg.js";
import { softenBreaths, wavHeader } from "./breaths.js";
import { ms, noise, pcm, silence, tone } from "./breaths-fixture.js";
import { breathsOfForm, breathsOn, deEssOfForm, deEssOn } from "./breaths-model.js";
import { cleanPieces, deEssArgs } from "./clean-pieces.js";

describe("the Soften breaths setting", () => {
  it("is off unless switched on, and only on is kept on the run", () => {
    expect(breathsOn({})).toBe(false);
    expect(breathsOn({ removeBreaths: false })).toBe(false);
    expect(breathsOn({ removeBreaths: true })).toBe(true);
    expect(breathsOfForm({})).toEqual({});
    expect(breathsOfForm({ removeBreaths: false })).toEqual({});
    expect(breathsOfForm({ removeBreaths: true })).toEqual({ removeBreaths: true });
  });
});

describe("the Soften S sounds setting", () => {
  it("is off unless switched on, and only on is kept on the run", () => {
    expect(deEssOn({})).toBe(false);
    expect(deEssOn({ deEss: false })).toBe(false);
    expect(deEssOn({ deEss: true })).toBe(true);
    expect(deEssOfForm({})).toEqual({});
    expect(deEssOfForm({ deEss: false })).toEqual({});
    expect(deEssOfForm({ deEss: true })).toEqual({ deEss: true });
  });

  it("puts each piece through ffmpeg's de-esser at the approved, very light setting", () => {
    const args = deEssArgs("in.mp3", "out.wav");
    expect(args[args.indexOf("-af") + 1]).toBe("deesser=i=0.35:m=0.5:f=0.5");
    expect(args.at(-1)).toBe("out.wav");
  });
});

const bin = resolveFfmpeg(process.env, ffmpegStatic);
const present = existsSync(bin) || bin === "ffmpeg";
const log = { write: (): void => {} };
let scratch = "";

beforeAll(() => {
  scratch = mkdtempSync(join(tmpdir(), "slopify-breaths-"));
});
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

function samplesOf(path: string): Int16Array {
  const bytes = readFileSync(path);
  // ffmpeg may write a LIST chunk before the data.
  const found = bytes.indexOf("data", 12, "ascii");
  expect(found).toBeGreaterThan(0);
  const data = bytes.subarray(found + 8, found + 8 + bytes.readUInt32LE(found + 4));
  return Int16Array.from({ length: data.length / 2 }, (_one, at) => data.readInt16LE(at * 2));
}

describe.skipIf(!present)("Soften breaths with the bundled ffmpeg", () => {
  it("writes each piece again with its breath 12 dB down, every word and its length kept", async () => {
    const word = tone(ms(1000), 0.125);
    const clip = pcm([
      word,
      silence(ms(100)),
      noise(ms(350), 900, 2400, 0.03, 7),
      silence(ms(100)),
      word,
    ]);
    const input = join(scratch, "piece.wav");
    const bytes = Buffer.from(clip.buffer, clip.byteOffset, clip.byteLength);
    writeFileSync(input, Buffer.concat([wavHeader(bytes.length), bytes]));
    const run = { bin, log, signal: new AbortController().signal };
    const done = await softenBreaths(run, [input, input], join(scratch, "out"));
    expect(done.softened).toBe(2);
    expect(done.skipped).toBe(0);
    expect(done.files).toHaveLength(2);
    const out = samplesOf(done.files[0] as string);
    expect(out.length).toBe(clip.length);
    expect(out.subarray(0, ms(1000))).toEqual(clip.subarray(0, ms(1000)));
    expect(out.subarray(ms(1550))).toEqual(clip.subarray(ms(1550)));
    // Inside the 45 ms fades: a quarter of the breath (-12 dB), give or take a rounding.
    const loudest = (samples: Int16Array) =>
      Math.max(...Array.from(samples.subarray(ms(1160), ms(1390)), Math.abs));
    const quarter = loudest(clip) * 10 ** (-12 / 20);
    expect(Math.abs(loudest(out) - quarter)).toBeLessThanOrEqual(1);
  }, 60_000);

  it("says which piece failed and where to turn the setting off", async () => {
    const run = { bin, log, signal: new AbortController().signal };
    const missing = join(scratch, "missing.wav");
    await expect(softenBreaths(run, [missing], join(scratch, "bad"))).rejects.toThrow(
      /Soften breaths could not process narration piece 1 .*Edit project → Pauses and volume/,
    );
  }, 60_000);

  it("adds the de-esser to the pieces only when Soften S sounds is on, with or without breaths", async () => {
    const hiss = noise(ms(400), 5000, 9000, 0.1, 13);
    const clip = pcm([tone(ms(500), 0.125), hiss, tone(ms(500), 0.125)]);
    const input = join(scratch, "sibilant.wav");
    const bytes = Buffer.from(clip.buffer, clip.byteOffset, clip.byteLength);
    writeFileSync(input, Buffer.concat([wavHeader(bytes.length), bytes]));
    const run = { bin, log, signal: new AbortController().signal };
    const off = { breaths: false, deEss: false };
    expect(await cleanPieces(run, [input], join(scratch, "none"), off)).toBeUndefined();
    const breathsOnly = await cleanPieces(run, [input], join(scratch, "b"), {
      ...off,
      breaths: true,
    });
    expect(breathsOnly?.files[0]).toContain("breaths");
    const deEssed = await cleanPieces(run, [input], join(scratch, "d"), { ...off, deEss: true });
    expect(deEssed?.breaths).toBeUndefined();
    const both = await cleanPieces(run, [input], join(scratch, "bd"), {
      breaths: true,
      deEss: true,
    });
    expect(both?.breaths).toEqual({ softened: 0, skipped: 0 });
    for (const done of [deEssed, both]) {
      expect(done?.files[0]).toContain("deess");
      const out = samplesOf(done?.files[0] as string);
      expect(out.length).toBe(clip.length);
      // The hiss comes down; nothing else is asked of so light a setting.
      const energy = (samples: Int16Array) =>
        Array.from(samples.subarray(ms(550), ms(850))).reduce((sum, v) => sum + v * v, 0);
      expect(energy(out)).toBeLessThan(energy(clip));
    }
  }, 60_000);

  it("says which piece Soften S sounds failed on and where to turn it off", async () => {
    const run = { bin, log, signal: new AbortController().signal };
    await expect(
      cleanPieces(run, [join(scratch, "missing.wav")], join(scratch, "bad-d"), {
        breaths: false,
        deEss: true,
      }),
    ).rejects.toThrow(
      /Soften S sounds could not process narration piece 1 .*Edit project → Pauses and volume/,
    );
  }, 60_000);
});
