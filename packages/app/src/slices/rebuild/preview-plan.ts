import { z } from "zod";
import { type Catalogue, catalogueSchema } from "../../catalog/schema.js";
import { stageKinds } from "../../kernel/pipeline.js";
import { estimateRequests } from "../estimate/index.js";
import type { RevisionDeps, RevisionView } from "../revisions/model.js";
import { requestHash } from "../revisions/mutation-request.js";
import type { RebuildPreview, RebuildResult, RebuildSelection } from "./model.js";
import { previewDetails } from "./preview-details.js";
import {
  hasSubmittedRequest,
  requiresNewSubmission,
  retainedPreviewPlan,
} from "./preview-retained.js";
import { providedDependencyFingerprint } from "./provided-review.js";
import { recipeInputSchema } from "./recipe-input-schema.js";
import type { ResolvedWorkRecipe } from "./recipe-model.js";
import { recipeProviderChoice } from "./recipe-provider-choice.js";
import { priceRecipe } from "./recipe-work.js";
import { reservationKey } from "./runtime-admission.js";
import { narrationOrdinal } from "./runtime-narration-reuse.js";
import { executionCatalogue } from "./runtime-plan.js";

export const executionSnapshotSchema = z.object({
  version: z.literal(1),
  submissions: z
    .array(z.object({ key: z.string(), submit: z.boolean(), uncertain: z.boolean() }))
    .default([]),
  catalogue: catalogueSchema,
  recipes: z.array(
    z.object({
      key: z.string(),
      stage: z.enum(stageKinds),
      kind: z.enum(["provider", "local", "provided"]),
      requestFingerprint: z.string(),
      fingerprint: z.string(),
      logicalFingerprint: z.string(),
      dependsOn: z.array(z.string()),
      unresolved: z.boolean(),
      deferred: z.boolean(),
      input: recipeInputSchema,
    }),
  ),
  dispositions: z.array(z.object({ key: z.string(), disposition: z.string() })),
  assets: z.array(z.object({ id: z.string(), path: z.string(), available: z.boolean() })),
  reviews: z.array(z.object({ key: z.string(), fingerprint: z.string() })),
  anchors: z.record(z.string(), z.string()),
  ordinals: z.record(z.string(), z.number().int()),
});
export type ExecutionSnapshot = z.infer<typeof executionSnapshotSchema>;
export interface PreviewPlan {
  readonly preview: RebuildPreview;
  readonly execution: ExecutionSnapshot;
}

export function planPreview(
  deps: RevisionDeps,
  view: RevisionView,
  catalogue: Catalogue,
  selection: RebuildSelection,
  id: string,
): RebuildResult<PreviewPlan> {
  const plan = retainedPreviewPlan(deps, view, catalogue);
  const requested =
    selection.kind === "allAffected"
      ? plan.work.filter((row) => row.disposition !== "reuse").map((row) => row.key)
      : selection.workKeys;
  if (new Set(requested).size !== requested.length)
    return invalid("Choose each work item only once.");
  const selected = new Set<string>();
  const visiting = new Set<string>();
  const visit = (key: string): boolean => {
    if (selected.has(key)) return true;
    if (visiting.has(key)) return false;
    const work = plan.work.find((row) => row.key === key);
    const recipe = plan.recipes.find((row) => row.key === key);
    if (work === undefined || recipe === undefined) return false;
    if (recipe.input.kind === "provided" && recipe.unresolved) return false;
    if (recipe.unresolved && recipe.dependsOn.length === 0 && !recipe.deferred) return false;
    visiting.add(key);
    if (work.disposition !== "reuse")
      for (const dependency of recipe.dependsOn) if (!visit(dependency)) return false;
    visiting.delete(key);
    selected.add(key);
    return true;
  };
  for (const key of requested)
    if (!visit(key))
      return invalid(`Work ${key} is disabled, unknown, or has an unavailable prerequisite.`);
  const recipes = plan.recipes.filter((row) => selected.has(row.key));
  const reservations = deps.db
    .prepare(
      `SELECT r.work_key,r.fingerprint,w.state,w.recipe_context,r.piece_id FROM revision_work_reservations r JOIN revision_work w ON w.id=r.work_id WHERE r.revision_id=?`,
    )
    .all(view.revision.id);
  const work = plan.work
    .filter((row) => selected.has(row.key))
    .map((row) => {
      const old = reservations.find(
        (one) =>
          one.work_key === row.key &&
          one.fingerprint === row.fingerprint &&
          one.state !== "done" &&
          typeof one.recipe_context === "string",
      );
      return old === undefined
        ? row
        : {
            ...row,
            inflight: old.state === "running",
            pieceIds: typeof old.piece_id === "string" ? [old.piece_id] : [],
          };
    });
  const relevantAssets = new Map<string, { id: string; path: string; available: boolean }>();
  for (const row of view.outputs)
    if (row.selected && selected.has(row.workKey))
      relevantAssets.set(row.assetId, {
        id: row.assetId,
        path: row.output.path,
        available: row.available,
      });
  for (const row of view.pieces)
    if (row.selected && selected.has(row.key) && row.assetId !== null) {
      const asset = deps.db
        .prepare("SELECT path FROM project_assets WHERE id=? AND project_id=?")
        .get(row.assetId, view.revision.projectId);
      relevantAssets.set(row.assetId, {
        id: row.assetId,
        path: String(asset?.path ?? ""),
        available: row.available,
      });
    }
  for (const recipe of recipes)
    if (recipe.input.kind === "provided" && recipe.input.assetId !== null) {
      const asset = deps.db
        .prepare("SELECT path FROM project_assets WHERE id=? AND project_id=?")
        .get(recipe.input.assetId, view.revision.projectId);
      relevantAssets.set(recipe.input.assetId, {
        id: recipe.input.assetId,
        path: String(asset?.path ?? ""),
        available: !recipe.unresolved,
      });
    }
  const snapshot = selectedCatalogue(
    executionCatalogue(catalogue, view.revision.config),
    recipes,
    view,
  );
  const submissions = work
    .filter((row) => row.kind === "provider")
    .map((row) => {
      const submit =
        row.disposition !== "reuse" &&
        !row.inflight &&
        requiresNewSubmission(deps, view.revision.id, row.key, row.fingerprint);
      return {
        key: row.key,
        submit,
        uncertain: submit && hasSubmittedRequest(deps, view.revision.id, row.key, row.fingerprint),
      };
    });
  const execution: ExecutionSnapshot = {
    version: 1,
    submissions,
    catalogue: snapshot,
    recipes: recipes.map((row) => ({ ...row, dependsOn: [...row.dependsOn] })),
    dispositions: work.map((row) => ({ key: row.key, disposition: row.disposition })),
    assets: [...relevantAssets.values()].sort((a, b) => a.id.localeCompare(b.id)),
    reviews: plan.providedReuseRequired
      .filter((key) => selected.has(key))
      .map((key) => ({ key, fingerprint: providedDependencyFingerprint(plan, key) })),
    ordinals: Object.fromEntries(
      recipes.map((row) => [row.key, narrationOrdinal(plan.recipes, row.key)]),
    ),
    anchors: Object.fromEntries(
      recipes.map((recipe) => {
        const key = reservationKey(recipe, view);
        return [key, view.revision.fingerprints[key] ?? recipe.logicalFingerprint];
      }),
    ),
  };
  const preview: RebuildPreview = {
    id,
    projectId: view.revision.projectId,
    baseRevisionId: view.revision.id,
    selection,
    planFingerprint: executionFingerprint(view.revision.id, execution),
    work,
    review: previewDetails(deps, view, plan.recipes, selected),
    changedInputs: plan.changedInputs.filter((row) => selected.has(row.path)),
    retained: view.outputs
      .filter((row) => row.selected)
      .map((row) => ({
        slot: row.slot,
        outputId: row.output.id,
        assetId: row.assetId,
        state: row.state,
      })),
    providedReuseRequired: execution.reviews.map((row) => row.key),
    costs: estimateRequests(
      work.map((row) =>
        priceRecipe(
          row.inflight || !requiresNewSubmission(deps, view.revision.id, row.key, row.fingerprint)
            ? { ...row, disposition: "reuse" }
            : row,
          recipes.find((recipe) => recipe.key === row.key),
        ),
      ),
      snapshot,
    ),
    wholeRequestNotice: plan.wholeRequestNotice,
    warnings: submissions.some((row) => row.uncertain)
      ? [
          "A previous request was submitted without a saved result or resumable job. Retrying may charge you again.",
        ]
      : [],
  };
  return { ok: true, value: { preview, execution } };
}
function invalid(message: string): RebuildResult<never> {
  return {
    ok: false,
    reason: "invalid-selection",
    fields: [{ field: "request.workKeys", message }],
  };
}
function selectedCatalogue(
  catalogue: Catalogue,
  recipes: readonly ResolvedWorkRecipe[],
  view: RevisionView,
): Catalogue {
  const uses = new Set(
    recipes.flatMap((row) => {
      const choice = recipeProviderChoice(row, view.revision.config);
      return choice === undefined ? [] : [`${choice.family}:${choice.provider}:${choice.model}`];
    }),
  );
  const audio = view.revision.config.audio;
  if (
    audio &&
    recipes.some(
      (row) =>
        (row.input.kind === "llm" && row.input.preparation) ||
        (row.input.kind === "deferred" && row.input.operation === "narration-preparation"),
    )
  )
    uses.add(`tts:${audio.provider}:${audio.model}`);
  const selected = {
    llm: catalogue.llm.filter((row) => uses.has(`llm:${row.provider}:${row.id}`)),
    tts: catalogue.tts.filter((row) => uses.has(`tts:${row.provider}:${row.id}`)),
    image: catalogue.image.filter((row) => uses.has(`image:${row.provider}:${row.id}`)),
  };
  const providers = new Set(
    [...selected.llm, ...selected.tts, ...selected.image].map((row) => row.provider),
  );
  return {
    ...catalogue,
    ...selected,
    providers: Object.fromEntries(
      Object.entries(catalogue.providers).filter(([id]) => providers.has(id)),
    ),
  };
}

function executionFingerprint(revisionId: string, execution: ExecutionSnapshot): string {
  return requestHash("rebuild-plan-v1", revisionId, {
    ...execution,
    catalogue: { ...execution.catalogue, updatedAt: "1970-01-01" },
  });
}

export function reviewStillCovers(
  reviewed: RebuildPreview,
  snapshot: ExecutionSnapshot,
  fresh: PreviewPlan,
): boolean {
  if (reviewed.planFingerprint === fresh.preview.planFingerprint) return true;
  const escalated = fresh.execution.submissions.some((current) => {
    const old = snapshot.submissions.find((row) => row.key === current.key);
    return current.submit && (old?.submit !== true || (current.uncertain && !old.uncertain));
  });
  // A paid request may become a free join while readiness loads, never the reverse.
  return (
    !escalated &&
    executionFingerprint(reviewed.baseRevisionId, {
      ...fresh.execution,
      submissions: snapshot.submissions,
    }) === reviewed.planFingerprint
  );
}
