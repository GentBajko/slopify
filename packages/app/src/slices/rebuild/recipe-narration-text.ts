import type { NarrationSegment } from "../narration/preparation.js";
import {
  type RecipeContext,
  type ResolvedWorkRecipe,
  recipe,
  resourceIdentity,
} from "./recipe-model.js";

export function narrationFileRecipe(
  context: RecipeContext,
  segment: NarrationSegment,
  parts: readonly ResolvedWorkRecipe[],
): ResolvedWorkRecipe {
  const key = `narration:files:${segment}`;
  const identities = parts.map((part) => resourceIdentity(context, part));
  const dependencies = parts.map((part) => part.key);
  if (parts.some((part) => part.deferred || part.unresolved))
    return recipe(
      context,
      key,
      "audio",
      {
        kind: "deferred",
        version: 1,
        operation: "resolve-revision-recipe",
        template: [segment, identities],
      },
      dependencies,
    );
  return recipe(
    context,
    key,
    "audio",
    {
      kind: "local",
      version: 1,
      operation: "narration-files-v1",
      values: {
        segment,
        version: 1,
        parts: parts.map((part) => {
          if (part.input.kind === "tts")
            return [
              resourceIdentity(context, part),
              part.input.spokenText ?? part.input.text,
              part.input.text,
            ];
          if (part.input.kind === "provided")
            return [resourceIdentity(context, part), part.input.semantic, null];
          throw new Error("Narration files require exact audio parts.");
        }),
      },
    },
    dependencies,
    { unresolved: parts.length === 0 },
  );
}
