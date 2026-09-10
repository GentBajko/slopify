import { splitText } from "../../kernel/ports/text.js";
import { type FingerprintValue, fingerprint } from "../../kernel/runner/work.js";
import { chunkNarration, defaultChunking } from "../narration/chunk.js";
import { concatArgs } from "../narration/concat.js";
import {
  type RecipeContext,
  type ResolvedWorkRecipe,
  recipe,
  resourceIdentity,
  selectedReference,
} from "./recipe-model.js";
import type { TextRecipes } from "./recipe-text.js";

export interface AudioRecipes {
  readonly recipes: readonly ResolvedWorkRecipe[];
  readonly timelineFingerprint: string | null;
  readonly timeline: FingerprintValue;
  readonly keys: readonly string[];
}
export function audioRecipes(context: RecipeContext, text: TextRecipes): AudioRecipes {
  const { config, content } = context;
  const recipes: ResolvedWorkRecipe[] = [];
  if (config.sources.audio === "off")
    return { recipes, timelineFingerprint: null, timeline: [], keys: [] };
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
        : chunkNarration(text.articleText, config.chunking ?? defaultChunking);
    const occurrences = new Map<string, number>();
    const parts: ResolvedWorkRecipe[] = [];
    for (const logicalText of groups) {
      const hash = fingerprint(logicalText).slice(0, 20);
      const occurrence = (occurrences.get(hash) ?? 0) + 1;
      occurrences.set(hash, occurrence);
      const logicalKey = `audio:body:${hash}-${occurrence}`;
      parts.push(...narrationParts(context, logicalKey, logicalText, "body", [text.article.key]));
    }
    if (text.articleText === null)
      parts.push(
        recipe(
          context,
          "audio:body:future",
          "audio",
          {
            kind: "deferred",
            version: 1,
            operation: "body-narration",
            template: [text.article.fingerprint, voiceValues(context), chunkingValues(context)],
          },
          [text.article.key],
        ),
      );
    recipes.push(...parts);
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
                template: [entry.recipe.fingerprint, voiceValues(context)],
              },
              [entry.recipe.key],
            ),
          ]
        : narrationParts(context, `audio:${category}`, entry.text, category, [entry.recipe.key]);
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
    timelineFingerprint: fingerprint(["timeline-v1", timeline, config.silenceGapSeconds]),
    timeline,
    keys: ordered.map(({ value }) => value.key),
  };
}
function narrationParts(
  context: RecipeContext,
  logicalKey: string,
  originalText: string,
  segment: "body" | "intro" | "outro",
  dependsOn: readonly string[],
): readonly ResolvedWorkRecipe[] {
  const override = context.content.narrationOverrides[logicalKey];
  if (override?.kind === "asset")
    return [
      recipe(
        context,
        `${logicalKey}:1`,
        "audio",
        {
          kind: "provided",
          version: 1,
          assetId: override.assetId,
          semantic: [originalText, voiceValues(context)],
        },
        dependsOn,
        { tokenKey: logicalKey },
      ),
    ];
  const logicalText = (override?.kind === "text" ? override.text : originalText).trim();
  const choice = context.config.audio;
  const model = context.catalogue?.tts.find(
    (row) =>
      row.provider === choice?.provider &&
      row.id === choice.model &&
      row.enabled &&
      !row.deprecated,
  );
  const texts =
    context.catalogue === undefined
      ? [logicalText]
      : splitText(logicalText, model?.tts.maxCharacters ?? Math.max(2, logicalText.length));
  return texts.map((text, index) =>
    recipe(
      context,
      `${logicalKey}:${index + 1}`,
      "audio",
      {
        kind: "tts",
        version: 1,
        provider: choice?.provider ?? "",
        model: choice?.model ?? "",
        voice: choice?.voice ?? "",
        text,
        logicalKey,
        logicalText,
        segment,
        pronunciation: null,
      },
      dependsOn,
      { tokenKey: logicalKey, unresolved: logicalText.length === 0 },
    ),
  );
}
function voiceValues(context: RecipeContext): FingerprintValue {
  return [
    context.config.audio?.provider ?? null,
    context.config.audio?.model ?? null,
    context.config.audio?.voice ?? null,
    null,
  ];
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
