import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { Clock } from "../../kernel/clock.js";
import { transact } from "../../kernel/db/tx.js";
import { projectExists } from "../admission/repo.js";
import { requestHash } from "../revisions/mutation-request.js";
import { currentRevisionId } from "../revisions/repo.js";

export { type RevisionControlInput, revisionControlSchema } from "./revision-control-schema.js";

import { type RevisionControlInput, revisionControlSchema } from "./revision-control-schema.js";
export type RevisionControlRefusal =
  | "no-project"
  | "revision-required"
  | "conflict"
  | "idempotency-conflict";
interface ControlIdentity extends RevisionControlInput {
  readonly projectId: string;
  readonly operation: "pause" | "cancel";
  readonly hash: string;
}
type ControlCheck<T> =
  | { readonly ok: true; readonly identity: ControlIdentity | null; readonly response?: T }
  | { readonly ok: false; readonly reason: RevisionControlRefusal };
export function checkRevisionControl<T>(
  deps: { readonly db: DatabaseSync; readonly clock: Clock },
  projectId: string,
  operation: ControlIdentity["operation"],
  input: RevisionControlInput | undefined,
  responseSchema: z.ZodType<T>,
): ControlCheck<T> {
  const { db } = deps;
  return transact(db, () => {
    if (!projectExists(db, projectId)) return { ok: false, reason: "no-project" };
    const head = currentRevisionId(db, projectId);
    if (head === undefined) return { ok: true, identity: null };
    const parsed = revisionControlSchema.safeParse(input);
    if (!parsed.success) return { ok: false, reason: "revision-required" };
    const identity: ControlIdentity = {
      ...parsed.data,
      projectId,
      operation,
      hash: requestHash(operation, parsed.data.baseRevisionId, parsed.data),
    };
    const row = db
      .prepare(
        "SELECT operation,request_hash,response_json FROM project_control_receipts WHERE project_id=? AND idempotency_key=?",
      )
      .get(projectId, identity.idempotencyKey);
    if (row !== undefined) {
      if (row.operation !== operation || row.request_hash !== identity.hash)
        return { ok: false, reason: "idempotency-conflict" };
      const response: unknown = JSON.parse(String(row.response_json));
      if (
        z
          .object({ pending: z.literal(true) })
          .strict()
          .safeParse(response).success
      )
        return head === identity.baseRevisionId
          ? { ok: true, identity }
          : { ok: false, reason: "conflict" };
      return { ok: true, identity: null, response: responseSchema.parse(response) };
    }
    if (
      db
        .prepare(
          "SELECT 1 FROM revision_mutations WHERE project_id=? AND idempotency_key=? UNION ALL SELECT 1 FROM rebuild_admissions WHERE project_id=? AND idempotency_key=?",
        )
        .get(projectId, identity.idempotencyKey, projectId, identity.idempotencyKey) !== undefined
    )
      return { ok: false, reason: "idempotency-conflict" };
    if (head !== identity.baseRevisionId) return { ok: false, reason: "conflict" };
    db.prepare(
      "INSERT INTO project_control_receipts(project_id,idempotency_key,operation,request_hash,base_revision_id,response_json,created_at) VALUES (?,?,?,?,?,?,?)",
    ).run(
      identity.projectId,
      identity.idempotencyKey,
      identity.operation,
      identity.hash,
      identity.baseRevisionId,
      JSON.stringify({ pending: true }),
      deps.clock.now().toISOString(),
    );
    return { ok: true, identity };
  });
}

export function rememberRevisionControl(
  deps: { readonly db: DatabaseSync; readonly clock: Clock },
  identity: ControlIdentity | null,
  response: unknown,
): void {
  if (identity === null) return;
  const changed = deps.db
    .prepare(
      "UPDATE project_control_receipts SET response_json=? WHERE project_id=? AND idempotency_key=? AND operation=? AND request_hash=?",
    )
    .run(
      JSON.stringify(response),
      identity.projectId,
      identity.idempotencyKey,
      identity.operation,
      identity.hash,
    );
  if (changed.changes !== 1) throw new Error("The control request lost its receipt.");
}
