import type { FingerprintValue } from "../../kernel/runner/work.js";
import type { RunConfig } from "../admission/model.js";
import { usesLoudness } from "../loudness/model.js";
import { usesVoices } from "../voices/model.js";
import type { RecipeContext, ResolvedWorkRecipe } from "./recipe-model.js";

// Level the volume line by line (`loudness/line-level.ts`): a multi-voice run with Level the
// volume on. Its sound waits for the word timing, which says where each speaker's line is.
export function linesLevelled(config: RunConfig): boolean {
  return usesVoices(config) && usesLoudness(config) && config.sources.audio === "generate";
}

// What levelling line by line adds to a recipe that plays the sound: it waits for the word
// timing. No fingerprint value: the levelling follows from the narration and its timing, which
// the recipe already carries, so a project made before it (and the bundled samples) keeps its
// files, and whatever is rendered from now on is levelled. A change to how lines are levelled
// (`withinLu`) is the time to add one, and to rebuild the samples.
export function linePlan(
  context: RecipeContext,
  timing: ResolvedWorkRecipe | undefined,
): { readonly values: readonly FingerprintValue[]; readonly keys: readonly string[] } {
  if (!linesLevelled(context.config) || timing === undefined) return { values: [], keys: [] };
  return { values: [], keys: [timing.key] };
}
