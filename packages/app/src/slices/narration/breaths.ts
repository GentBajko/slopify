import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { errorText } from "../../kernel/errors.js";
import { editSettings } from "../../kernel/ports/settings-places.js";
import type { FfmpegRun } from "../loudness/loudnorm.js";
import { runFfmpeg } from "../video/ffmpeg.js";
import { breathRate } from "./breaths-detect.js";
import { pcmWavHeader, softenPcmInWorker } from "./breaths-worker.js";
import { mapPieces } from "./piece-jobs.js";

// Soften breaths, made in the join (`breaths-model.ts` says why there). Each narration piece is
// decoded by ffmpeg to 16-bit mono PCM at 48 kHz in a file beside it, read once to find its
// breaths (`breaths-detect.ts`) and once more to write it again as a WAV with them turned down. Both
// reads go in chunks of a second, so a long piece never sits in memory whole, and both run in a
// worker thread (`breaths-worker.ts`), so the server stays responsive while it works and
// several pieces are worked on at once. A piece without a
// breath is written again all the same: the join takes every piece in the one format.

export async function softenBreaths(
  run: FfmpegRun,
  files: readonly string[],
  directory: string,
): Promise<{
  readonly files: readonly string[];
  readonly softened: number;
  readonly skipped: number;
}> {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  // Several pieces at once (`piece-jobs.ts`); the counts are added up after, in order.
  const pieces = await mapPieces(run, files, async (file, index, own) => {
    const name = `breaths-${String(index + 1).padStart(4, "0")}`;
    const raw = join(directory, `${name}.pcm`);
    const output = join(directory, `${name}.wav`);
    try {
      await runFfmpeg({
        bin: own.bin,
        args: decodeArgs(file, raw),
        signal: own.signal,
        log: own.log,
        onProgress: (): void => {},
      });
      const counts = await softenPcmInWorker({ raw, output }, own.signal);
      return { output, ...counts };
    } catch (error) {
      if (own.signal.aborted) throw error;
      throw new Error(
        `Soften breaths could not process narration piece ${String(index + 1)} (${errorText(error)}), so the narration can't be joined together. Use Try again; if it fails again, turn off Soften breaths in ${editSettings.sound} and use Save changes, then use Download diagnostics in Settings and report it.`,
        { cause: error },
      );
    } finally {
      rmSync(raw, { force: true });
    }
  });
  const written = pieces.map((one) => one.output);
  const softened = pieces.reduce((sum, one) => sum + one.softened, 0);
  const skipped = pieces.reduce((sum, one) => sum + one.skipped, 0);
  return { files: written, softened, skipped };
}

export function decodeArgs(input: string, output: string): string[] {
  return [
    "-hide_banner",
    "-nostdin",
    "-loglevel",
    "error",
    "-nostats",
    "-y",
    "-i",
    input,
    "-map",
    "0:a:0",
    "-ac",
    "1",
    "-ar",
    String(breathRate),
    "-c:a",
    "pcm_s16le",
    "-f",
    "s16le",
    output,
  ];
}

// A canonical 44-byte header: PCM, mono, 16-bit, 48 kHz.
export function wavHeader(dataBytes: number): Buffer {
  return pcmWavHeader(dataBytes, breathRate);
}
