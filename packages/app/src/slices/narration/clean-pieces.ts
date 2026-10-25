import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { errorText } from "../../kernel/errors.js";
import { editSettings } from "../../kernel/ports/settings-places.js";
import type { FfmpegRun } from "../loudness/loudnorm.js";
import { runFfmpeg } from "../video/ffmpeg.js";
import { softenBreaths } from "./breaths.js";
import { deEsser } from "./breaths-model.js";

// Soften breaths and Soften S sounds in the join (`breaths-model.ts`): the breaths first, then
// the de-esser, on the pieces as they will be joined, before the pauses are made. Each step is
// its own ffmpeg run or a chunked read that yields, so the server stays responsive.

export interface PieceCleaning {
  readonly breaths: boolean;
  readonly deEss: boolean;
}

export async function cleanPieces(
  run: FfmpegRun,
  files: readonly string[],
  directory: string,
  cleaning: PieceCleaning,
): Promise<
  | {
      readonly files: readonly string[];
      readonly breaths?: { readonly softened: number; readonly skipped: number };
    }
  | undefined
> {
  if (!cleaning.breaths && !cleaning.deEss) return undefined;
  const breaths = cleaning.breaths
    ? await softenBreaths(run, files, join(directory, "breaths"))
    : undefined;
  const soft = breaths?.files ?? files;
  const cleaned = cleaning.deEss ? await deEssPieces(run, soft, join(directory, "deess")) : soft;
  return {
    files: cleaned,
    ...(breaths === undefined
      ? {}
      : { breaths: { softened: breaths.softened, skipped: breaths.skipped } }),
  };
}

export async function deEssPieces(
  run: FfmpegRun,
  files: readonly string[],
  directory: string,
): Promise<readonly string[]> {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const written: string[] = [];
  for (const [index, file] of files.entries()) {
    run.signal.throwIfAborted();
    const output = join(directory, `deess-${String(index + 1).padStart(4, "0")}.wav`);
    try {
      await runFfmpeg({
        bin: run.bin,
        args: deEssArgs(file, output),
        signal: run.signal,
        log: run.log,
        onProgress: (): void => {},
      });
    } catch (error) {
      if (run.signal.aborted) throw error;
      throw new Error(
        `Soften S sounds could not process narration piece ${String(index + 1)} (${errorText(error)}), so the narration can't be joined together. Use Try again; if it fails again, turn off Soften S sounds in ${editSettings.sound} and use Save changes, then use Download diagnostics in Settings and report it.`,
        { cause: error },
      );
    }
    written.push(output);
  }
  return written;
}

export function deEssFilter(): string {
  return `deesser=i=${String(deEsser.intensity)}:m=${String(deEsser.max)}:f=${String(deEsser.frequency)}`;
}

// The piece's own rate and channels, written as 16-bit WAV like the other cleaned pieces.
export function deEssArgs(input: string, output: string): string[] {
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
    "-af",
    deEssFilter(),
    "-c:a",
    "pcm_s16le",
    "-f",
    "wav",
    output,
  ];
}
