import type { Catalogue } from "../../catalog/schema.js";
import { continuationLimit } from "../article/continuation.js";
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
    // Pre-1.5 requests embedded research in messages. Review a fresh document-based
    // request instead of re-admitting an input the current scheduler cannot match.
    // Running calls, accepted jobs and cached answers must retain their exact input.
    if (
      (piece.key === "research:notes" || piece.key === "article:body") &&
      piece.input.kind === "llm" &&
      (piece.input.documents?.length ?? 0) === 0 &&
      recipe.input.kind === "llm" &&
      (recipe.input.documents?.length ?? 0) > 0 &&
      row.state !== "running" &&
      !deps.db
        .prepare(
          "SELECT 1 FROM revision_work_pieces WHERE work_id=? AND (state IN ('running','done') OR continuation IS NOT NULL OR result_json IS NOT NULL) LIMIT 1",
        )
        .get(piece.workId)
    )
      continue;
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
      `SELECT w.id,w.state,w.dispatch_state,p.continuation FROM revision_work_reservations r JOIN revision_work w ON w.id=r.work_id JOIN revision_work_pieces p ON p.id=r.piece_id WHERE r.revision_id=? AND r.work_key=? AND r.fingerprint=? AND w.recipe_context IS NOT NULL`,
    )
    .get(revisionId, key, fingerprint);
  return (
    row === undefined ||
    (row.state !== "running" &&
      !(row.state === "pending" && row.dispatch_state === "allowed") &&
      row.continuation === null &&
      !(key === "article:body" && cachedArticleComplete(deps, revisionId, String(row.id))))
  );
}

function cachedArticleComplete(deps: RevisionDeps, revisionId: string, workId: string): boolean {
  const answers = deps.db
    .prepare(
      `SELECT p.work_key,json_extract(p.result_json,'$.finishReason') AS finish_reason
       FROM revision_work_pieces p
       JOIN revision_work_reservations r ON r.piece_id=p.id AND r.work_id=p.work_id
         AND r.work_key=p.work_key AND r.fingerprint=p.fingerprint
       JOIN project_revisions v ON v.id=r.revision_id
       JOIN json_each(v.fingerprints) f ON f.key=COALESCE(r.logical_key,r.work_key)
         AND f.value=COALESCE(r.desired_fingerprint,r.fingerprint)
       WHERE r.revision_id=? AND p.work_id=? AND p.result_json IS NOT NULL
         AND json_extract(p.input_json,'$.kind')='llm'
         AND COALESCE(r.logical_key,r.work_key)='article:body'`,
    )
    .all(revisionId, workId);
  for (let part = 0; part <= continuationLimit; part += 1) {
    const key = part === 0 ? "article:body" : `article:continuation:${part}`;
    const answer = answers.find((row) => row.work_key === key);
    if (answer === undefined) return false;
    if (answer.finish_reason !== "length") return true;
  }
  return false;
}

export function hasSubmittedRequest(deps: RevisionDeps, revisionId: string, key: string): boolean {
  return (
    deps.db
      .prepare(
        `SELECT 1 FROM revision_work_reservations r JOIN revision_work_pieces p ON p.id=r.piece_id WHERE r.revision_id=? AND r.work_key=? AND p.submitted_at IS NOT NULL AND p.continuation IS NULL AND p.state!='done'`,
      )
      .get(revisionId, key) !== undefined
  );
}
