import { createHash } from "node:crypto";
import { z } from "zod";
import type { RevisionDeps, RevisionMutationResult, RevisionView } from "./model.js";
import { currentRevisionId } from "./repo.js";
import { getRevisionView } from "./view.js";

export interface MutationIdentity {
  readonly projectId: string;
  readonly baseRevisionId: string;
  readonly idempotencyKey: string;
  readonly operation: "save" | "restore";
  readonly hash: string;
}
export function requestHash(operation: string, baseRevisionId: string, input: unknown): string {
  return createHash("sha256")
    .update(
      JSON.stringify(
        [operation, baseRevisionId, input],
        (_key: string, value: unknown): unknown => {
          if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
          return Object.fromEntries(
            Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
          );
        },
      ),
    )
    .digest("hex");
}
export function refusal(
  deps: RevisionDeps,
  projectId: string,
  reason: Extract<RevisionMutationResult, { ok: false }>["reason"],
): RevisionMutationResult {
  return { ok: false, reason, currentRevisionId: currentRevisionId(deps.db, projectId) ?? null };
}
export function checkMutation(
  deps: RevisionDeps,
  input: MutationIdentity,
): RevisionMutationResult | undefined {
  const { db } = deps;
  const row = db
    .prepare(
      "SELECT operation,request_hash,result_revision_id FROM revision_mutations WHERE project_id=? AND idempotency_key=?",
    )
    .get(input.projectId, input.idempotencyKey);
  if (row !== undefined) {
    const receipt = z
      .object({ operation: z.string(), request_hash: z.string(), result_revision_id: z.string() })
      .parse(row);
    if (receipt.operation !== input.operation || receipt.request_hash !== input.hash)
      return refusal(deps, input.projectId, "idempotency-conflict");
    return {
      ok: true,
      view: requiredView(deps, input.projectId, receipt.result_revision_id),
      duplicate: true,
    };
  }
  if (
    db
      .prepare("SELECT 1 FROM rebuild_admissions WHERE project_id=? AND idempotency_key=?")
      .get(input.projectId, input.idempotencyKey) !== undefined
  )
    return refusal(deps, input.projectId, "idempotency-conflict");
  if (
    db
      .prepare("SELECT 1 FROM project_control_receipts WHERE project_id=? AND idempotency_key=?")
      .get(input.projectId, input.idempotencyKey) !== undefined
  )
    return refusal(deps, input.projectId, "idempotency-conflict");
  if (db.prepare("SELECT 1 FROM projects WHERE id=?").get(input.projectId) === undefined)
    return refusal(deps, input.projectId, "no-project");
  if (currentRevisionId(db, input.projectId) !== input.baseRevisionId)
    return refusal(deps, input.projectId, "conflict");
  return undefined;
}
export function requiredView(
  deps: RevisionDeps,
  projectId: string,
  revisionId: string,
): RevisionView {
  const view = getRevisionView(deps, projectId, revisionId);
  if (view === undefined) throw new Error("The retained revision was not found.");
  return view;
}
export function insertReceipt(
  deps: RevisionDeps,
  input: MutationIdentity,
  revisionId: string,
): void {
  deps.db
    .prepare(
      "INSERT INTO revision_mutations(project_id,idempotency_key,operation,request_hash,base_revision_id,result_revision_id,created_at) VALUES (?,?,?,?,?,?,?)",
    )
    .run(
      input.projectId,
      input.idempotencyKey,
      input.operation,
      input.hash,
      input.baseRevisionId,
      revisionId,
      deps.clock.now().toISOString(),
    );
}
