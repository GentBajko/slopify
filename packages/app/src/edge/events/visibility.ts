import type { DatabaseSync } from "node:sqlite";
import type { EventOrigin, ProjectEvent } from "../../kernel/events.js";
import { currentRevisionId } from "../../slices/revisions/repo.js";

export function currentWorkOrigin(
  db: DatabaseSync,
  projectId: string,
  origin: EventOrigin,
): boolean {
  if (currentRevisionId(db, projectId) === undefined)
    return origin.revisionId === undefined && origin.workId === undefined;
  if (origin.revisionId === undefined || origin.workId === undefined) return false;
  return (
    db
      .prepare(`
    SELECT 1 FROM revision_work w
    JOIN revision_work_reservations r ON r.work_id=w.id AND r.project_id=w.project_id
    JOIN project_heads h ON h.project_id=r.project_id AND h.revision_id=r.revision_id
    JOIN project_revisions v ON v.id=r.revision_id
    JOIN json_each(v.fingerprints) f ON f.key=COALESCE(r.logical_key,r.work_key)
      AND f.value=COALESCE(r.desired_fingerprint,r.fingerprint)
    LEFT JOIN revision_work_pieces p ON p.id=r.piece_id AND p.work_id=w.id
    WHERE w.project_id=? AND w.revision_id=? AND w.id=?
      AND (? IS NULL OR r.piece_id=?)
      AND (r.piece_id IS NULL OR (p.work_key=r.work_key AND p.fingerprint=r.fingerprint))
  `)
      .get(
        projectId,
        origin.revisionId,
        origin.workId,
        origin.workPieceId ?? null,
        origin.workPieceId ?? null,
      ) !== undefined
  );
}

export function currentProjectEvent(db: DatabaseSync, event: ProjectEvent): boolean {
  if (event.type === "project.updated") return true;
  if (
    event.type === "project.state" &&
    event.revisionId === undefined &&
    event.workId === undefined
  )
    return true;
  const head = currentRevisionId(db, event.projectId);
  if (head !== event.revisionId) return false;
  return currentWorkOrigin(db, event.projectId, event);
}
