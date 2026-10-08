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
import { levelRecipe } from "./recipe-loudness.js";
import {
  type RecipeContext,
  type ResolvedWorkRecipe,
  recipe,
  resourceIdentity,
  selectedReference,
} from "./recipe-model.js";
import { narrationFileRecipe } from "./recipe-narration-text.js";
import { pauseValues } from "./recipe-pauses.js";
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
  // Level the volume: the levelled joins, intro, body and outro in order (`recipe-loudness.ts`).
  // Empty while the setting is off, and for an uploaded narration, which is never re-levelled.
  readonly levels: readonly ResolvedWorkRecipe[];
  // "Show tables and figures on screen": the cards of the described blocks, in reading order.
  readonly cards?: readonly ResolvedWorkRecipe[] | undefined;
}
export function bodyNarrationGroups(
  context: RecipeContext,
  text: TextRecipes,
): ReturnType<typeof pronunciationChunks> {
  if (text.narrationText === null) return [];
  const groups = pronunciationChunks(
    normalizeNarrationText(text.narrationText),
    context.config.chunking ?? defaultChunking,
    usesPronunciationGlossary(context.config) && text.glossary?.ok ? text.glossary.entries : [],
    new Set(Object.keys(context.content.narrationOverrides)),
    context.content.narrationSources,
    context.content.narrationAnchors,
  );
  // A chunk's key is its text's, so an article edit that makes a chunk say what its narration
  // edit already said (a line dropped from both) would make a new chunk to voice again. It
  // keeps the edited chunk's key instead, and with it the narration already made.
  const overrides = context.content.narrationOverrides;
  const present = new Set(groups.map((group) => group.key));
  const orphans = new Map<string, string>();
  for (const [key, override] of Object.entries(overrides))
    if (override.kind === "text" && key.startsWith("audio:body:") && !present.has(key))
      orphans.set(normalizeNarrationText(override.text), key);
  if (orphans.size === 0) return groups;
  return groups.map((group) => {
    if (overrides[group.key] !== undefined || group.source !== undefined) return group;
    const key = orphans.get(group.text);
    if (key === undefined) return group;
    orphans.delete(group.text);
    return { ...group, key };
  });
}
export function audioRecipes(context: RecipeContext, text: TextRecipes): AudioRecipes {
  const { config, content } = context;
  const recipes: ResolvedWorkRecipe[] = [];
  if (config.sources.audio === "off")
    return { recipes, mediaFingerprint: null, timeline: [], keys: [], levels: [] };
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
  let cards: readonly ResolvedWorkRecipe[] = [];
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
    recipes.push(...voiced.preparations, ...voiced.cards, ...voiced.parts);
    cards = voiced.cards;
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
    recipes.push(...text.descriptions, ...text.cards);
    cards = text.cards;
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
    // A chunk with its own narration edit keeps the transcript in this form even once the article
    // says the same (`bodyNarrationGroups`), so the word timing made from it stays current.
    if (
      transcripts.some((row) => row.effective !== row.original) ||
      groups.some((group) => content.narrationOverrides[group.key]?.kind === "text")
    )
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
          // Pauses between sentences; a paragraph's between pieces cut at paragraphs.
          ...pauseValues(
            config,
            parts.map((_part, at) =>
              at === parts.length - 1
                ? "end"
                : (config.chunking ?? defaultChunking).mode === "paragraph"
                  ? "paragraph"
                  : "sentence",
            ),
          ),
        ],
      },
      parts.map((part) => part.key),
      { unresolved: text.narrationText !== null && groups.length === 0 },
    );
    recipes.push(body);
  }
  const ordered: { value: ResolvedWorkRecipe; transcript: FingerprintValue }[] = [];
  const levels: ResolvedWorkRecipe[] = [];
  const level = (join: ResolvedWorkRecipe, segment: "intro" | "body" | "outro"): void => {
    // An uploaded narration is the user's own file: only the exports' master reaches it.
    const levelled =
      config.sources.audio === "generate" ? levelRecipe(context, join, segment) : undefined;
    if (levelled === undefined) return;
    recipes.push(levelled);
    levels.push(levelled);
  };
  for (const category of ["intro", "body", "outro"] as const) {
    if (category === "body") {
      ordered.push({ value: body, transcript: bodyTranscript });
      level(body, "body");
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
          ...pauseValues(
            config,
            parts.map((_part, at) => (at === parts.length - 1 ? "end" : "sentence")),
          ),
        ],
      },
      parts.map((part) => part.key),
    );
    recipes.push(audio);
    level(audio, category);
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
    levels,
    ...(sections === undefined ? {} : { sections }),
    ...(cards.length === 0 ? {} : { cards }),
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
