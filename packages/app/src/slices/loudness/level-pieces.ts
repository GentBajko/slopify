import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { mapPieces } from "../narration/piece-jobs.js";
import { type FfmpegRun, levelFile, measurable } from "./loudnorm.js";
import { type LoudnessReport, pieceLufs, pieceTruePeak, spreadOf } from "./model.js";
import { lowerLoudPhrases, phrasePasses } from "./phrase-level.js";

// Every narration piece brought to the one common loudness before the join (`levelFile`), its
// loud phrases lowered first (`phrase-level.ts`), each
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
  // Level each sentence takes the place of the phrase step (`sentence-level.ts`).
  options: { readonly phrases: boolean } = { phrases: true },
): Promise<{ readonly files: readonly string[]; readonly report: LoudnessReport }> {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  // Each piece on its own, several at once (`narration/piece-jobs.ts`), the report made in order.
  const results = await mapPieces(run, files, async (file, index, own) => {
    const output = join(directory, `piece-${String(index + 1).padStart(4, "0")}.wav`);
    // A phrase that bursts out above the narration around it (most of all a request's first
    // words) comes down first, twice: once loud phrases are lowered, the narration's loud words
    // are quieter too, and an opening still stands above them. Quiet passages are never raised.
    let source = file;
    const made: string[] = [];
    for (let pass = 1; options.phrases && pass <= phrasePasses; pass++) {
      const phrased = `${output}.phrases-${String(pass)}.wav`;
      if (!(await lowerLoudPhrases(own, source, phrased))) break;
      made.push(phrased);
      source = phrased;
    }
    const measured = await levelFile(own, source, output, goal, format);
    for (const one of made) rmSync(one, { force: true });
    return { output, measured };
  });
  const levelled: string[] = [];
  const before: number[] = [];
  const after: number[] = [];
  let skipped = 0;
  for (const { output, measured } of results) {
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
