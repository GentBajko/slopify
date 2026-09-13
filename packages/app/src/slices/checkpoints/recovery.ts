import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { transact } from "../../kernel/db/tx.js";
import type { WorkRef } from "../../kernel/runner/work.js";
import { workExists } from "../../kernel/runner/work-authority.js";
import { recoverWork } from "../rebuild/repo.js";
import type { ProjectRevision, RevisionDeps } from "../revisions/model.js";
import { currentRevisionId, revisionById } from "../revisions/repo.js";
import { refreshCheckpointGate, resolvedGate } from "./change.js";
import type { CheckpointDecision } from "./model.js";
import { listCheckpoints } from "./repo.js";
import { isApprovalCurrent } from "./rules.js";

export function checkpointDecisionForWork(deps: RevisionDeps, work: WorkRef): CheckpointDecision {
  if (!workExists(deps.db, work)) return { kind: "refused", reason: "not-found" };
  const head = currentRevisionId(deps.db, work.projectId);
  const revision = head === undefined ? undefined : revisionById(deps.db, work.projectId, head);
  if (!revision) return { kind: "refused", reason: "not-found" };
  const rows = listCheckpoints(deps.db, work.projectId, revision.id);
  const held: string[] = [];
  for (const row of rows) {
    const gate = refreshCheckpointGate(deps, row);
    if (!gate) return { kind: "refused", reason: "conflict" };
    if (gate.stage !== work.kind && !gate.dependents.includes(work.kind)) continue;
    const owned = deps.db
      .prepare(
        "SELECT 1 FROM revision_work_reservations WHERE project_id=? AND revision_id=? AND work_id=?",
      )
      .get(work.projectId, revision.id, work.workId);
    if (!owned || gate.state === "canceled") return { kind: "refused", reason: "conflict" };
    if (!isApprovalCurrent(gate, revision, gate.currentFingerprint)) held.push(gate.checkpointId);
  }
  return held.length ? { kind: "held", checkpointIds: held.sort() } : { kind: "eligible" };
}

export function carryCheckpointGates(
  deps: RevisionDeps,
  baseRevisionId: string,
  revision: ProjectRevision,
): void {
  for (const gate of listCheckpoints(deps.db, revision.projectId, baseRevisionId)) {
    const stored = deps.db
      .prepare("SELECT stage_id,recipe_context FROM revision_work WHERE id=?")
      .get(gate.workId);
    if (!stored || typeof stored.recipe_context !== "string")
      throw new Error("Checkpoint snapshot is missing");
    const anchor = deps.ids.next();
    deps.db
      .prepare(`INSERT INTO revision_work(id,project_id,revision_id,stage_id,kind,fingerprint,state,dispatch_state,recipe_context,created_at)
      VALUES (?,?,?,?,?,?,'done','held',?,?)`)
      .run(
        anchor,
        revision.projectId,
        revision.id,
        z.string().parse(stored.stage_id),
        gate.stage,
        gate.fingerprint,
        stored.recipe_context,
        revision.createdAt,
      );
    const next = {
      ...gate,
      revisionId: revision.id,
      workId: anchor,
      createdAt: revision.createdAt,
    };
    const resolved = resolvedGate(deps, next);
    if (!resolved) throw new Error("Checkpoint inputs could not be resolved");
    const same = gate.fingerprint === resolved.currentFingerprint;
    if (!same)
      deps.db
        .prepare(
          "UPDATE review_checkpoints SET state='invalidated',approved_at=NULL WHERE project_id=? AND revision_id=? AND checkpoint_id=?",
        )
        .run(gate.projectId, gate.revisionId, gate.checkpointId);
    deps.db
      .prepare(`INSERT INTO review_checkpoints(project_id,revision_id,checkpoint_id,stage,work_id,fingerprint,state,created_at,approved_at)
      VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(
        revision.projectId,
        revision.id,
        gate.checkpointId,
        gate.stage,
        anchor,
        resolved.currentFingerprint,
        same ? gate.state : "held",
        revision.createdAt,
        same ? gate.approvedAt : null,
      );
  }
}

export function recoverCheckpointWork(db: DatabaseSync): void {
  transact(db, () => {
    const retained = db
      .prepare(`SELECT DISTINCT w.id FROM revision_work w
      JOIN revision_work_reservations r ON r.work_id=w.id
      JOIN project_heads h ON h.project_id=r.project_id AND h.revision_id=r.revision_id
      JOIN review_checkpoints c ON c.project_id=w.project_id AND c.revision_id=w.revision_id
      WHERE w.state='pending' AND w.dispatch_state='allowed'
      AND c.state IN ('held','pending-review','released')
      AND (w.kind=c.stage OR w.kind='video')
      AND NOT EXISTS (SELECT 1 FROM stages s WHERE s.project_id=w.project_id AND s.state='canceled')
      AND NOT EXISTS (SELECT 1 FROM revision_work_pieces p WHERE p.work_id=w.id
        AND (p.submitted_at IS NOT NULL OR p.continuation IS NOT NULL OR p.state IN ('running','done')))`)
      .all()
      .map((row) => z.string().parse(row.id));
    recoverWork(db);
    for (const id of retained) {
      db.prepare(
        "UPDATE revision_work SET dispatch_state='allowed' WHERE id=? AND state='pending'",
      ).run(id);
      db.prepare(
        "UPDATE revision_work_pieces SET state='pending',dispatch_state='allowed' WHERE work_id=? AND submitted_at IS NULL AND continuation IS NULL",
      ).run(id);
    }
  });
}
