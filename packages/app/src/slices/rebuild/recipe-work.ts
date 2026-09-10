import { z } from "zod";
import type { Catalogue } from "../../catalog/schema.js";
import type { CostEstimate, PricedRequest } from "../estimate/index.js";
import { estimateRequests } from "../estimate/index.js";
import type { ProjectRevision, RevisionManifest } from "../revisions/model.js";
import { planDependencies, type RetainedWork, type WorkRecipe } from "./dependencies.js";
import type { RebuildPreview, RebuildWork } from "./model.js";
import { buildRecipes } from "./recipe-build.js";
import { manualCuesNeedReview } from "./recipe-exports.js";
import {
  type RecipeContext,
  type ResolvedRevisionInputs,
  type ResolvedWorkRecipe,
  selectedReference,
} from "./recipe-model.js";

export interface RevisionWorkPlan {
  readonly recipes: readonly ResolvedWorkRecipe[];
  readonly work: readonly RebuildWork[];
  readonly changedInputs: RebuildPreview["changedInputs"];
  readonly providedReuseRequired: readonly string[];
  readonly wholeRequestNotice: string | null;
  readonly costs: CostEstimate;
}
export function planRevisionWork(
  revision: ProjectRevision,
  manifest: RevisionManifest,
  catalogue: Catalogue,
  availableAssetIds: ReadonlySet<string>,
  resolved: ResolvedRevisionInputs,
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
  const retained = recipes.flatMap((row) => retainedFor(row, logical, selected, availableAssetIds));
  const rawWork = planDependencies(recipes.map(comparisonRecipe), retained);
  const manualReview = manualCuesNeedReview(logicalContext, logical);
  const work = rawWork.map(
    (row): RebuildWork =>
      manualReview && row.key === "subtitles:cues"
        ? {
            ...row,
            disposition: "review",
            reason:
              "Narration or transcript changed. Review the saved manual cues before reusing them.",
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
  const priced = work.map(
    (row): PricedRequest =>
      priceRecipe(
        row,
        recipes.find((one) => one.key === row.key),
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
  const current = manifest.outputs.find(
    (one) =>
      one.workKey === row.key &&
      one.fingerprint === row.logicalFingerprint &&
      one.state === "ready" &&
      available.has(one.assetId),
  );
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
    current !== undefined ||
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
          current !== undefined ||
          matched.some((one) => one.piece.state === "done") ||
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
      available: available.has(one.assetId),
      inflight: false,
      pieceIds: [],
    }));
}
function priceRecipe(work: RebuildWork, value: ResolvedWorkRecipe | undefined): PricedRequest {
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
  if (input.kind === "llm")
    return {
      kind: "llm",
      stage: work.key,
      provider: input.provider,
      model: input.model,
      inputCharacters: input.messages.reduce((sum, message) => sum + message.content.length, 0),
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
