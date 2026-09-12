import type { Catalogue } from "../../catalog/schema.js";
import type { RevisionDeps, RevisionView } from "../revisions/model.js";
import type { ResolvedWorkRecipe } from "./recipe-model.js";
import type { RevisionWorkPlan } from "./recipe-work.js";
import { executionPlan, executionView, savedCatalogue } from "./runtime-plan.js";
import { workPieces } from "./work-records.js";

export function retainedPreviewPlan(
  deps: RevisionDeps,
  view: RevisionView,
  catalogue: Catalogue,
): RevisionWorkPlan {
  const current = executionPlan(deps, view, catalogue);
  const replacements = new Map<string, ResolvedWorkRecipe>();
  const groups = new Set<string>();
  const reservations = deps.db
    .prepare(
      `SELECT r.*,w.revision_id AS origin_revision,w.recipe_context,w.state FROM revision_work_reservations r JOIN revision_work w ON w.id=r.work_id WHERE r.revision_id=? AND w.recipe_context IS NOT NULL AND w.state!='done'`,
    )
    .all(view.revision.id);
  const origins = new Map<string, RevisionWorkPlan>();
  for (const row of reservations) {
    const anchor = String(row.logical_key ?? row.work_key);
    if (view.revision.fingerprints[anchor] !== row.desired_fingerprint) continue;
    const piece = workPieces(deps.db, String(row.work_id)).find((one) => one.id === row.piece_id);
    if (piece === undefined) continue;
    const originKey = `${row.origin_revision}:${row.recipe_context}`;
    let original = origins.get(originKey);
    if (original === undefined) {
      const origin = executionView(deps, view.revision.projectId, String(row.origin_revision));
      if (origin === undefined) continue;
      original = executionPlan(deps, origin, savedCatalogue(row.recipe_context));
      origins.set(originKey, original);
    }
    const recipe = original.recipes.find((one) => one.key === piece.key);
    if (recipe === undefined) continue;
    replacements.set(piece.key, {
      ...recipe,
      input: piece.input,
      fingerprint: piece.fingerprint,
      requestFingerprint: piece.requestFingerprint,
      logicalFingerprint: piece.logicalFingerprint ?? recipe.logicalFingerprint,
    });
    if (piece.input.kind === "tts") {
      const logicalKey = piece.input.logicalKey;
      groups.add(logicalKey);
      for (const sibling of original.recipes)
        if (
          sibling.input.kind === "tts" &&
          sibling.input.logicalKey === logicalKey &&
          !replacements.has(sibling.key)
        )
          replacements.set(sibling.key, sibling);
    }
  }
  const recipes = current.recipes.flatMap((row) => {
    const replacement = replacements.get(row.key);
    if (replacement !== undefined) return [replacement];
    if (row.input.kind === "tts" && groups.has(row.input.logicalKey)) return [];
    return [row];
  });
  for (const row of replacements.values())
    if (!recipes.some((one) => one.key === row.key)) recipes.push(row);
  const work = recipes.flatMap((recipe) => {
    const row = current.work.find((one) => one.key === recipe.key);
    if (row !== undefined)
      return [
        {
          ...row,
          requestFingerprint: recipe.requestFingerprint,
          fingerprint: recipe.fingerprint,
          dependsOn: recipe.dependsOn,
          kind: recipe.kind,
          stage: recipe.stage,
        },
      ];
    if (!replacements.has(recipe.key)) return [];
    return [
      {
        key: recipe.key,
        stage: recipe.stage,
        kind: recipe.kind,
        requestFingerprint: recipe.requestFingerprint,
        fingerprint: recipe.fingerprint,
        dependsOn: recipe.dependsOn,
        disposition: recipe.kind === "local" ? ("local" as const) : ("generate" as const),
        reason: "Continue the exact admitted request.",
        inflight: false,
        pieceIds: [],
      },
    ];
  });
  return { ...current, recipes, work };
}
export function requiresNewSubmission(
  deps: RevisionDeps,
  revisionId: string,
  key: string,
  fingerprint: string,
): boolean {
  const row = deps.db
    .prepare(
      `SELECT w.state,w.dispatch_state,p.continuation FROM revision_work_reservations r JOIN revision_work w ON w.id=r.work_id JOIN revision_work_pieces p ON p.id=r.piece_id WHERE r.revision_id=? AND r.work_key=? AND r.fingerprint=? AND w.recipe_context IS NOT NULL`,
    )
    .get(revisionId, key, fingerprint);
  return (
    row === undefined ||
    (row.state !== "running" &&
      !(row.state === "pending" && row.dispatch_state === "allowed") &&
      row.continuation === null)
  );
}

export function hasSubmittedRequest(
  deps: RevisionDeps,
  revisionId: string,
  key: string,
  fingerprint: string,
): boolean {
  return (
    deps.db
      .prepare(
        `SELECT 1 FROM revision_work_reservations r JOIN revision_work_pieces p ON p.id=r.piece_id WHERE r.revision_id=? AND r.work_key=? AND r.fingerprint=? AND p.submitted_at IS NOT NULL AND p.continuation IS NULL AND p.state!='done'`,
      )
      .get(revisionId, key, fingerprint) !== undefined
  );
}
