import type { Catalogue } from "../../catalog/schema.js";
import { transact } from "../../kernel/db/tx.js";
import type { WorkRef } from "../../kernel/runner/work.js";
import { narrationRegenerationToken } from "../narration/plan.js";
import type { RevisionDeps, RevisionView } from "../revisions/model.js";
import { currentRevisionId } from "../revisions/repo.js";
import type { ResolvedWorkRecipe } from "./recipe-model.js";
import { bindNarrationReuse, narrationOrdinal } from "./runtime-narration-reuse.js";
import { executionCatalogue, executionPlan } from "./runtime-plan.js";
import { insertWorkPiece } from "./work-records.js";

export interface ReservationAnchor {
  readonly key: string;
  readonly fingerprint: string;
}

export function admitInitialRevision(
  deps: RevisionDeps,
  view: RevisionView,
  catalogue: Catalogue,
): void {
  transact(deps.db, () => {
    if (currentRevisionId(deps.db, view.revision.projectId) !== view.revision.id)
      throw new Error("Initial admission requires the selected revision.");
    if (
      deps.db
        .prepare("SELECT 1 FROM revision_work WHERE project_id=? LIMIT 1")
        .get(view.revision.projectId) !== undefined
    )
      throw new Error("An existing project requires explicit rebuild admission.");
    const snapshot = executionCatalogue(catalogue, view.revision.config);
    const plan = executionPlan(deps, view, snapshot);
    for (const recipe of plan.recipes) {
      if (!plan.work.some((row) => row.key === recipe.key)) continue;
      const desired = view.revision.fingerprints[recipe.key];
      const logicalKey = recipe.input.kind === "tts" ? `${recipe.input.logicalKey}:1` : recipe.key;
      const anchor = view.revision.fingerprints[logicalKey] ?? desired;
      if (anchor === undefined)
        throw new Error(`Initial work ${recipe.key} has no desired anchor.`);
      const reuse = plan.work.find((row) => row.key === recipe.key)?.disposition === "reuse";
      if (reuse) bindNarrationReuse(deps, view, recipe, narrationOrdinal(plan.recipes, recipe.key));
      insertInvocation(
        deps,
        view,
        recipe,
        snapshot,
        { key: logicalKey, fingerprint: anchor },
        reuse,
      );
    }
  });
}

export function insertInvocation(
  deps: Pick<RevisionDeps, "db" | "ids" | "clock">,
  view: RevisionView,
  recipe: ResolvedWorkRecipe,
  catalogue: Catalogue,
  anchor: ReservationAnchor,
  completed: boolean,
  reservationRevisionId = view.revision.id,
  admissionId: string | null = null,
): WorkRef {
  const { projectId, id: revisionId } = view.revision;
  const stage = deps.db
    .prepare("SELECT id FROM stages WHERE project_id=? AND kind=?")
    .get(projectId, recipe.stage);
  if (typeof stage?.id !== "string") throw new Error("Revision work has no owned stage.");
  const work: WorkRef = {
    projectId,
    revisionId,
    workId: deps.ids.next(),
    stageId: stage.id,
    kind: recipe.stage,
    fingerprint: recipe.fingerprint,
  };
  deps.db
    .prepare(
      `INSERT INTO revision_work(id,project_id,revision_id,stage_id,kind,fingerprint,state,dispatch_state,recipe_context,created_at,admission_id) VALUES (?,?,?,?,?,?,?,'allowed',?,?,?)`,
    )
    .run(
      work.workId,
      projectId,
      revisionId,
      stage.id,
      recipe.stage,
      recipe.fingerprint,
      completed ? "done" : "pending",
      JSON.stringify(catalogue),
      deps.clock.now().toISOString(),
      admissionId,
    );
  const pieceId = deps.ids.next();
  insertWorkPiece(deps.db, {
    id: pieceId,
    workId: work.workId,
    key: recipe.key,
    fingerprint: recipe.fingerprint,
    requestFingerprint: recipe.requestFingerprint,
    logicalFingerprint: recipe.logicalFingerprint,
    input: recipe.input,
    continuation: null,
    generationToken:
      recipe.input.kind === "tts"
        ? narrationRegenerationToken(
            view.revision.content.regenerationTokens,
            recipe.input.logicalKey,
            recipe.input.segment,
          )
        : (view.revision.content.regenerationTokens[recipe.key] ?? null),
    state: completed ? "done" : "pending",
    dispatchState: "allowed",
    submittedAt: null,
  });
  deps.db
    .prepare(
      `INSERT INTO revision_work_reservations(project_id,revision_id,work_key,work_id,piece_id,fingerprint,logical_key,desired_fingerprint) VALUES (?,?,?,?,?,?,?,?)`,
    )
    .run(
      projectId,
      reservationRevisionId,
      recipe.key,
      work.workId,
      pieceId,
      recipe.fingerprint,
      anchor.key,
      anchor.fingerprint,
    );
  return work;
}
