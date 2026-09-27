import type { FingerprintValue } from "../../kernel/runner/work.js";
import {
  type LoudnessTarget,
  pieceLufs,
  pieceTruePeak,
  truePeakOf,
  usesLoudness,
} from "../loudness/model.js";
import {
  type RecipeContext,
  type ResolvedWorkRecipe,
  recipe,
  resourceIdentity,
} from "./recipe-model.js";

// Level the volume (`loudness/model.ts`): beside each narration join, a step that joins the
// same pieces again, each brought to one loudness first. The plain join stays what it was, and
// the word timing keeps reading it, so turning the setting on never makes the timing, or the
// description, shorts and reviews written from it, again: only these steps and the exports that
// play their files. The keys are outside `audio:` on purpose, where the narration's own pieces
// and joins are recognised by their keys.
export const levelOperation = "level-narration-v1";
export type NarrationSegment = "intro" | "body" | "outro";

export function levelKey(segment: NarrationSegment): string {
  return `level:${segment}`;
}

export function levelRecipe(
  context: RecipeContext,
  join: ResolvedWorkRecipe,
  segment: NarrationSegment,
): ResolvedWorkRecipe | undefined {
  if (!usesLoudness(context.config) || join.input.kind !== "local") return undefined;
  return recipe(
    context,
    levelKey(segment),
    "audio",
    {
      kind: "local",
      version: 1,
      operation: levelOperation,
      // The join it repeats, as that join's own recipe has it: the pieces and their layout.
      values: [
        join.input.operation,
        join.input.values,
        ["piece-level-v1", pieceLufs, pieceTruePeak],
      ],
    },
    join.dependsOn,
    { unresolved: join.unresolved },
  );
}

// What an export adds while the setting is on: the levelled narration it plays and the master
// it is brought to. Nothing at all while it is off, so every export keeps its fingerprint.
export interface MasterPlan {
  readonly values: readonly FingerprintValue[];
  readonly keys: readonly string[];
}

export const noMaster: MasterPlan = { values: [], keys: [] };

export function masterPlan(
  context: RecipeContext,
  levels: readonly ResolvedWorkRecipe[],
  target: LoudnessTarget,
): MasterPlan {
  const settings = context.config.loudness;
  if (!usesLoudness(context.config) || settings === undefined) return noMaster;
  const lufs = target === "video" ? settings.videoLufs : settings.audioFilesLufs;
  return {
    values: [
      [
        "loudness-v1",
        levels.map((level) => resourceIdentity(context, level)),
        lufs,
        truePeakOf(target),
      ],
    ],
    keys: levels.map((level) => level.key),
  };
}
