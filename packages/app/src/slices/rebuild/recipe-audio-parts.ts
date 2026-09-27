import { aliasMatches } from "../../kernel/ports/narration-aliases.js";
import type { FingerprintValue } from "../../kernel/runner/work.js";
import {
  narrationAliasesOf,
  usesNarrationPreparation,
  usesPronunciationGlossary,
} from "../admission/rules.js";
import { aliasSpans, withAliasSpans } from "../narration/aliases.js";
import {
  narrationRegenerationToken,
  normalizeNarrationText,
  planNarration,
} from "../narration/plan.js";
import { type GlossaryResult, pronunciationSpans } from "../narration/pronunciation.js";
import { prepareRequests } from "../narration/steering.js";
import { type RecipeContext, type ResolvedWorkRecipe, recipe } from "./recipe-model.js";
import { preparationForGroup } from "./recipe-preparation.js";

export function narrationParts(
  context: RecipeContext,
  logicalKey: string,
  originalText: string,
  segment: "body" | "intro" | "outro",
  dependsOn: readonly string[],
  preparations: ResolvedWorkRecipe[],
  glossary: GlossaryResult | null,
): ResolvedWorkRecipe[] {
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
          semantic: [normalizeNarrationText(originalText), voiceValues(context)],
        },
        dependsOn,
        { tokenKey: logicalKey },
      ),
    ];
  if (glossary === null) return [];
  if (!glossary.ok) return [refusedPart(context, logicalKey, dependsOn, glossary.reason)];
  const logicalText = normalizeNarrationText(
    override?.kind === "text" ? override.text : originalText,
  );
  // Aliases first: where one applies, the glossary does not.
  const aliases = narrationAliasesOf(context.config);
  const matches = aliasMatches(logicalText, aliases);
  const spans = withAliasSpans(
    pronunciationSpans(logicalText, glossary.entries),
    aliasSpans(logicalText, aliases),
  );
  const wholeRequest = segment !== "body" || (context.config.chunking?.mode ?? "whole") === "whole";
  const choice = context.config.audio;
  // A retired model's character limit is still its limit: the automatic catalogue check marks
  // models deprecated, and that alone must not re-split narration and outdate a project.
  const model = context.catalogue?.tts.find(
    (row) => row.provider === choice?.provider && row.id === choice.model && row.enabled,
  );
  const logicalLimit = Math.max(
    2,
    logicalText.length +
      spans.reduce((sum, span) => sum + Math.max(0, span.text.length - (span.end - span.start)), 0),
  );
  const maxCharacters = model?.tts.maxCharacters ?? logicalLimit;
  if (usesNarrationPreparation(context.config)) {
    const prepared = preparationForGroup(
      context,
      logicalKey,
      logicalText,
      segment,
      dependsOn,
      maxCharacters,
      spans,
      matches,
    );
    preparations.push(prepared.preparation);
    if (prepared.refusal !== null)
      return [refusedPart(context, logicalKey, [prepared.preparation.key], prepared.refusal)];
    return (prepared.requests ?? []).map(({ text, spokenText }, index) =>
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
          spokenText,
          logicalKey,
          logicalText,
          segment,
          pronunciation: null,
          wholeRequest,
        },
        [prepared.preparation.key],
        { tokenKey: logicalKey, unresolved: logicalText.length === 0 },
      ),
    );
  }
  if (spans.length > 0) {
    const prepared = prepareRequests(logicalText, [], maxCharacters, spans);
    if (!prepared.ok) return [refusedPart(context, logicalKey, dependsOn, prepared.reason)];
    return prepared.requests.map(({ text, spokenText }, index) =>
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
          spokenText,
          logicalKey,
          logicalText,
          segment,
          pronunciation: null,
          wholeRequest,
        },
        dependsOn,
        { tokenKey: logicalKey, unresolved: logicalText.length === 0 },
      ),
    );
  }
  // Preserve the pre-feature splitter, shape and identities when no term matches.
  const requests = planNarration({
    groups: [
      {
        key: logicalKey,
        text: logicalText,
        segment,
        wholeRequest,
        regenerationToken: narrationRegenerationToken(
          context.content.regenerationTokens,
          logicalKey,
          segment,
        ),
      },
    ],
    provider: choice?.provider ?? "",
    model: choice?.model ?? "",
    voice: choice?.voice ?? "",
    maxCharacters,
    retained: [],
  });
  return requests.map(({ text, key }) =>
    recipe(
      context,
      key,
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
        wholeRequest,
      },
      dependsOn,
      { tokenKey: logicalKey, unresolved: logicalText.length === 0 },
    ),
  );
}

function refusedPart(
  context: RecipeContext,
  logicalKey: string,
  dependsOn: readonly string[],
  reason: string,
): ResolvedWorkRecipe {
  return recipe(
    context,
    `${logicalKey}:1`,
    "audio",
    { kind: "deferred", version: 1, operation: "resolve-revision-recipe", template: reason },
    dependsOn,
    { unresolved: true, refusal: reason },
  );
}

export function pronunciationFutureValues(
  context: RecipeContext,
  glossary: GlossaryResult | null,
  article: ResolvedWorkRecipe,
  logicalKey: string,
  source: string | null,
): FingerprintValue[] {
  if (!usesPronunciationGlossary(context.config)) return [];
  const override = context.content.narrationOverrides[logicalKey];
  if (override?.kind === "asset") return [];
  if (glossary === null)
    return [["pronunciation-glossary-v1", "pending-article", article.fingerprint]];
  if (!glossary.ok) return [["pronunciation-glossary-v1", "invalid", glossary.reason]];
  // Unknown generated entry text may match any supplied term.
  if (source === null)
    return glossary.entries.length === 0
      ? []
      : [
          [
            "pronunciation-glossary-v1",
            glossary.entries.map((entry) => [entry.term, [...entry.ipa]]),
          ],
        ];
  const clean = normalizeNarrationText(override?.kind === "text" ? override.text : source);
  const spans = pronunciationSpans(clean, glossary.entries);
  return spans.length === 0
    ? []
    : [
        [
          "pronunciation-glossary-v1",
          logicalKey,
          spans.map((span) => [span.start, span.end, span.text]),
        ],
      ];
}

// What aliases add to a narration recipe that can't be worked out yet. With none copied into
// the project (every project from before aliases), nothing: its fingerprints stay as they were.
export function aliasFutureValues(
  context: RecipeContext,
  logicalKey: string,
  source: string | null,
): FingerprintValue[] {
  const aliases = narrationAliasesOf(context.config);
  if (aliases.length === 0) return [];
  const override = context.content.narrationOverrides[logicalKey];
  if (override?.kind === "asset") return [];
  // Unknown generated text may contain any alias.
  if (source === null)
    return [
      [
        "narration-aliases-v1",
        aliases.map((alias) => [alias.written, alias.spoken, alias.wholeWord, alias.caseSensitive]),
      ],
    ];
  const clean = normalizeNarrationText(override?.kind === "text" ? override.text : source);
  const matches = aliasMatches(clean, aliases);
  return matches.length === 0
    ? []
    : [
        [
          "narration-aliases-v1",
          logicalKey,
          matches.map((match) => [match.start, match.end, match.spoken]),
        ],
      ];
}

export function voiceValues(context: RecipeContext): FingerprintValue {
  return [
    context.config.audio?.provider ?? null,
    context.config.audio?.model ?? null,
    context.config.audio?.voice ?? null,
    null,
  ];
}
