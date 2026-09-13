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
    if (!view) throw new Error("Checkpoint admission has no retained revision");
    const plan = executionPlan(deps, view, executionCatalogue(catalogue, view.revision.config));
    const checkpoints = gates.map((gate) => {
      const work = deps.db
        .prepare(
          "SELECT id FROM revision_work WHERE project_id=? AND revision_id=? AND kind=? ORDER BY id LIMIT 1",
        )
        .get(projectId, view.revision.id, gate.stage);
      if (typeof work?.id !== "string") throw new Error("Checkpoint admission has no stage work");
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
    if (!saved.ok) throw new Error("Checkpoint admission could not persist reviewed gates");
    return saved.value.map((row) => {
      const gate = gates.find((gate) => gate.checkpointId === row.checkpointId);
      if (!gate) throw new Error("Checkpoint admission lost its reviewed identity");
      return { ...row, reviewedFingerprint: gate.fingerprint };
    });
  });
}
