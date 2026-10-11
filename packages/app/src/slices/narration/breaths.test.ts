import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveFfmpeg } from "../video/ffmpeg.js";
import { removeBreaths, wavHeader } from "./breaths.js";
import { ms, noise, pcm, silence, tone } from "./breaths-fixture.js";
import { breathsOfForm, breathsOn } from "./breaths-model.js";

describe("the Remove breaths setting", () => {
  it("is off unless switched on, and only on is kept on the run", () => {
    expect(breathsOn({})).toBe(false);
    expect(breathsOn({ removeBreaths: false })).toBe(false);
    expect(breathsOn({ removeBreaths: true })).toBe(true);
    expect(breathsOfForm({})).toEqual({});
    expect(breathsOfForm({ removeBreaths: false })).toEqual({});
    expect(breathsOfForm({ removeBreaths: true })).toEqual({ removeBreaths: true });
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
  expect(bytes.toString("ascii", 36, 40)).toBe("data");
  const data = bytes.subarray(44);
  return Int16Array.from({ length: data.length / 2 }, (_one, at) => data.readInt16LE(at * 2));
}

describe.skipIf(!present)("Remove breaths with the bundled ffmpeg", () => {
  it("writes each piece again with its breath muted, every word and its length kept", async () => {
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
    const done = await removeBreaths(run, [input, input], join(scratch, "out"));
    expect(done.removed).toBe(2);
    expect(done.files).toHaveLength(2);
    const out = samplesOf(done.files[0] as string);
    expect(out.length).toBe(clip.length);
    expect(out.subarray(0, ms(1000))).toEqual(clip.subarray(0, ms(1000)));
    expect(out.subarray(ms(1550))).toEqual(clip.subarray(ms(1550)));
    const loudest = (samples: Int16Array) =>
      Math.max(...Array.from(samples.subarray(ms(1110), ms(1440)), Math.abs));
    // -60 dB: a thousandth of the breath, give or take a rounding.
    expect(loudest(out)).toBeLessThanOrEqual(loudest(clip) / 1000 + 1);
  }, 60_000);

  it("says which piece failed and where to turn the setting off", async () => {
    const run = { bin, log, signal: new AbortController().signal };
    const missing = join(scratch, "missing.wav");
    await expect(removeBreaths(run, [missing], join(scratch, "bad"))).rejects.toThrow(
      /Remove breaths could not process narration piece 1 .*Edit project → Pauses and volume/,
    );
  }, 60_000);
});
