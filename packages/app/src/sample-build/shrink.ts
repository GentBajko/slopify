import type { Log } from "../kernel/log.js";
import { type LoudnessGoal, masterReport } from "../slices/loudness/loudnorm.js";
import { encodeHeadroom } from "../slices/loudness/model.js";

// The bundled samples are re-encoded smaller than the pipeline writes them (`generate.ts`,
// `demo-build.ts`), and a small AAC or MP3 encode lifts some passages' peaks by 2 to 4 dB. With
// Level the volume on, the sound is mastered again with its peaks held lower before that encode
// (`make` does both, for a given peak ceiling); an encode that still lands over the ceiling is
// made again with the sound held lower by the overshoot, up to three times.
export async function underCeiling(
  run: { readonly bin: string; readonly log: Log; readonly signal: AbortSignal },
  first: number,
  master: LoudnessGoal,
  encoded: string,
  make: (peak: number) => Promise<void>,
): Promise<void> {
  let peak = first;
  // The ceiling itself: the master's goal is already `encodeHeadroom` under it.
  const ceiling = master.truePeak + encodeHeadroom;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await make(peak);
    const measured = await masterReport(run, encoded, master);
    if (measured.truePeak <= ceiling) return;
    peak -= measured.truePeak - ceiling + 0.3;
  }
}
