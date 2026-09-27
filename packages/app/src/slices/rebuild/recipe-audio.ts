import { type FingerprintValue, fingerprint } from "../../kernel/runner/work.js";
import { usesNarrationPreparation, usesPronunciationGlossary } from "../admission/rules.js";
import { defaultChunking } from "../narration/chunk.js";
import { concatArgs } from "../narration/concat.js";
import { normalizeNarrationText } from "../narration/plan.js";
import { pronunciationChunks } from "../narration/pronunciation-chunks.js";
import type { ScriptSection } from "../voices/script.js";
import {
  aliasFutureValues,
  narrationParts,
  pronunciationFutureValues,
  voiceValues,
} from "./recipe-audio-parts.js";
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
import { voiceBodyRecipes } from "./recipe-voices.js";

export interface AudioRecipes {
  readonly recipes: readonly ResolvedWorkRecipe[];
  readonly mediaFingerprint: string | null;
  readonly timeline: FingerprintValue;
  readonly keys: readonly string[];
  // A multi-voice run's script sections, once the script is known: the audio files' chapters.
  readonly sections?: readonly ScriptSection[] | undefined;
}
export function bodyNarrationGroups(
  context: RecipeContext,
  text: TextRecipes,
): ReturnType<typeof pronunciationChunks> {
  return text.narrationText === null
    ? []
    : pronunciationChunks(
        normalizeNarrationText(text.narrationText),
        context.config.chunking ?? defaultChunking,
        usesPronunciationGlossary(context.config) && text.glossary?.ok ? text.glossary.entries : [],
        new Set(Object.keys(context.content.narrationOverrides)),
        context.content.narrationSources,
      );
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
  let bodyTranscript: FingerprintValue =
    text.narrationText ??
    (text.descriptions.length === 0
      ? text.article.fingerprint
      : [
          "described-v1",
          text.article.fingerprint,
          text.descriptions.map((row) => row.fingerprint),
        ]);
  let sections: readonly ScriptSection[] | undefined;
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
  } else if (text.script !== undefined && config.voices !== undefined) {
    const voiced = voiceBodyRecipes(context, config.voices, text.script, text.glossary);
    recipes.push(...voiced.preparations, ...voiced.parts);
    if (narrationFiles) recipes.push(narrationFileRecipe(context, "body", voiced.parts));
    recipes.push(voiced.body);
    body = voiced.body;
    bodyTranscript = voiced.transcript;
    sections = voiced.sections;
  } else {
    const groups = bodyNarrationGroups(context, text);
    const parts: ResolvedWorkRecipe[] = [];
    const transcripts: { original: string; effective: string }[] = [];
    const futurePronunciation: FingerprintValue[] = [];
    recipes.push(...text.descriptions);
    let pending = text.narrationText === null;
    for (const { key: logicalKey, text: logicalText } of groups) {
      transcripts.push({
        original: logicalText,
        effective: effectiveText(context, logicalKey, logicalText),
      });
      futurePronunciation.push(
        ...pronunciationFutureValues(context, text.glossary, text.article, logicalKey, logicalText),
        ...aliasFutureValues(context, logicalKey, logicalText),
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
    if (text.narrationText === null) {
      futurePronunciation.push(
        ...pronunciationFutureValues(
          context,
          text.glossary,
          text.article,
          "audio:body:future",
          null,
        ),
        ...aliasFutureValues(context, "audio:body:future", null),
      );
      if (prepare)
        recipes.push(preparationFuture(context, "body", text.article, text.descriptions));
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
              ...(text.descriptions.length === 0
                ? []
                : [["described-v1", text.descriptions.map((row) => row.fingerprint)]]),
            ],
          },
          [
            text.article.key,
            ...text.descriptions.map((row) => row.key),
            ...preparationKeys(recipes, "body"),
          ],
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
      { unresolved: text.narrationText !== null && groups.length === 0 },
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
              ...aliasFutureValues(context, logicalKey, entry.text),
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
      // The exported timeline, not a narration piece: the silence only reaches the
      // exports that read this fingerprint.
      config.edgeSilenceSeconds,
    ]),
    timeline,
    keys: ordered.map(({ value }) => value.key),
    ...(sections === undefined ? {} : { sections }),
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
