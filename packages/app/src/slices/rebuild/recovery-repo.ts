import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { RevisionDeps, RevisionEdit } from "../revisions/model.js";
import { requestHash } from "../revisions/mutation-request.js";
import { revisionEditSchema } from "../revisions/schema.js";
import {
  type RecoveryRequest,
  type RecoveryResult,
  recoveryResultSchema,
} from "./recovery-model.js";

const rowSchema = z.object({
  request_hash: z.string(),
  base_revision_id: z.string(),
  authority_stamp: z.string(),
  edit_json: z.string().nullable(),
  intent_revision_id: z.string().nullable(),
  response_json: z.string().nullable(),
});
export interface RecoveryRecord {
  readonly pending: true;
  readonly authority: string;
  readonly edit: RevisionEdit | null;
  readonly intentRevisionId: string | null;
}
export function recoveryKey(input: RecoveryRequest, phase: "save" | "admit"): string {
  return `recovery:${input.idempotencyKey}:${phase}`;
}
export function recoveryAuthority(deps: RevisionDeps, projectId: string): string {
  const controls = deps.db
    .prepare(
      "SELECT idempotency_key FROM project_control_receipts WHERE project_id=? ORDER BY rowid",
    )
    .all(projectId);
  const admissions = deps.db
    .prepare("SELECT id FROM rebuild_admissions WHERE project_id=? ORDER BY rowid")
    .all(projectId);
  return requestHash("recovery-authority", projectId, { controls, admissions });
}
export function readRecovery(
  deps: RevisionDeps,
  projectId: string,
  input: RecoveryRequest,
): RecoveryRecord | RecoveryResult | undefined {
  const raw = deps.db
    .prepare("SELECT * FROM project_recovery_requests WHERE project_id=? AND idempotency_key=?")
    .get(projectId, input.idempotencyKey);
  if (raw === undefined) {
    const used = deps.db
      .prepare(
        "SELECT 1 FROM revision_mutations WHERE project_id=? AND idempotency_key=? " +
          "UNION ALL SELECT 1 FROM rebuild_admissions WHERE project_id=? AND idempotency_key=? " +
          "UNION ALL SELECT 1 FROM project_control_receipts WHERE project_id=? AND idempotency_key=?",
      )
      .get(
        projectId,
        input.idempotencyKey,
        projectId,
        input.idempotencyKey,
        projectId,
        input.idempotencyKey,
      );
    return used === undefined ? undefined : { ok: false, reason: "idempotency-conflict" };
  }
  const row = rowSchema.parse(raw);
  if (row.request_hash !== requestHash("direct-recovery", input.baseRevisionId, input.action))
    return { ok: false, reason: "idempotency-conflict" };
  if (row.response_json !== null) return recoveryResultSchema.parse(JSON.parse(row.response_json));
  return {
    pending: true,
    authority: row.authority_stamp,
    intentRevisionId: row.intent_revision_id,
    edit: row.edit_json === null ? null : revisionEditSchema.parse(JSON.parse(row.edit_json)),
  };
}
export function reserveRecovery(
  deps: RevisionDeps,
  projectId: string,
  input: RecoveryRequest,
  edit: RevisionEdit | null,
): RecoveryRecord {
  const authority = recoveryAuthority(deps, projectId);
  deps.db
    .prepare(
      "INSERT INTO project_recovery_requests " +
        "(project_id,idempotency_key,request_hash,base_revision_id,authority_stamp,edit_json) " +
        "VALUES (?,?,?,?,?,?)",
    )
    .run(
      projectId,
      input.idempotencyKey,
      requestHash("direct-recovery", input.baseRevisionId, input.action),
      input.baseRevisionId,
      authority,
      edit === null ? null : JSON.stringify(edit),
    );
  return { pending: true, authority, edit, intentRevisionId: null };
}
export function rememberRecovery(
  deps: RevisionDeps,
  projectId: string,
  input: RecoveryRequest,
  result: RecoveryResult,
): RecoveryResult {
  const response = recoveryResultSchema.parse(result);
  deps.db
    .prepare(
      "UPDATE project_recovery_requests SET response_json=? WHERE project_id=? AND idempotency_key=?",
    )
    .run(JSON.stringify(response), projectId, input.idempotencyKey);
  return response;
}
// The head has unfinished stages but nothing that will move them on its own: no call in
// flight and no admitted, dispatchable work. A saved rerun or edit is admitted by no one
// until Resume, and work held by a pause, a restart or a failed sibling of its admission
// never starts, yet none of these shows as paused or failed. A queued batch item waits for
// its turn instead.
export function resumable(db: DatabaseSync, projectId: string): boolean {
  return (
    db
      .prepare(
        "SELECT 1 FROM project_heads h WHERE h.project_id=? " +
          "AND EXISTS(SELECT 1 FROM stages s WHERE s.project_id=h.project_id " +
          "AND s.state NOT IN ('done','provided','skipped')) " +
          "AND NOT EXISTS(SELECT 1 FROM stages s WHERE s.project_id=h.project_id AND s.state='running') " +
          "AND NOT EXISTS(SELECT 1 FROM project_queue q WHERE q.project_id=h.project_id AND q.state='queued') " +
          "AND NOT EXISTS(SELECT 1 FROM revision_work w WHERE w.project_id=h.project_id AND w.state='running') " +
          "AND NOT EXISTS(SELECT 1 FROM revision_work w " +
          "JOIN revision_work_reservations r ON r.work_id=w.id AND r.revision_id=h.revision_id " +
          "WHERE w.state='pending' AND w.dispatch_state='allowed' AND NOT EXISTS(" +
          "SELECT 1 FROM revision_work f WHERE f.admission_id=w.admission_id " +
          "AND f.state IN ('failed','canceled')))",
      )
      .get(projectId) !== undefined
  );
}
