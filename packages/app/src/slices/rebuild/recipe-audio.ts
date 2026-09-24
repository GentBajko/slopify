import { type FingerprintValue, fingerprint } from "../../kernel/runner/work.js";
import { usesNarrationPreparation } from "../admission/rules.js";
import { chunkNarration, defaultChunking } from "../narration/chunk.js";
import { concatArgs } from "../narration/concat.js";
import { normalizeNarrationText } from "../narration/plan.js";
import { narrationParts, voiceValues } from "./recipe-audio-parts.js";
import {
  type RecipeContext,
  type ResolvedWorkRecipe,
  recipe,
  resourceIdentity,
  selectedReference,
} from "./recipe-model.js";
import { narrationFileRecipe } from "./recipe-narration-text.js";
import { preparationFuture, preparationTemplate } from "./recipe-preparation.js";
import type { TextRecipes } from "./recipe-text.js";

export interface AudioRecipes {
  readonly recipes: readonly ResolvedWorkRecipe[];
  readonly mediaFingerprint: string | null;
  readonly timeline: FingerprintValue;
  readonly keys: readonly string[];
}
export function audioRecipes(context: RecipeContext, text: TextRecipes): AudioRecipes {
  const { config, content } = context;
  const recipes: ResolvedWorkRecipe[] = [];
  if (config.sources.audio === "off")
    return { recipes, mediaFingerprint: null, timeline: [], keys: [] };
  let body: ResolvedWorkRecipe;
  if (config.sources.audio === "provide") {
    body = recipe(
      context,
      "audio:provided",
      "audio",
      {
        kind: "provided",
        version: 1,
        assetId: content.provided.audio ?? null,
        semantic: text.articleText ?? text.article.fingerprint,
      },
      [text.article.key],
      { unresolved: content.provided.audio === undefined },
    );
    recipes.push(body);
  } else {
    const groups =
      text.articleText === null
        ? []
        : chunkNarration(
            normalizeNarrationText(text.articleText),
            config.chunking ?? defaultChunking,
          );
    const occurrences = new Map<string, number>();
    const parts: ResolvedWorkRecipe[] = [];
    let pending = text.articleText === null;
    for (const logicalText of groups) {
      const hash = fingerprint(logicalText).slice(0, 20);
      const occurrence = (occurrences.get(hash) ?? 0) + 1;
      occurrences.set(hash, occurrence);
      const logicalKey = `audio:body:${hash}-${occurrence}`;
      const group = narrationParts(
        context,
        logicalKey,
        logicalText,
        "body",
        [text.article.key],
        recipes,
      );
      if (group.length === 0) pending = true;
      parts.push(...group);
    }
    if (text.articleText === null && usesNarrationPreparation(config))
      recipes.push(preparationFuture(context, "body", text.article));
    // Physical ordinals are stable only after every logical group's cue plan is known.
    if (pending && usesNarrationPreparation(config)) parts.length = 0;
    if (pending)
      parts.push(
        recipe(
          context,
          "audio:body:future",
          "audio",
          {
            kind: "deferred",
            version: 1,
            operation: "body-narration",
            template: [
              text.article.fingerprint,
              voiceValues(context),
              chunkingValues(context),
              ...(usesNarrationPreparation(config) ? [preparationTemplate(context)] : []),
            ],
          },
          [text.article.key],
        ),
      );
    recipes.push(...parts);
    if (usesNarrationPreparation(config)) recipes.push(narrationFileRecipe(context, "body", parts));
    body = recipe(
      context,
      "audio:body:concat",
      "audio",
      {
        kind: "local",
        version: 1,
        operation: "concat-narration",
        values: [
          parts.map((part) => resourceIdentity(context, part)),
          parts.length === 1 ? "copy-single-file" : concatArgs("$parts", "$output"),
        ],
      },
      parts.map((part) => part.key),
      { unresolved: text.articleText !== null && groups.length === 0 },
    );
    recipes.push(body);
  }
  const ordered: { value: ResolvedWorkRecipe; transcript: FingerprintValue }[] = [];
  for (const category of ["intro", "body", "outro"] as const) {
    if (category === "body") {
      ordered.push({ value: body, transcript: text.articleText ?? text.article.fingerprint });
      continue;
    }
    const entry = text.entries[category];
    if (entry === undefined) continue;
    if (entry.text === null && usesNarrationPreparation(config))
      recipes.push(preparationFuture(context, category, entry.recipe));
    const parts =
      entry.text === null
        ? [
            recipe(
              context,
              `audio:${category}:future`,
              "audio",
              {
                kind: "deferred",
                version: 1,
                operation: `${category}-narration`,
                template: [
                  entry.recipe.fingerprint,
                  voiceValues(context),
                  ...(usesNarrationPreparation(config) ? [preparationTemplate(context)] : []),
                ],
              },
              [entry.recipe.key],
            ),
          ]
        : narrationParts(
            context,
            `audio:${category}`,
            entry.text,
            category,
            [entry.recipe.key],
            recipes,
          );
    if (parts.length === 0 && usesNarrationPreparation(config))
      parts.push(
        recipe(
          context,
          `audio:${category}:future`,
          "audio",
          {
            kind: "deferred",
            version: 1,
            operation: `${category}-narration`,
            template: [
              entry.recipe.fingerprint,
              voiceValues(context),
              preparationTemplate(context),
            ],
          },
          [entry.recipe.key],
        ),
      );
    recipes.push(...parts);
    const audio = recipe(
      context,
      `audio:${category}`,
      "audio",
      {
        kind: "local",
        version: 1,
        operation: "concat-narration",
        values: [
          parts.map((part) => resourceIdentity(context, part)),
          parts.length === 1 ? "copy-single-file" : concatArgs("$parts", "$output"),
        ],
      },
      parts.map((part) => part.key),
    );
    recipes.push(audio);
    if (usesNarrationPreparation(config))
      recipes.push(narrationFileRecipe(context, category, parts));
    ordered.push({ value: audio, transcript: entry.text ?? entry.recipe.fingerprint });
  }
  const timeline: FingerprintValue = ordered.map(({ value, transcript }) => {
    const retained = context.manifest.outputs.find(
      (row) => row.workKey === value.key && row.state === "ready" && selectedReference(row),
    );
    return {
      audio: resourceIdentity(context, value),
      transcript,
      durationMs: retained?.output.durationMs ?? null,
    };
  });
  return {
    recipes,
    mediaFingerprint: fingerprint([
      "audio-media-v1",
      ordered.map(({ value }) => resourceIdentity(context, value)),
      config.silenceGapSeconds,
    ]),
    timeline,
    keys: ordered.map(({ value }) => value.key),
  };
}
function chunkingValues(context: RecipeContext): FingerprintValue {
  const chunking = context.config.chunking ?? defaultChunking;
  return [
    chunking.mode,
    chunking.mode === "words"
      ? (chunking.words ?? 500)
      : chunking.mode === "characters"
        ? (chunking.characters ?? 3000)
        : null,
  ];
}
