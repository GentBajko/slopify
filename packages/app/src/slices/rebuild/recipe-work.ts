import { z } from "zod";
import type { Catalogue } from "../../catalog/schema.js";
import type { RunConfig } from "../admission/model.js";
import type { CostEstimate, PricedRequest } from "../estimate/index.js";
import { estimateRequests } from "../estimate/index.js";
import { skippedGlossaryNotice } from "../narration/pronunciation.js";
import type { ManifestPiece, ProjectRevision, RevisionManifest } from "../revisions/model.js";
import { isLocalCliProvider } from "../settings/model.js";
import { defaultShortsPrompt, shortsImageUpperBound } from "../shorts/model.js";
import { planDependencies, type RetainedWork, type WorkRecipe } from "./dependencies.js";
import type { RebuildPreview, RebuildWork } from "./model.js";
import { matchingNarrationPiece } from "./narration-reuse.js";
import { buildRecipes } from "./recipe-build.js";
import { manualCuesNeedReview } from "./recipe-exports.js";
import {
  type RecipeContext,
  type ResolvedRevisionInputs,
  type ResolvedWorkRecipe,
  selectedReference,
} from "./recipe-model.js";
import { recipeProviderChoice } from "./recipe-provider-choice.js";
import { narrationGlossary } from "./recipe-text.js";

export interface RevisionWorkPlan {
  readonly recipes: readonly ResolvedWorkRecipe[];
  readonly work: readonly RebuildWork[];
  readonly changedInputs: RebuildPreview["changedInputs"];
  readonly providedReuseRequired: readonly string[];
  readonly wholeRequestNotice: string | null;
  // Pronunciation Glossary rows the narration skips, for the rebuild review to show.
  readonly glossaryNotice?: string | null;
  readonly costs: CostEstimate;
}
export function planRevisionWork(
  revision: ProjectRevision,
  manifest: RevisionManifest,
  catalogue: Catalogue,
  availableAssetIds: ReadonlySet<string>,
  resolved: ResolvedRevisionInputs,
  retainedNarration: readonly ManifestPiece[] = [],
): RevisionWorkPlan {
  const selected: RevisionManifest = {
    outputs: manifest.outputs.filter(selectedReference),
    pieces: manifest.pieces.filter(selectedReference),
  };
  const available: RevisionManifest = {
    outputs: selected.outputs.filter((row) => availableAssetIds.has(row.assetId)),
    pieces: selected.pieces.filter(
      (row) => row.assetId === null || availableAssetIds.has(row.assetId),
    ),
  };
  const usableArticle =
    revision.config.sources.article !== "generate" ||
    revision.content.articleEdited === true ||
    selected.outputs.some(
      (row) =>
        row.workKey === "article:body" &&
        row.state === "ready" &&
        availableAssetIds.has(row.assetId),
    );
  const logicalContext: RecipeContext = {
    config: revision.config,
    content: revision.content,
    manifest: available,
    resolved: { ...resolved, articleMarkdown: usableArticle ? resolved.articleMarkdown : null },
  };
  const logical = buildRecipes(logicalContext);
  const glossary = narrationGlossary(logicalContext);
  const context = { ...logicalContext, catalogue };
  const recipes = buildRecipes(context).map((row) => ({
    ...row,
    logicalFingerprint:
      logical.find(
        (one) => one.key === (row.input.kind === "tts" ? `${row.input.logicalKey}:1` : row.key),
      )?.fingerprint ?? row.fingerprint,
    unresolved:
      row.unresolved ||
      (row.input.kind === "provided" &&
        (row.input.assetId === null || !availableAssetIds.has(row.input.assetId))),
  }));
  const retained = recipes.flatMap((row) =>
    retainedFor(
      row,
      logical,
      row.input.kind === "tts"
        ? { ...selected, pieces: [...selected.pieces, ...retainedNarration] }
        : selected,
      availableAssetIds,
    ),
  );
  const rawWork = planDependencies(recipes.map(comparisonRecipe), retained);
  const manualReview = manualCuesNeedReview(logicalContext, logical);
  const work = rawWork
    .filter((row) => revision.content.subtitleCues === undefined || row.key !== "subtitles:timing")
    .map(
      (row): RebuildWork =>
        manualReview && row.key === "subtitles:cues"
          ? {
              ...row,
              disposition: "review",
              reason:
                "Narration or transcript changed. Review the saved manual cues before reusing them.",
            }
          : recipes.find((recipe) => recipe.key === row.key)?.refusal !== undefined
            ? {
                ...row,
                disposition: "blocked",
                reason: recipes.find((recipe) => recipe.key === row.key)?.refusal ?? row.reason,
              }
            : row,
    );
  const changedInputs = work
    .filter((row) => row.disposition !== "reuse")
    .map((row) => ({
      path: row.key,
      before:
        selected.outputs.find((one) => one.workKey === row.key)?.fingerprint ??
        selected.pieces.find((one) => one.key === row.key)?.fingerprint ??
        null,
      after: row.fingerprint,
    }));
  const priced = work.flatMap((row) =>
    priceRecipes(
      row,
      recipes.find((one) => one.key === row.key),
      revision.config,
    ),
  );
  return {
    recipes,
    work,
    changedInputs,
    providedReuseRequired: work.filter((row) => row.disposition === "review").map((row) => row.key),
    wholeRequestNotice:
      revision.config.sources.audio === "generate" &&
      (revision.config.chunking?.mode ?? "whole") === "whole"
        ? "Whole-text narration is one logical request. Editing its text rebuilds every provider part of that request."
        : null,
    glossaryNotice:
      glossary?.ok === true && glossary.skipped !== undefined
        ? skippedGlossaryNotice(glossary.skipped)
        : null,
    costs: estimateRequests(priced, catalogue),
  };
}
function comparisonRecipe(row: ResolvedWorkRecipe): WorkRecipe {
  return {
    key: row.key,
    stage: row.stage,
    kind: row.kind,
    requestFingerprint: row.requestFingerprint,
    fingerprint: row.fingerprint,
    dependsOn: row.dependsOn,
    unresolved: row.unresolved,
  };
}
function retainedFor(
  row: ResolvedWorkRecipe,
  logical: readonly ResolvedWorkRecipe[],
  manifest: RevisionManifest,
  available: ReadonlySet<string>,
): readonly RetainedWork[] {
  if (
    row.input.kind === "provided" &&
    row.key.startsWith("audio:") &&
    row.key !== "audio:provided"
  ) {
    const assetId = row.input.assetId;
    const previous = manifest.pieces.find(
      (one) =>
        one.key === row.key &&
        one.assetId === assetId &&
        one.piece.state === "done" &&
        one.fingerprint !== row.fingerprint &&
        z.object({ provided: z.literal(true) }).safeParse(JSON.parse(one.piece.payload ?? "null"))
          .success,
    );
    if (previous !== undefined)
      return [
        {
          key: row.key,
          requestFingerprint: "",
          fingerprint: previous.fingerprint,
          available: assetId !== null && available.has(assetId),
          inflight: false,
          pieceIds: [previous.piece.id],
        },
      ];
  }
  const narration = matchingNarrationPiece(row, manifest.pieces, available);
  if (narration !== undefined)
    return [
      {
        key: row.key,
        requestFingerprint: row.requestFingerprint,
        fingerprint: row.fingerprint,
        available: true,
        inflight: false,
        pieceIds: [narration.piece.id],
      },
    ];
  const bundle = manifest.outputs.filter(
    (one) => one.workKey === row.key && one.fingerprint === row.logicalFingerprint,
  );
  const complete = bundle.every((one) => one.state === "ready" && available.has(one.assetId));
  const current = bundle.length > 0 && complete;
  const pieces = manifest.pieces.filter((one) => one.key === row.key);
  const matched = pieces.filter((one) => {
    const request =
      one.piece.payload === null
        ? undefined
        : z
            .object({ requestFingerprint: z.string().optional() })
            .parse(JSON.parse(one.piece.payload)).requestFingerprint;
    return (
      one.fingerprint === row.fingerprint &&
      request === row.requestFingerprint &&
      (one.assetId === null || available.has(one.assetId))
    );
  });
  const concat =
    row.key.startsWith("audio:body:") && row.key !== "audio:body:concat"
      ? logical.find((one) => one.key === "audio:body:concat")
      : undefined;
  const retainedConcat =
    concat !== undefined &&
    manifest.outputs.some(
      (one) =>
        one.workKey === concat.key &&
        one.fingerprint === concat.fingerprint &&
        one.state === "ready" &&
        available.has(one.assetId),
    );
  if (
    current ||
    matched.length > 0 ||
    retainedConcat ||
    (row.input.kind === "provided" &&
      row.input.assetId !== null &&
      available.has(row.input.assetId) &&
      !manifest.outputs.some((one) => one.workKey === row.key))
  )
    return [
      {
        key: row.key,
        requestFingerprint: row.requestFingerprint,
        fingerprint: row.fingerprint,
        available:
          current ||
          (complete && matched.some((one) => one.piece.state === "done")) ||
          retainedConcat ||
          row.input.kind === "provided",
        inflight: matched.some((one) => one.piece.state === "running"),
        pieceIds: matched.map((one) => one.piece.id),
      },
    ];
  return manifest.outputs
    .filter((one) => one.workKey === row.key)
    .map((one) => ({
      key: row.key,
      requestFingerprint: "",
      fingerprint: one.fingerprint,
      available: manifest.outputs
        .filter(
          (sibling) => sibling.workKey === one.workKey && sibling.fingerprint === one.fingerprint,
        )
        .every((sibling) => sibling.state === "ready" && available.has(sibling.assetId)),
      inflight: false,
      pieceIds: [],
    }));
}
// ceiling: the timed transcript of a 20-minute narration, about 3,000 words. The real one
// is only built once the word timing lands.
const youtubeTranscriptEstimate = 20000;
// The numbered transcript the shorts are picked from is the same text with a number and a
// span before every sentence rather than a time before every passage.
const shortsTranscriptEstimate = 24000;

// What a step is charged as. Most steps are one request; what stands in for the shorts
// until they are picked is every clip's image prompts and, at the longest length allowed,
// every image, which is the most the step can cost.
export function priceRecipes(
  work: RebuildWork,
  value: ResolvedWorkRecipe | undefined,
  // The revision's settings, which name the provider of a request built only when it runs.
  config?: RunConfig,
): readonly PricedRequest[] {
  const input = value?.input;
  const unfolds = value?.unfoldsImages;
  // A short's image prompts once the clips are picked: the call, and the images it leads to,
  // as many as the clip's length asks for.
  if (work.disposition === "generate" && unfolds !== undefined)
    return [
      priceRecipe(work, value, config),
      ...Array.from(
        { length: unfolds.count },
        (): PricedRequest => ({
          kind: "image",
          stage: work.key,
          provider: unfolds.provider,
          model: unfolds.model,
          detail: `${String(unfolds.count)} vertical ${unfolds.count === 1 ? "image" : "images"} for this short, one per stretch of the seconds each image is held.`,
        }),
      ),
    ];
  // What stands in for the chapter openers' clips until the chapters are known: one clip for
  // the opening and for each chapter the article's headings promise, the most it can cost.
  if (
    work.disposition === "generate" &&
    input?.kind === "deferred" &&
    input.operation === "animate" &&
    Array.isArray(input.template)
  ) {
    const [, , provider, model, upper] = input.template;
    const clips = typeof upper === "number" ? upper : 0;
    return Array.from(
      { length: clips },
      (): PricedRequest => ({
        kind: "image",
        stage: work.key,
        provider: typeof provider === "string" ? provider : "",
        model: typeof model === "string" ? model : "",
        detail: `Up to ${String(clips)} animated clips, one per chapter opening; the chapters are found when the word timing lands, so fewer may be made.`,
      }),
    );
  }
  if (
    work.disposition !== "generate" ||
    input?.kind !== "deferred" ||
    input.operation !== "shorts" ||
    !Array.isArray(input.template)
  )
    return [priceRecipe(work, value, config)];
  const [, style, provider, model, imageSeconds, count, maxSeconds, llmProvider, llmModel] =
    input.template;
  const clips = typeof count === "number" ? count : 0;
  const images =
    typeof imageSeconds === "number" && typeof maxSeconds === "number"
      ? shortsImageUpperBound({ count: clips, maxSeconds }, imageSeconds)
      : 0;
  const detail = `Up to ${String(images)} vertical images: ${String(clips)} shorts at the longest length allowed. The clips are picked when the step runs, so shorter ones use fewer.`;
  return [
    ...Array.from(
      { length: clips },
      (): PricedRequest => ({
        kind: "llm",
        stage: work.key,
        provider: typeof llmProvider === "string" ? llmProvider : "",
        model: typeof llmModel === "string" ? llmModel : "",
        inputCharacters: (typeof style === "string" ? style.length : 0) + 3000,
        outputCharacters: 2400,
        detail: "One LLM call per short writes its image prompts; its length is estimated.",
      }),
    ),
    ...Array.from(
      { length: images },
      (): PricedRequest => ({
        kind: "image",
        stage: work.key,
        provider: typeof provider === "string" ? provider : "",
        model: typeof model === "string" ? model : "",
        detail,
      }),
    ),
  ];
}

export function priceRecipe(
  work: RebuildWork,
  value: ResolvedWorkRecipe | undefined,
  config?: RunConfig,
): PricedRequest {
  if (value === undefined || work.disposition !== "generate")
    return {
      kind: "local",
      stage: work.key,
      detail:
        work.disposition === "reuse"
          ? "Retained work; no generation charge."
          : "Local, provided, or blocked work; no admitted generation charge.",
    };
  const input = value.input;
  const onPlan = config === undefined ? undefined : cliRequest(work, value, config);
  if (onPlan !== undefined) return onPlan;
  if (input.kind === "deferred" && input.operation === "narration-preparation")
    return {
      kind: "unknown",
      stage: work.key,
      detail:
        "Narration Preparation: one LLM call per future logical chunk or entry; source length is not yet known.",
    };
  if (input.kind === "llm")
    return {
      kind: "llm",
      stage: work.key,
      provider: input.provider,
      model: input.model,
      inputCharacters:
        input.messages.reduce((sum, message) => sum + message.content.length, 0) +
        (input.documents ?? []).reduce((sum, document) => sum + document.content.length, 0),
      outputCharacters: work.key === "article:body" ? 9000 : 2400,
      detail:
        "Actual saved request input; output length is estimated. Retries and tools are excluded.",
    };
  if (input.kind === "tts")
    return {
      kind: "tts",
      stage: work.key,
      provider: input.provider,
      model: input.model,
      text: input.text,
    };
  if (input.kind === "image")
    return { kind: "image", stage: work.key, provider: input.provider, model: input.model };
  if (input.kind === "local" && input.operation === "shorts-pick-v1") {
    const [, provider, model, , prompt, count] = Array.isArray(input.values) ? input.values : [];
    return {
      kind: "llm",
      stage: work.key,
      provider: typeof provider === "string" ? provider : "",
      model: typeof model === "string" ? model : "",
      inputCharacters:
        (typeof prompt === "string" && prompt !== "" ? prompt.length : defaultShortsPrompt.length) +
        shortsTranscriptEstimate,
      outputCharacters: 400 * (typeof count === "number" ? count : 1),
      detail:
        "The numbered transcript is built when the step runs; its length is estimated. One more call is made when the first answer breaks the rules. Retries are excluded.",
    };
  }
  // A review: the stage's prompt and the item (the article's text, or a short brief beside an
  // image, which the provider prices as it does).
  if (input.kind === "local" && input.operation === "review-v1") {
    const [stage, , , provider, model, , prompt] = Array.isArray(input.values) ? input.values : [];
    return {
      kind: "llm",
      stage: work.key,
      provider: typeof provider === "string" ? provider : "",
      model: typeof model === "string" ? model : "",
      inputCharacters:
        (typeof prompt === "string" && prompt !== "" ? prompt.length : 600) +
        (stage === "article" || stage === "narration" ? 20000 : 1500),
      outputCharacters: 400,
      detail:
        "The item is read when the step runs; its length is estimated. A failed item made again is reviewed again, which is not in this estimate.",
    };
  }
  if (input.kind === "local" && input.operation === "youtube-description-v1") {
    const [, provider, model, , prompt] = Array.isArray(input.values) ? input.values : [];
    return {
      kind: "llm",
      stage: work.key,
      provider: typeof provider === "string" ? provider : "",
      model: typeof model === "string" ? model : "",
      inputCharacters: (typeof prompt === "string" ? prompt.length : 0) + youtubeTranscriptEstimate,
      outputCharacters: 2400,
      detail:
        "The timed transcript is built when the step runs; its length is estimated. Retries are excluded.",
    };
  }
  return {
    kind: "tts-estimate",
    stage: work.key,
    provider: "",
    model: "",
    characters: 9000,
    detail:
      "Future generated input is unknown. This group materializes under the same admitted revision; its final request count and charge are unknown.",
  };
}

// A request built only when its step runs, on a command-line provider: it runs on the user's
// plan, so it is known at $0, as Play's review prices the same step. Its size is estimated
// for the API figure beside it; Narration Preparation's number of calls is not known yet, so
// it has none.
function cliRequest(
  work: RebuildWork,
  value: ResolvedWorkRecipe,
  config: RunConfig,
): PricedRequest | undefined {
  if (value.input.kind !== "deferred") return undefined;
  const choice = recipeProviderChoice(value, config);
  if (choice === undefined || !isLocalCliProvider(choice.provider)) return undefined;
  if (choice.family === "image")
    return { kind: "image", stage: work.key, provider: choice.provider, model: choice.model };
  if (choice.family !== "llm") return undefined;
  const preparation = value.input.operation === "narration-preparation";
  return {
    kind: "llm",
    stage: work.key,
    provider: choice.provider,
    model: choice.model,
    inputCharacters: 6000,
    outputCharacters: work.key === "article:body" ? 9000 : 2400,
    ...(preparation ? { apiUnknown: true as const } : {}),
    detail: preparation
      ? "Runs on your CLI plan, so it adds no charge. Narration Preparation makes one call per logical chunk or entry; how many is known when the step runs, so no API figure is given."
      : "Runs on your CLI plan, so it adds no charge. The request is built when the step runs, so its API figure uses an estimated length.",
  };
}
