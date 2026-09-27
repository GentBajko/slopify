import type { FingerprintValue } from "../../kernel/runner/work.js";
import { pausesOf } from "../narration/pauses-model.js";

// Pauses between sentences (`narration/pauses-model.ts`) are made in the narration joins, so a
// join carries them in its values: the two minimums and, per piece, what follows it (the next
// piece across a sentence or paragraph end, a speaker's turn gap, or the end). Nothing at all
// while neither minimum is set, so every join made before them keeps its fingerprint. The
// levelled join copies these values, so it paces the pieces the same way.
export type PieceNext = "end" | "turn" | "sentence" | "paragraph";

export function pauseValues(
  config: {
    readonly sentencePauseSeconds?: number | undefined;
    readonly paragraphPauseSeconds?: number | undefined;
  },
  next: readonly PieceNext[],
): readonly FingerprintValue[] {
  const pauses = pausesOf(config);
  if (pauses === undefined) return [];
  return [["pauses-v1", pauses.sentenceSeconds, pauses.paragraphSeconds, [...next]]];
}
