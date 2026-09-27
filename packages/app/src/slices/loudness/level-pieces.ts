import { mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { type FfmpegRun, measurable, measureFile, normalizeFile } from "./loudnorm.js";
import { type LoudnessReport, pieceLufs, pieceTruePeak, spreadOf } from "./model.js";

// Every narration piece brought to the one common loudness before the join (one fixed gain from
// loudnorm's measurement, `gainFilter`), each written again as a WAV in `directory` for the
// join to read in their place. They come out in one format (44.1 kHz mono, which is what the
// multi-voice join already brings every turn to), so the plain concat can join them too. A piece
// too short or quiet to measure keeps its own level. Each levelled piece is measured again, so
// the report says what the levelling did, not what it meant to do.

const format = { sampleRate: 44100, channels: 1 } as const;
const goal = { lufs: pieceLufs, truePeak: pieceTruePeak } as const;
// ceiling: within a fifth of a LU of the level no one hears the difference.
const correctAbove = 0.2;

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
    const measured = await normalizeFile(run, file, output, goal, format, "gain");
    levelled.push(output);
    if (!measurable(measured)) {
      skipped += 1;
      continue;
    }
    before.push(measured.integrated);
    let check = await measureFile(run, output, goal);
    // A piece whose peaks the limiter held comes out a little under the level: the gain is
    // corrected once from the levelled piece, and limited again.
    if (measurable(check) && Math.abs(check.integrated - goal.lufs) > correctAbove) {
      const corrected = `${output}.corrected.wav`;
      await normalizeFile(run, output, corrected, goal, format, "gain");
      renameSync(corrected, output);
      check = await measureFile(run, output, goal);
    }
    if (measurable(check)) after.push(check.integrated);
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
