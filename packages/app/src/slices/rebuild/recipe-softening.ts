import type { FingerprintValue } from "../../kernel/runner/work.js";
import { audioRecipes } from "./recipe-audio.js";
import type { RecipeContext } from "./recipe-model.js";
import type { TextRecipes } from "./recipe-text.js";

// Soften breaths and Soften S sounds change how the narration sounds and never move a word: the
// pauses are planned from the pieces as spoken, and a softened breath keeps its length. The word
// timing reads the joined narration, so turning them on would time every word again and write
// again what is written from the timing (the description and the shorts' pick, which are text
// calls), to the same result. This finds the timelines the project's finished timing may have
// been made from: the same narration with fewer of the two softenings on, each join as it was
// made then (its file and length, from the version's history). The word timing keeps a
// finished timing made from one of them (`recipe-exports.ts`).
export function unsoftenedTimelines(
  context: RecipeContext,
  text: TextRecipes,
): readonly FingerprintValue[] {
  const { config } = context;
  const on = (["removeBreaths", "deEss"] as const).filter((key) => config[key] === true);
  if (on.length === 0) return [];
  const past = context.history ?? context.manifest;
  // Each way of having fewer of them on: both off first, then one at a time.
  const variants = on.length === 2 ? [on, ["removeBreaths"], ["deEss"]] : [on];
  return variants.flatMap((off) => {
    const softer = { ...config };
    for (const key of off) delete (softer as Record<string, unknown>)[key];
    const plain = audioRecipes({ ...context, config: softer }, text);
    const entries = plain.timeline as readonly {
      readonly audio: readonly [string, unknown];
      readonly transcript: FingerprintValue;
    }[];
    const timeline = entries.map((entry, at) => {
      const key = plain.keys[at];
      const made = past.outputs.find(
        (row) => row.workKey === key && row.fingerprint === entry.audio[0] && row.state === "ready",
      );
      return made === undefined
        ? undefined
        : {
            audio: [entry.audio[0], made.assetId],
            transcript: entry.transcript,
            durationMs: made.output.durationMs ?? null,
          };
    });
    return timeline.every((entry) => entry !== undefined) && timeline.length > 0 ? [timeline] : [];
  });
}
