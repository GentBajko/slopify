import { projectPaused } from "../admission/repo.js";
import type { RecoveryResult } from "./recovery-model.js";
import type { RebuildDeps } from "./service.js";

// Active: an invocation in flight, admitted work that can still start, or a provider job
// the head can still retrieve. Work behind a pause or a failed/canceled sibling of its
// admission never starts, and leftovers of superseded revisions never run; counting either
// would refuse every later rerun of the section. An accepted job nothing will collect is
// reported apart: waiting or pausing cannot clear it, only Retry or Resume can.
export type ActiveConflict = "running" | "accepted-job";
export function activeConflict(
  deps: RebuildDeps,
  projectId: string,
  keys: readonly string[],
): ActiveConflict | undefined {
  const rows = deps.db
    .prepare(
      "SELECT work_key,logical_key,live FROM (SELECT p.work_key,r.logical_key," +
        "(w.state='running' OR (? AND w.state='pending' AND w.dispatch_state='allowed' AND NOT EXISTS(" +
        "SELECT 1 FROM revision_work f WHERE f.admission_id=w.admission_id " +
        "AND f.state IN ('failed','canceled')))) AS live," +
        "(w.state='pending' AND p.state!='done' AND p.continuation IS NOT NULL AND " +
        "r.revision_id=(SELECT revision_id FROM project_heads WHERE project_id=w.project_id)) AS accepted " +
        "FROM revision_work w JOIN revision_work_pieces p ON p.work_id=w.id " +
        "LEFT JOIN revision_work_reservations r ON r.work_id=w.id AND r.piece_id=p.id " +
        "WHERE w.project_id=?) WHERE live OR accepted",
    )
    .all(projectPaused(deps.db, projectId) ? 0 : 1, projectId)
    .filter((row) =>
      keys.some(
        (key) =>
          row.work_key === key ||
          row.logical_key === key ||
          (key.endsWith(":future") && String(row.work_key).startsWith(key.slice(0, -6))),
      ),
    );
  if (rows.length === 0) return undefined;
  return rows.some((row) => Number(row.live) === 1) ? "running" : "accepted-job";
}
export const acceptedJobMessage =
  "An accepted provider job for this section is waiting to be collected. Use Retry stage or Resume, then rerun.";
export function conflictRefusal(conflict: ActiveConflict): RecoveryResult {
  return conflict === "running"
    ? { ok: false, reason: "running" }
    : {
        ok: false,
        reason: "accepted-job",
        fields: [{ field: "stage", message: acceptedJobMessage }],
      };
}
