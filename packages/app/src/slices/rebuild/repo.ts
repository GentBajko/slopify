import type { DatabaseSync } from "node:sqlite";
import { transact } from "../../kernel/db/tx.js";
import type { PublicationRef } from "../../kernel/runner/work.js";
import { workExists } from "../../kernel/runner/work-authority.js";
import type { RevisionDeps } from "../revisions/model.js";
import { currentRevisionId, revisionById } from "../revisions/repo.js";
import { type RebuildPreview, rebuildPreviewSchema } from "./model.js";

export { claimWork, finishWork, maySubmit } from "../../kernel/runner/work-authority.js";
export { transitionRevisionWork } from "./transition-repo.js";
export interface PublicationTarget {
  readonly revisionId: string;
  readonly current: boolean;
  readonly selected: boolean;
}
export function publicationTargets(
  db: DatabaseSync,
  publication: PublicationRef,
  workKey: string,
  workFingerprint: string,
): readonly PublicationTarget[] {
  const { work, pieceId, publicationId } = publication;
  if (publicationId !== (pieceId ?? work.workId))
    throw new Error("Publication identity does not match its durable work.");
  if (!workExists(db, work)) return [];
  if (pieceId !== null) {
    const piece = db
      .prepare("SELECT work_key,fingerprint FROM revision_work_pieces WHERE id=? AND work_id=?")
      .get(pieceId, work.workId);
    if (piece === undefined) throw new Error("Publication piece does not belong to its work.");
    if (piece.work_key !== workKey || piece.fingerprint !== workFingerprint)
      throw new Error("Publication authority does not match its durable piece.");
  }
  const currentId = currentRevisionId(db, work.projectId);
  const owns = (revisionId: string): boolean => {
    const reservation = db
      .prepare(
        "SELECT logical_key,desired_fingerprint FROM revision_work_reservations WHERE project_id=? AND revision_id=? AND work_key=? AND work_id=? AND fingerprint=? AND piece_id IS ?",
      )
      .get(work.projectId, revisionId, workKey, work.workId, workFingerprint, pieceId);
    if (reservation === undefined) return false;
    const logicalKey =
      typeof reservation.logical_key === "string" ? reservation.logical_key : workKey;
    const desired =
      typeof reservation.desired_fingerprint === "string"
        ? reservation.desired_fingerprint
        : workFingerprint;
    return revisionById(db, work.projectId, revisionId)?.fingerprints[logicalKey] === desired;
  };
  const targets: PublicationTarget[] = [
    {
      revisionId: work.revisionId,
      current: currentId === work.revisionId,
      selected: owns(work.revisionId),
    },
  ];
  if (currentId !== undefined && currentId !== work.revisionId && owns(currentId))
    targets.push({ revisionId: currentId, current: true, selected: true });
  return targets;
}
export function storePreview(deps: RevisionDeps, preview: RebuildPreview): void {
  const parsed = rebuildPreviewSchema.parse(preview);
  deps.db
    .prepare(
      "INSERT INTO rebuild_previews(id,project_id,revision_id,plan_fingerprint,body_json,created_at) VALUES (?,?,?,?,?,?)",
    )
    .run(
      parsed.id,
      parsed.projectId,
      parsed.baseRevisionId,
      parsed.planFingerprint,
      JSON.stringify(parsed),
      deps.clock.now().toISOString(),
    );
}
export function previewById(
  db: DatabaseSync,
  projectId: string,
  previewId: string,
): RebuildPreview | undefined {
  const row = db
    .prepare("SELECT body_json FROM rebuild_previews WHERE id=? AND project_id=?")
    .get(previewId, projectId);
  return row === undefined
    ? undefined
    : rebuildPreviewSchema.parse(JSON.parse(String(row.body_json)));
}
export function recoverWork(db: DatabaseSync): void {
  transact(db, () =>
    db.exec(`UPDATE revision_work_pieces SET state='held',dispatch_state='held' WHERE state!='done' AND work_id IN (SELECT id FROM revision_work WHERE project_id NOT IN (SELECT project_id FROM project_queue WHERE state='queued'));
 UPDATE revision_work SET state='pending',dispatch_state='held' WHERE state!='done' AND project_id NOT IN (SELECT project_id FROM project_queue WHERE state='queued');`),
  );
}
