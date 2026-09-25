import { audioExportArgs } from "../video/audio-export-args.js";
import type { AudioRecipes } from "./recipe-audio.js";
import {
  type RecipeContext,
  type ResolvedWorkRecipe,
  recipe,
  resourceIdentity,
} from "./recipe-model.js";

export function exportRecipes(
  context: RecipeContext,
  audio: AudioRecipes,
): readonly ResolvedWorkRecipe[] {
  const { config, content } = context;
  if (audio.mediaFingerprint === null) return [];
  const recipes: ResolvedWorkRecipe[] = [];
  if (config.sources.video === "off")
    recipes.push(
      recipe(
        context,
        "export:wav",
        "video",
        {
          kind: "local",
          version: 1,
          operation: "export-wav",
          values: [
            audio.mediaFingerprint,
            audioExportArgs([{ kind: "body", path: "$body", seconds: 0 }], "$output"),
          ],
        },
        audio.keys,
      ),
    );
  if (config.subtitles === undefined || config.subtitles.mode === "off") return recipes;
  const timing = recipe(
    context,
    "subtitles:timing",
    "video",
    {
      kind: "local",
      version: 1,
      operation: "wav2vec2-en-a19f851-v2-omissions",
      // The lead-in moves every word, so the edge silence is part of the timing.
      values: [
        audio.timeline,
        config.silenceGapSeconds,
        config.subtitles.language,
        config.edgeSilenceSeconds,
      ],
    },
    audio.keys,
  );
  recipes.push(timing);
  const cues = content.subtitleCues;
  const cueRecipe =
    cues === undefined
      ? recipe(
          context,
          "subtitles:cues",
          "video",
          {
            kind: "local",
            version: 1,
            operation: "automatic-cues-v1",
            values: resourceIdentity(context, timing),
          },
          [timing.key],
        )
      : recipe(
          context,
          "subtitles:cues",
          "video",
          {
            kind: "local",
            version: 1,
            operation: "manual-cues-v1",
            values: [cues.audioFingerprint, cues.cues.map((cue) => ({ ...cue }))],
          },
          audio.keys,
        );
  recipes.push(cueRecipe);
  recipes.push(
    recipe(
      context,
      "subtitles:files",
      "video",
      {
        kind: "local",
        version: 1,
        operation: "subtitle-files-v1",
        values: [
          resourceIdentity(context, cueRecipe),
          config.format,
          config.subtitles.fontId,
          config.subtitles.fontSize,
          config.subtitles.position,
        ],
      },
      [cueRecipe.key],
    ),
  );
  return recipes;
}
export function manualCuesNeedReview(
  context: RecipeContext,
  recipes: readonly ResolvedWorkRecipe[],
): boolean {
  const cues = context.content.subtitleCues;
  if (cues === undefined) return false;
  const timing = recipes.find((value) => value.key === "subtitles:timing");
  return (
    timing !== undefined &&
    cues.audioFingerprint !== timing.logicalFingerprint &&
    cues.audioFingerprint !==
      context.manifest.outputs.find(
        (value) => value.workKey === timing.key && value.state === "ready",
      )?.fingerprint
  );
}
