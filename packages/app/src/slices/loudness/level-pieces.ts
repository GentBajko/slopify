import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { type FfmpegRun, levelFile, measurable } from "./loudnorm.js";
import { type LoudnessReport, pieceLufs, pieceTruePeak, spreadOf } from "./model.js";
import { lowerOpening } from "./opening-level.js";

// Every narration piece brought to the one common loudness before the join (`levelFile`), its
// louder opening lowered first (`opening-level.ts`), each
// written again as a WAV in `directory` for the join to read in their place. They come out in one format (44.1 kHz mono, which is what the
// multi-voice join already brings every turn to), so the plain concat can join them too. A piece
// too short or quiet to measure keeps its own level. Each levelled piece is measured again, so
// the report says what the levelling did, not what it meant to do.

const format = { sampleRate: 44100, channels: 1 } as const;
const goal = { lufs: pieceLufs, truePeak: pieceTruePeak } as const;

export async function levelPieces(
  run: FfmpegRun,
  files: readonly string[],
  directory: string,
): Promise<{ readonly files: readonly string[]; readonly report: LoudnessReport }> {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const levelled: string[] = [];
  const before: number[] = [];
  const after: number[] = [];
  let skipped = 0;
  for (const [index, file] of files.entries()) {
    run.signal.throwIfAborted();
    const output = join(directory, `piece-${String(index + 1).padStart(4, "0")}.wav`);
    // The voice starts each request louder than it keeps; that opening comes down first.
    const opened = `${output}.opening.wav`;
    const lowered = await lowerOpening(run, file, opened);
    const measured = await levelFile(run, lowered ? opened : file, output, goal, format);
    if (lowered) rmSync(opened, { force: true });
    levelled.push(output);
    if (!measurable(measured.before)) {
      skipped += 1;
      continue;
    }
    before.push(measured.before.integrated);
    if (measurable(measured.after)) after.push(measured.after.integrated);
  }
  return {
    files: levelled,
    report: {
      pieces: files.length,
      skipped,
      spreadBefore: spreadOf(before),
      spreadAfter: spreadOf(after),
      target: pieceLufs,
    },
  };
}
