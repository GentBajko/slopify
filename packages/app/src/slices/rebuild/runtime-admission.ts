import type { Catalogue } from "../../catalog/schema.js";
import { transact } from "../../kernel/db/tx.js";
import type { WorkRef } from "../../kernel/runner/work.js";
import { narrationRegenerationToken } from "../narration/plan.js";
import type { RevisionDeps, RevisionView } from "../revisions/model.js";
import { currentRevisionId } from "../revisions/repo.js";
import type { ResolvedWorkRecipe } from "./recipe-model.js";
import { bindNarrationReuse, narrationOrdinal } from "./runtime-narration-reuse.js";
import { executionCatalogue, executionPlan } from "./runtime-plan.js";
import { insertWorkPiece, workPieces } from "./work-records.js";

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
      `INSERT INTO revision_work(id,project_id,revision_id,stage_id,kind,fingerprint,state,dispatch_state,recipe_context,created_at) VALUES (?,?,?,?,?,?,?,'allowed',?,?)`,
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

export function admitPendingRevision(
  deps: RevisionDeps,
  view: RevisionView,
  catalogue: Catalogue,
  kinds?: readonly import("../../kernel/pipeline.js").StageKind[],
): void {
  transact(deps.db, () => {
    if (currentRevisionId(deps.db, view.revision.projectId) !== view.revision.id)
      throw new Error("Admission requires the selected revision.");
    const snapshot = executionCatalogue(catalogue, view.revision.config);
    const plan = executionPlan(deps, view, snapshot);
    const requested = new Set(
      plan.recipes
        .filter((recipe) => kinds === undefined || kinds.includes(recipe.stage))
        .map((recipe) => recipe.key),
    );
    for (const key of requested)
      for (const dependency of plan.recipes.find((recipe) => recipe.key === key)?.dependsOn ?? [])
        requested.add(dependency);
    const admittedKeys = new Set<string>();
    const admittedNarration = new Set<string>();
    const admittedFuture = new Set<string>();
    const retained = deps.db
      .prepare(
        `SELECT r.*,w.recipe_context,w.kind,w.state FROM revision_work_reservations r JOIN revision_work w ON w.id=r.work_id WHERE r.revision_id=? AND w.recipe_context IS NOT NULL`,
      )
      .all(view.revision.id);
    const missingCompleted = new Set(
      retained
        .filter(
          (row) =>
            row.state === "done" &&
            plan.work.find((work) => work.key === row.work_key)?.disposition !== "reuse",
        )
        .map((row) => String(row.work_key)),
    );
    for (const row of retained) {
      if (missingCompleted.has(String(row.work_key))) continue;
      const key = String(row.work_key);
      const logicalKey = String(row.logical_key ?? row.work_key);
      if (view.revision.fingerprints[logicalKey] !== (row.desired_fingerprint ?? row.fingerprint))
        continue;
      const piece = workPieces(deps.db, String(row.work_id)).find(
        (value) => value.id === row.piece_id,
      );
      if (piece === undefined) continue;
      admittedKeys.add(key);
      if (piece.input.kind === "tts") admittedNarration.add(piece.input.logicalKey);
      if (piece.input.kind === "deferred" && key.endsWith(":future")) admittedFuture.add(key);
      if (
        !requested.has(key) &&
        !plan.recipes.some((recipe) => requested.has(recipe.key) && recipe.stage === row.kind)
      )
        continue;
      if (row.state === "running") continue;
      deps.db
        .prepare(
          "UPDATE revision_work SET state='pending',dispatch_state='allowed',failure_reason=NULL WHERE id=? AND state!='done'",
        )
        .run(String(row.work_id));
      deps.db
        .prepare(
          "UPDATE revision_work_pieces SET state='pending',dispatch_state='allowed' WHERE id=? AND state!='done'",
        )
        .run(piece.id);
    }
    for (const recipe of plan.recipes) {
      if (!requested.has(recipe.key)) continue;
      if (
        admittedKeys.has(recipe.key) ||
        (recipe.input.kind === "tts" &&
          ((admittedNarration.has(recipe.input.logicalKey) && !missingCompleted.has(recipe.key)) ||
            (admittedFuture.has(`audio:${recipe.input.segment}:future`) &&
              view.revision.fingerprints[`${recipe.input.logicalKey}:1`] === undefined)))
      )
        continue;
      const disposition = plan.work.find((row) => row.key === recipe.key)?.disposition;
      if (disposition === "reuse") {
        bindNarrationReuse(deps, view, recipe, narrationOrdinal(plan.recipes, recipe.key));
        const reused = deps.db
          .prepare(
            "SELECT work_id,piece_id FROM revision_work_reservations WHERE revision_id=? AND work_key=?",
          )
          .get(view.revision.id, recipe.key);
        if (reused !== undefined) {
          deps.db
            .prepare(
              "UPDATE revision_work SET state='done',dispatch_state='held',failure_reason=NULL WHERE id=? AND state!='running'",
            )
            .run(String(reused.work_id));
          deps.db
            .prepare(
              "UPDATE revision_work_pieces SET state='done',dispatch_state='held' WHERE id=? AND state!='running'",
            )
            .run(String(reused.piece_id));
        }
        continue;
      }
      if (disposition === undefined || disposition === "review") continue;
      const existing = deps.db
        .prepare(
          "SELECT w.*,r.piece_id,r.fingerprint AS piece_fingerprint FROM revision_work_reservations r JOIN revision_work w ON w.id=r.work_id WHERE r.revision_id=? AND r.work_key=?",
        )
        .get(view.revision.id, recipe.key);
      if (existing?.state === "running") continue;
      if (
        existing?.state !== "done" &&
        existing?.piece_fingerprint === recipe.fingerprint &&
        typeof existing.recipe_context === "string"
      ) {
        deps.db
          .prepare(
            "UPDATE revision_work SET state='pending',dispatch_state='allowed',failure_reason=NULL WHERE id=? AND state!='done'",
          )
          .run(String(existing.id));
        deps.db
          .prepare(
            "UPDATE revision_work_pieces SET state='pending',dispatch_state='allowed' WHERE work_id=? AND state!='done'",
          )
          .run(String(existing.id));
        continue;
      }
      const logicalKey = recipe.input.kind === "tts" ? `${recipe.input.logicalKey}:1` : recipe.key;
      const anchor = view.revision.fingerprints[logicalKey];
      if (anchor === undefined) continue;
      deps.db
        .prepare("DELETE FROM revision_work_reservations WHERE revision_id=? AND work_key=?")
        .run(view.revision.id, recipe.key);
      insertInvocation(
        deps,
        view,
        recipe,
        snapshot,
        { key: logicalKey, fingerprint: anchor },
        false,
      );
    }
  });
}
