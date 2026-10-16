import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveFfmpeg } from "../video/ffmpeg.js";
import { levelSentences } from "./sentence-level.js";

// A project's folder carries its title, and a title like "Drizzt Do'Urden" has an apostrophe,
// which ffmpeg's filter syntax reads as a quote: the volume changes must still be applied there.

const bin = resolveFfmpeg(process.env, ffmpegStatic);
const present = existsSync(bin) || bin === "ffmpeg";
const run = { bin, log: { write: (): void => {} }, signal: new AbortController().signal };
let scratch = "";

beforeAll(() => {
  scratch = mkdtempSync(join(tmpdir(), "slopify-volume-commands-"));
});
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe.skipIf(!present)("volume changes in a folder whose name has an apostrophe", () => {
  it("levels the sentences of a piece in Drizzt Do'Urden's folder", async () => {
    const folder = join(scratch, "Drizzt Do'Urden - D&D Lore To Sleep To");
    mkdirSync(folder, { recursive: true });
    const piece = join(folder, "piece.wav");
    // Four three-second "sentences" with half a second of quiet between; the third is 6 dB quiet.
    execFileSync(bin, [
      "-v",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "aevalsrc='if(lt(mod(t,3.5),3),if(between(t,7,10),0.05,0.1)*sin(2*PI*220*t),0)':s=48000:d=14",
      "-c:a",
      "pcm_s16le",
      piece,
    ]);
    const result = await levelSentences(run, [piece], join(folder, "sentences"));
    expect(result.raised).toBeGreaterThan(0);
    expect(result.files[0]).not.toBe(piece);
    expect(existsSync(result.files[0] ?? "")).toBe(true);
  });
});
