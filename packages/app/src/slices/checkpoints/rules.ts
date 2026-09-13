import type { StageState } from "../../kernel/pipeline.js";
import type { WorkRef } from "../../kernel/runner/work.js";
import type { WorkRecipe } from "../rebuild/dependencies.js";
import type { ProjectRevision } from "../revisions/model.js";
import { checkpointClosure, checkpointFingerprint } from "./fingerprint.js";
import type { CheckpointDecision, CheckpointRow } from "./model.js";

export function isApprovalCurrent(
  row: CheckpointRow,
  revision: Pick<ProjectRevision, "id" | "projectId">,
  fingerprint: string,
): boolean {
  return (
    row.projectId === revision.projectId &&
    row.revisionId === revision.id &&
    row.fingerprint === fingerprint &&
    row.approvedAt !== null &&
    (row.state === "released" || row.state === "satisfied")
  );
}

export function canChangeCheckpoint(
  stageState: StageState,
  submitted: boolean,
): CheckpointDecision {
  return stageState === "pending" && !submitted
    ? { kind: "eligible" }
    : { kind: "refused", reason: "conflict" };
}

export function checkpointDecision(
  work: WorkRef,
  rows: readonly CheckpointRow[],
  revision: ProjectRevision,
  recipes: readonly WorkRecipe[],
): CheckpointDecision {
  if (work.projectId !== revision.projectId || work.revisionId !== revision.id)
    return { kind: "refused", reason: "conflict" };
  const held = new Set<string>();
  for (const row of rows) {
    if (row.projectId !== revision.projectId || row.revisionId !== revision.id)
      return { kind: "refused", reason: "conflict" };
    const closure = checkpointClosure(row.stage, recipes);
    if (!closure.some((recipe) => recipe.stage === work.kind)) continue;
    if (row.state === "canceled") return { kind: "refused", reason: "conflict" };
    if (!isApprovalCurrent(row, revision, checkpointFingerprint(revision, closure)))
      held.add(row.checkpointId);
  }
  return held.size ? { kind: "held", checkpointIds: [...held].sort() } : { kind: "eligible" };
}
