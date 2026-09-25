import type { Catalogue } from "../../catalog/schema.js";
import { checkpointClosure, checkpointFingerprint } from "../checkpoints/fingerprint.js";
import { saveCheckpointSet } from "../checkpoints/repo.js";
import type { PlayStartResult, ReviewedCheckpoint } from "../play-drafts/model.js";
import type { RevisionDeps } from "../revisions/model.js";
import { currentRevisionId } from "../revisions/repo.js";
import { getRevisionView } from "../revisions/view.js";
import { executionCatalogue, executionPlan } from "./runtime-plan.js";

export function admitReviewedCheckpoints(
  deps: RevisionDeps,
  projectIds: readonly string[],
  reviewed: readonly ReviewedCheckpoint[],
  catalogue: Catalogue,
): NonNullable<PlayStartResult["checkpointSet"]> {
  return projectIds.flatMap((projectId, runIndex) => {
    const gates = reviewed.filter((gate) => gate.runIndex === runIndex);
    if (!gates.length) return [];
    const revisionId = currentRevisionId(deps.db, projectId);
    const view =
      revisionId === undefined ? undefined : getRevisionView(deps, projectId, revisionId);
    if (!view)
      throw new Error(
        "Slopify hit an internal error (the project version to review is missing). Try again; if it happens again, use Download diagnostics in Settings and report it.",
      );
    const plan = executionPlan(deps, view, executionCatalogue(catalogue, view.revision.config));
    const checkpoints = gates.map((gate) => {
      const work = deps.db
        .prepare(
          "SELECT id FROM revision_work WHERE project_id=? AND revision_id=? AND kind=? ORDER BY id LIMIT 1",
        )
        .get(projectId, view.revision.id, gate.stage);
      if (typeof work?.id !== "string")
        throw new Error(
          "Slopify hit an internal error (a review checkpoint has no matching stage). Try again; if it happens again, use Download diagnostics in Settings and report it.",
        );
      return {
        checkpointId: gate.checkpointId,
        stage: gate.stage,
        workId: work.id,
        fingerprint: checkpointFingerprint(
          view.revision,
          checkpointClosure(gate.stage, plan.recipes),
        ),
        state: "held" as const,
      };
    });
    const saved = saveCheckpointSet(deps.db, {
      projectId,
      revisionId: view.revision.id,
      checkpoints,
      createdAt: deps.clock.now().toISOString(),
    });
    if (!saved.ok)
      throw new Error(
        "Slopify hit an internal error (the review checkpoints could not be saved). Try again; if it happens again, use Download diagnostics in Settings and report it.",
      );
    return saved.value.map((row) => {
      const gate = gates.find((gate) => gate.checkpointId === row.checkpointId);
      if (!gate)
        throw new Error(
          "Slopify hit an internal error (a saved review checkpoint could not be matched). Try again; if it happens again, use Download diagnostics in Settings and report it.",
        );
      return { ...row, reviewedFingerprint: gate.fingerprint };
    });
  });
}
