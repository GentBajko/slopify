import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { FfmpegRun } from "../loudness/loudnorm.js";
import { softenPcmInWorker } from "./breaths-worker.js";
import { deEssPieces } from "./clean-pieces.js";
import { applyPauses } from "./pauses.js";
import { mapPieces, pieceJobs } from "./piece-jobs.js";

const log = { write: (): void => {} };
const directories: string[] = [];
afterEach(() => {
  for (const one of directories.splice(0)) rmSync(one, { recursive: true, force: true });
});

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// The most calls running at once, read from a log of `start` and `end` lines.
function overlap(lines: readonly string[]): number {
  let now = 0;
  let most = 0;
  for (const line of lines) {
    now += line === "start" ? 1 : line === "end" ? -1 : 0;
    most = Math.max(most, now);
  }
  return most;
}

describe("narration pieces worked on at once", () => {
  it("takes a core in four, at least one and at most six", () => {
    expect(pieceJobs(32)).toBe(6);
    expect(pieceJobs(16)).toBe(4);
    expect(pieceJobs(4)).toBe(1);
    expect(pieceJobs(1)).toBe(1);
  });

  it("runs up to its limit at once and keeps the results in the pieces' order", async () => {
    const events: string[] = [];
    const run: FfmpegRun = { bin: "ffmpeg", log, signal: new AbortController().signal, jobs: 3 };
    const results = await mapPieces(run, [9, 8, 7, 6, 5, 4, 3, 2, 1, 0], async (delay, at) => {
      events.push("start");
      await wait(delay * 5);
      events.push("end");
      return `piece ${String(at)}`;
    });
    expect(results).toEqual(Array.from({ length: 10 }, (_one, at) => `piece ${String(at)}`));
    expect(overlap(events)).toBe(3);
  });

  it("stops what is going and starts nothing more once a piece fails", async () => {
    const started: number[] = [];
    const aborted: number[] = [];
    const run: FfmpegRun = { bin: "ffmpeg", log, signal: new AbortController().signal, jobs: 2 };
    await expect(
      mapPieces(run, [0, 1, 2, 3, 4, 5], async (item, _at, own) => {
        started.push(item);
        if (item === 1) {
          await wait(10);
          throw new Error("piece 2 failed");
        }
        await new Promise<void>((_resolve, reject) => {
          own.signal.addEventListener("abort", () => {
            aborted.push(item);
            reject(new Error("canceled"));
          });
        });
      }),
    ).rejects.toThrow("piece 2 failed");
    expect(started).toEqual([0, 1]);
    expect(aborted).toEqual([0]);
  });
});

describe("the breath worker", () => {
  it("stops when the run is cancelled, and its counts arrive when it is not", async () => {
    const directory = mkdtempSync(join(tmpdir(), "slopify-breath-worker-"));
    directories.push(directory);
    const raw = join(directory, "piece.pcm");
    // 60 s of quiet noise at 48 kHz: long enough to still be scanning when cancelled.
    const samples = new Int16Array(48_000 * 60);
    for (let at = 0; at < samples.length; at++) samples[at] = ((at * 7919) % 401) - 200;
    writeFileSync(raw, Buffer.from(samples.buffer));
    const controller = new AbortController();
    const started = Date.now();
    const cancelled = softenPcmInWorker(
      { raw, output: join(directory, "cancelled.wav") },
      controller.signal,
    );
    setTimeout(() => {
      controller.abort();
    }, 20);
    await expect(cancelled).rejects.toThrow("canceled");
    expect(Date.now() - started).toBeLessThan(1000);
    const counts = await softenPcmInWorker(
      { raw, output: join(directory, "done.wav") },
      new AbortController().signal,
    );
    expect(counts.softened).toBeGreaterThanOrEqual(0);
    expect(readFileSync(join(directory, "done.wav")).length).toBe(44 + samples.byteLength);
  });
});

// A stand-in for ffmpeg that logs when it starts and ends, takes `seconds`, and writes its last
// argument (the output) empty.
function fakeFfmpeg(seconds: number): { readonly run: FfmpegRun; readonly lines: () => string[] } {
  const directory = mkdtempSync(join(tmpdir(), "slopify-piece-jobs-"));
  directories.push(directory);
  const record = join(directory, "calls.log");
  const bin = join(directory, "ffmpeg");
  writeFileSync(
    bin,
    `#!/bin/sh\necho start >> "${record}"\nsleep ${String(seconds)} </dev/null >/dev/null 2>&1\nfor last; do :; done\n: > "$last"\necho end >> "${record}"\n`,
  );
  chmodSync(bin, 0o700);
  return {
    run: { bin, log, signal: new AbortController().signal, jobs: 4 },
    lines: () =>
      existsSync(record) ? readFileSync(record, "utf8").split("\n").filter(Boolean) : [],
  };
}

describe.skipIf(process.platform === "win32")("the join's steps with a slow ffmpeg", () => {
  it("softens S sounds and makes pauses in several pieces at once, in order", async () => {
    const fake = fakeFfmpeg(0.2);
    const directory = mkdtempSync(join(tmpdir(), "slopify-piece-jobs-out-"));
    directories.push(directory);
    const pieces = Array.from({ length: 8 }, (_one, at) => join(directory, `in-${String(at)}.wav`));
    const started = Date.now();
    const deEssed = await deEssPieces(fake.run, pieces, join(directory, "deess"));
    expect(deEssed).toEqual(
      pieces.map((_one, at) =>
        join(directory, "deess", `deess-${String(at + 1).padStart(4, "0")}.wav`),
      ),
    );
    const paced = await applyPauses(
      fake.run,
      deEssed,
      deEssed.map(() => ({ pauses: { inserts: [], leading: 0, trailing: 0 }, padEnd: 0 })),
      join(directory, "paced"),
    );
    expect(paced.files).toEqual(
      pieces.map((_one, at) =>
        join(directory, "paced", `paced-${String(at + 1).padStart(4, "0")}.wav`),
      ),
    );
    // Sixteen passes of 0.2 s, four at once: well under the 3.2 s one at a time takes.
    expect(Date.now() - started).toBeLessThan(2500);
    expect(fake.lines().filter((line) => line === "start")).toHaveLength(16);
    expect(overlap(fake.lines())).toBeGreaterThan(1);
    expect(overlap(fake.lines())).toBeLessThanOrEqual(4);
  });

  it("stops the passes going and starts no more when the run is cancelled", async () => {
    const fake = fakeFfmpeg(5);
    const directory = mkdtempSync(join(tmpdir(), "slopify-piece-jobs-out-"));
    directories.push(directory);
    const controller = new AbortController();
    const run = { ...fake.run, signal: controller.signal };
    const pieces = Array.from({ length: 8 }, (_one, at) => join(directory, `in-${String(at)}.wav`));
    const started = Date.now();
    const made = deEssPieces(run, pieces, join(directory, "deess"));
    setTimeout(() => {
      controller.abort();
    }, 300);
    await expect(made).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(2000);
    await wait(200);
    const lines = fake.lines();
    expect(lines.filter((line) => line === "start")).toHaveLength(4);
    expect(lines.filter((line) => line === "end")).toHaveLength(0);
  });
});
