import type { FingerprintValue } from "../../kernel/runner/work.js";
import { usesNarrationPreparation } from "../admission/rules.js";
import {
  narrationRegenerationToken,
  normalizeNarrationText,
  planNarration,
} from "../narration/plan.js";
import { type RecipeContext, type ResolvedWorkRecipe, recipe } from "./recipe-model.js";
import { preparationForGroup } from "./recipe-preparation.js";

export function narrationParts(
  context: RecipeContext,
  logicalKey: string,
  originalText: string,
  segment: "body" | "intro" | "outro",
  dependsOn: readonly string[],
  preparations: ResolvedWorkRecipe[],
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
  const logicalText = normalizeNarrationText(
    override?.kind === "text" ? override.text : originalText,
  );
  const wholeRequest = segment !== "body" || (context.config.chunking?.mode ?? "whole") === "whole";
  const choice = context.config.audio;
  const model = context.catalogue?.tts.find(
    (row) =>
      row.provider === choice?.provider &&
      row.id === choice.model &&
      row.enabled &&
      !row.deprecated,
  );
  if (usesNarrationPreparation(context.config)) {
    const prepared = preparationForGroup(
      context,
      logicalKey,
      logicalText,
      segment,
      dependsOn,
      model?.tts.maxCharacters ?? Math.max(2, logicalText.length),
    );
    preparations.push(prepared.preparation);
    if (prepared.refusal !== null)
      return [
        recipe(
          context,
          `${logicalKey}:1`,
          "audio",
          {
            kind: "deferred",
            version: 1,
            operation: "resolve-revision-recipe",
            template: prepared.refusal,
          },
          [prepared.preparation.key],
          { unresolved: true, refusal: prepared.refusal },
        ),
      ];
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
    maxCharacters:
      context.catalogue === undefined
        ? Math.max(2, logicalText.length)
        : (model?.tts.maxCharacters ?? Math.max(2, logicalText.length)),
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
export function voiceValues(context: RecipeContext): FingerprintValue {
  return [
    context.config.audio?.provider ?? null,
    context.config.audio?.model ?? null,
    context.config.audio?.voice ?? null,
    null,
  ];
}
