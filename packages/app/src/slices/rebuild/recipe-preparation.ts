import { z } from "zod";
import type { FingerprintValue } from "../../kernel/runner/work.js";
import {
  type NarrationSegment,
  preparationMessages,
  validatePreparation,
} from "../narration/preparation.js";
import { type PreparedRequest, prepareRequests } from "../narration/steering.js";
import {
  type RecipeContext,
  type ResolvedWorkRecipe,
  recipe,
  selectedReference,
} from "./recipe-model.js";
import { llmInput, renderedPrompt } from "./recipe-text.js";

export interface PreparedGroup {
  readonly preparation: ResolvedWorkRecipe;
  readonly requests: readonly PreparedRequest[] | null;
  readonly refusal: string | null;
}

export function preparationTemplate(context: RecipeContext): FingerprintValue {
  const input = llmInput(context, preparationMessages(renderedPrompt(context, "narration"), ""));
  return [
    "inworld-tts-2",
    1,
    JSON.parse(JSON.stringify({ ...input, thinkingConfig: null })) as FingerprintValue,
    JSON.parse(JSON.stringify(context.content.narrationOverrides)) as FingerprintValue,
  ];
}

export function preparationFuture(
  context: RecipeContext,
  segment: NarrationSegment,
  dependency: ResolvedWorkRecipe,
): ResolvedWorkRecipe {
  return recipe(
    context,
    `narration:prepare:${segment}:future`,
    "audio",
    {
      kind: "deferred",
      version: 1,
      operation: "narration-preparation",
      template: [
        dependency.fingerprint,
        preparationTemplate(context),
        JSON.parse(JSON.stringify(context.config.chunking ?? null)) as FingerprintValue,
      ],
    },
    [dependency.key],
  );
}

export function preparationForGroup(
  context: RecipeContext,
  logicalKey: string,
  source: string,
  segment: NarrationSegment,
  dependsOn: readonly string[],
  maxCharacters: number,
): PreparedGroup {
  const preparation = recipe(
    context,
    `narration:prepare:${segment}:${logicalKey}`,
    "audio",
    {
      ...llmInput(context, preparationMessages(renderedPrompt(context, "narration"), source)),
      preparation: { format: "inworld-tts-2", version: 1, source, logicalKey, segment },
    },
    dependsOn,
    { unresolved: source.trim() === "" },
  );
  if (source.trim() === "")
    return {
      preparation,
      requests: null,
      refusal: "Narration Preparation needs non-empty narration text.",
    };
  const logical = recipe(
    context,
    preparation.key,
    "audio",
    preparation.input.kind === "llm"
      ? { ...preparation.input, thinkingConfig: null }
      : preparation.input,
    dependsOn,
  ).fingerprint;
  const saved = context.manifest.pieces.find(
    (row) =>
      row.key === preparation.key &&
      row.stageKind === "audio" &&
      selectedReference(row) &&
      (!("available" in row) || row.available) &&
      row.piece.state === "done" &&
      (row.fingerprint === preparation.fingerprint ||
        (context.catalogue === undefined &&
          z
            .object({ logicalFingerprint: z.literal(logical) })
            .safeParse(JSON.parse(row.piece.payload ?? "null")).success)),
  );
  if (saved?.piece.payload === undefined || saved.piece.payload === null)
    return { preparation, requests: null, refusal: null };
  const payload = z.object({ text: z.string() }).safeParse(JSON.parse(saved.piece.payload));
  if (!payload.success)
    return { preparation, requests: null, refusal: "Saved narration preparation is incomplete." };
  const validated = validatePreparation(payload.data.text, source);
  if (!validated.ok) return { preparation, requests: null, refusal: validated.reason };
  const prepared = prepareRequests(
    source,
    validated.cues,
    context.catalogue === undefined
      ? Math.max(
          2,
          source.length +
            validated.cues.reduce(
              (n, cue) => n + (cue.kind === "instruction" ? cue.text.length : 20) + 3,
              0,
            ),
        )
      : maxCharacters,
  );
  return prepared.ok
    ? { preparation, requests: prepared.requests, refusal: null }
    : { preparation, requests: null, refusal: prepared.reason };
}
