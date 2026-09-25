import { z } from "zod";
import type { StageProgressEvent } from "../../kernel/events.js";
import type { StageState } from "../../kernel/pipeline.js";
import { stageKinds, stageStates } from "../../kernel/pipeline.js";
import type { RunnerStage } from "../../kernel/runner/index.js";
import type { WorkRef } from "../../kernel/runner/work.js";
import type { RevisionDeps } from "../revisions/model.js";
import { currentRevisionId } from "../revisions/repo.js";
import { getRevisionView } from "../revisions/view.js";
import { settleScheduleRunsForProject } from "../schedules/repo.js";
import { executionPlan, executionView, savedCatalogue } from "./runtime-plan.js";
import { workPieces } from "./work-records.js";

const workRow = z.object({
  id: z.string(),
  project_id: z.string(),
  revision_id: z.string(),
  stage_id: z.string(),
  kind: z.enum(stageKinds),
  state: z.enum(stageStates),
  fingerprint: z.string(),
});
export function executionStages(deps: RevisionDeps, projectId: string): readonly RunnerStage[] {
  const head = currentRevisionId(deps.db, projectId);
  if (head === undefined) return [];
  const view = getRevisionView(deps, projectId, head);
  const rows = deps.db
    .prepare(
      `SELECT DISTINCT w.* FROM revision_work w JOIN revision_work_reservations r ON r.work_id=w.id WHERE r.project_id=? AND r.revision_id=?`,
    )
    .all(projectId, head);
  const keys = new Set(
    deps.db
      .prepare("SELECT work_key FROM revision_work_reservations WHERE revision_id=?")
      .all(head)
      .map((row) => String(row.work_key)),
  );
  const futureKeys = new Map<string, ReadonlySet<string>>();
  return rows
    .filter((row) =>
      workPieces(deps.db, String(row.id)).some((piece) => {
        if (!keys.has(piece.key)) return false;
        if (piece.key === "subtitles:timing" && view?.revision.content.subtitleCues !== undefined)
          return false;
        if (piece.input.kind === "deferred" && piece.key.endsWith(":future")) {
          const cacheKey = String(row.id);
          let deferred = futureKeys.get(cacheKey);
          if (deferred === undefined) {
            const origin = executionView(deps, projectId, String(row.revision_id));
            if (origin === undefined || row.recipe_context === null) return true;
            deferred = new Set(
              executionPlan(deps, origin, savedCatalogue(row.recipe_context))
                .recipes.filter((recipe) => recipe.deferred)
                .map((recipe) => recipe.key),
            );
            futureKeys.set(cacheKey, deferred);
          }
          return deferred.has(piece.key);
        }
        return true;
      }),
    )
    .map((value) => {
      const row = workRow.parse(value);
      return {
        id: row.stage_id,
        projectId,
        kind: row.kind,
        state: row.state,
        work: {
          projectId,
          revisionId: row.revision_id,
          workId: row.id,
          stageId: row.stage_id,
          kind: row.kind,
          fingerprint: row.fingerprint,
        },
      };
    });
}

export function invocationReady(deps: RevisionDeps, work: WorkRef): boolean {
  const row = deps.db
    .prepare(
      "SELECT recipe_context FROM revision_work WHERE id=? AND project_id=? AND revision_id=?",
    )
    .get(work.workId, work.projectId, work.revisionId);
  if (row?.recipe_context === null || row === undefined) return false;
  const view = executionView(deps, work.projectId, work.revisionId);
  if (view === undefined) return false;
  const plan = executionPlan(deps, view, savedCatalogue(row.recipe_context));
  const pieces = workPieces(deps.db, work.workId);
  return pieces.some((piece) => {
    if (
      piece.state === "done" ||
      piece.dispatchState !== "allowed" ||
      piece.input.kind === "deferred"
    )
      return false;
    if (piece.continuation !== null) return true;
    const recipe = plan.recipes.find(
      (value) => value.key === piece.key && value.fingerprint === piece.fingerprint,
    );
    if (recipe === undefined || recipe.unresolved || recipe.deferred) return false;
    return recipe.dependsOn.every((key) => {
      const dependency = plan.work.find((value) => value.key === key);
      return dependency?.disposition === "reuse" && !dependency.inflight;
    });
  });
}

export function executionStandings(
  deps: RevisionDeps,
  projectId: string,
  derived?: readonly RunnerStage[],
): readonly Pick<RunnerStage, "kind" | "state">[] {
  const revisionId = currentRevisionId(deps.db, projectId);
  const view = revisionId === undefined ? undefined : getRevisionView(deps, projectId, revisionId);
  if (view === undefined) return [];
  const work = derived ?? executionStages(deps, projectId);
  return stageKinds.map((kind) => {
    const source = view.revision.config.sources[kind];
    const group = work
      .filter((entry) => entry.kind === kind)
      .map((entry) => {
        const pieces = workPieces(deps.db, entry.work.workId);
        const retained =
          pieces.length > 0 &&
          pieces.every(
            (piece) =>
              view.outputs.some(
                (output) =>
                  output.workKey === piece.key &&
                  output.selected &&
                  output.available &&
                  output.state === "ready",
              ) ||
              view.pieces.some(
                (output) =>
                  output.key === piece.key &&
                  output.selected &&
                  output.available &&
                  output.piece.state === "done" &&
                  output.fingerprint === piece.fingerprint,
              ),
          );
        // Save can bind an existing asset without granting its placeholder invocation.
        return retained ? { ...entry, state: "done" as const } : entry;
      });
    let state: StageState =
      source === "off" ? "skipped" : source === "provide" ? "provided" : "pending";
    if (group.some((entry) => entry.state === "running")) state = "running";
    else if (group.some((entry) => entry.state === "failed")) state = "failed";
    else if (group.some((entry) => entry.state === "canceled")) state = "canceled";
    else if (group.length > 0)
      state = group.every((entry) => entry.state === "done")
        ? source === "provide"
          ? "provided"
          : "done"
        : "pending";
    return { kind, state };
  });
}

export function projectStandings(deps: RevisionDeps, projectId: string): void {
  // One derivation serves every stage: each builds the whole execution plan.
  const work = executionStages(deps, projectId);
  const standings = executionStandings(deps, projectId, work);
  for (const stage of standings) {
    const invocations = work.filter((entry) => entry.kind === stage.kind);
    const current = invocations.reduce((total, entry) => {
      if (entry.state === "done") return total + 1;
      const progress = deps.db
        .prepare("SELECT progress_current,progress_total FROM revision_work WHERE id=?")
        .get(entry.work.workId);
      return total + fraction(progress?.progress_current, progress?.progress_total);
    }, 0);
    const failed = invocations.find((work) => work.state === "failed");
    const failure =
      failed === undefined
        ? null
        : (deps.db
            .prepare("SELECT failure_reason FROM revision_work WHERE id=?")
            .get(failed.work.workId)?.failure_reason ?? null);
    deps.db
      .prepare(
        "UPDATE stages SET state=?,failure_reason=?,progress_current=?,progress_total=?,finished_at=CASE WHEN ?='done' THEN ? ELSE NULL END WHERE project_id=? AND kind=?",
      )
      .run(
        stage.state,
        failure,
        invocations.length === 0 ? null : current,
        invocations.length === 0 ? null : invocations.length,
        stage.state,
        deps.clock.now().toISOString(),
        projectId,
        stage.kind,
      );
  }
  settleScheduleRunsForProject(deps.db, projectId, deps.clock.now().toISOString());
}

// Progress moves one number and nothing else. The stage row already counts this invocation's
// last fraction, from the claim or the previous event, so it takes the difference instead
// of re-deriving the project: that derivation rebuilds every stage's plan and ran to seconds
// on a long article, which froze the process once per downloaded chunk. State changes still
// go through projectStandings.
export function recordWorkProgress(deps: RevisionDeps, event: StageProgressEvent): void {
  if (
    event.workId === undefined ||
    event.revisionId === undefined ||
    !Number.isFinite(event.current) ||
    !Number.isFinite(event.total) ||
    event.total <= 0
  )
    return;
  const before = deps.db
    .prepare(
      "SELECT progress_current,progress_total FROM revision_work WHERE id=? AND revision_id=? AND project_id=? AND kind=? AND state='running'",
    )
    .get(event.workId, event.revisionId, event.projectId, event.stage);
  if (before === undefined) return;
  const current = Math.max(0, Math.min(event.current, event.total));
  deps.db
    .prepare("UPDATE revision_work SET progress_current=?,progress_total=? WHERE id=?")
    .run(current, event.total, event.workId);
  // Work an edit retired keeps running until it notices, but the stage row belongs to the
  // current revision's work and must not move with it.
  const head = currentRevisionId(deps.db, event.projectId);
  if (
    head === undefined ||
    deps.db
      .prepare("SELECT 1 FROM revision_work_reservations WHERE work_id=? AND revision_id=? LIMIT 1")
      .get(event.workId, head) === undefined
  )
    return;
  const delta = current / event.total - fraction(before.progress_current, before.progress_total);
  if (delta === 0) return;
  const moved = deps.db
    .prepare(
      "UPDATE stages SET progress_current=MIN(progress_total,MAX(0,progress_current+?)) WHERE project_id=? AND kind=? AND progress_current IS NOT NULL AND progress_total IS NOT NULL",
    )
    .run(delta, event.projectId, event.stage);
  // A row no derivation has counted yet has nothing to adjust: derive it once.
  if (moved.changes === 0) projectStandings(deps, event.projectId);
}

function fraction(current: unknown, total: unknown): number {
  if (typeof current !== "number" || typeof total !== "number" || total <= 0) return 0;
  return Math.max(0, Math.min(1, current / total));
}
