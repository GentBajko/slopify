import { type FingerprintValue, fingerprint } from "../../kernel/runner/work.js";
import { usesNarrationPreparation, usesPronunciationGlossary } from "../admission/rules.js";
import { chunkNarration, defaultChunking } from "../narration/chunk.js";
import { concatArgs } from "../narration/concat.js";
import { normalizeNarrationText } from "../narration/plan.js";
import { narrationParts, pronunciationFutureValues, voiceValues } from "./recipe-audio-parts.js";
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
  const prepare = usesNarrationPreparation(config);
  const pronounce = usesPronunciationGlossary(config);
  const narrationFiles = prepare || pronounce;
  let body: ResolvedWorkRecipe;
  let bodyTranscript: FingerprintValue = text.articleText ?? text.article.fingerprint;
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
    const transcripts: { original: string; effective: string }[] = [];
    const futurePronunciation: FingerprintValue[] = [];
    let pending = text.articleText === null;
    for (const logicalText of groups) {
      const hash = fingerprint(logicalText).slice(0, 20);
      const occurrence = (occurrences.get(hash) ?? 0) + 1;
      occurrences.set(hash, occurrence);
      const logicalKey = `audio:body:${hash}-${occurrence}`;
      transcripts.push({
        original: logicalText,
        effective: effectiveText(context, logicalKey, logicalText),
      });
      futurePronunciation.push(
        ...pronunciationFutureValues(context, text.glossary, text.article, logicalKey, logicalText),
      );
      const group = narrationParts(
        context,
        logicalKey,
        logicalText,
        "body",
        [text.article.key],
        recipes,
        text.glossary,
      );
      if (group.length === 0) pending = true;
      parts.push(...group);
    }
    if (transcripts.some((row) => row.effective !== row.original))
      bodyTranscript = ["narration-transcript-v1", transcripts.map((row) => row.effective)];
    if (text.articleText === null) {
      futurePronunciation.push(
        ...pronunciationFutureValues(
          context,
          text.glossary,
          text.article,
          "audio:body:future",
          null,
        ),
      );
      if (prepare) recipes.push(preparationFuture(context, "body", text.article));
    }
    if (pending && prepare) parts.length = 0;
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
              ...(prepare ? [preparationTemplate(context)] : []),
              ...futurePronunciation,
            ],
          },
          [text.article.key, ...preparationKeys(recipes, "body")],
        ),
      );
    recipes.push(...parts);
    if (narrationFiles) recipes.push(narrationFileRecipe(context, "body", parts));
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
      ordered.push({ value: body, transcript: bodyTranscript });
      continue;
    }
    const entry = text.entries[category];
    if (entry === undefined) continue;
    const logicalKey = `audio:${category}`;
    const supplied = content.narrationOverrides[logicalKey]?.kind === "asset";
    const dependencies = [entry.recipe.key, ...(pronounce && !supplied ? [text.article.key] : [])];
    const invalidGlossary =
      !supplied && text.glossary !== null && !text.glossary.ok ? text.glossary.reason : undefined;
    if (
      prepare &&
      !supplied &&
      invalidGlossary === undefined &&
      (entry.text === null || text.glossary === null)
    )
      recipes.push(
        preparationFuture(context, category, entry.recipe, pronounce ? [text.article] : []),
      );
    const parts =
      entry.text === null
        ? []
        : narrationParts(
            context,
            logicalKey,
            entry.text,
            category,
            dependencies,
            recipes,
            text.glossary,
          );
    if (parts.length === 0)
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
              ...(prepare ? [preparationTemplate(context)] : []),
              ...pronunciationFutureValues(
                context,
                text.glossary,
                text.article,
                logicalKey,
                entry.text,
              ),
            ],
          },
          [...dependencies, ...preparationKeys(recipes, category)],
          invalidGlossary === undefined ? {} : { unresolved: true, refusal: invalidGlossary },
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
    if (narrationFiles) recipes.push(narrationFileRecipe(context, category, parts));
    ordered.push({
      value: audio,
      transcript:
        entry.text === null
          ? entry.recipe.fingerprint
          : effectiveText(context, logicalKey, entry.text),
    });
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
function effectiveText(context: RecipeContext, key: string, original: string): string {
  const override = context.content.narrationOverrides[key];
  return override?.kind === "text" ? normalizeNarrationText(override.text) : original;
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

function preparationKeys(recipes: readonly ResolvedWorkRecipe[], segment: string): string[] {
  return recipes
    .filter((row) => row.key.startsWith(`narration:prepare:${segment}:`))
    .map((row) => row.key);
}
