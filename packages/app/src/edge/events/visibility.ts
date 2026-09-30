import type { DatabaseSync } from "node:sqlite";
import type { EventOrigin, ProjectEvent } from "../../kernel/events.js";
import { currentRevisionId } from "../../slices/revisions/repo.js";

// Whether the work an event came from is the current revision's: made for it, or carried to it
// from an older revision by an edit that left it unchanged (a video still rendering after a
// thumbnail redo is still the project's video).
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
    WHERE w.project_id=? AND w.id=?
      AND (? IS NULL OR r.piece_id=?)
      AND (r.piece_id IS NULL OR (p.work_key=r.work_key AND p.fingerprint=r.fingerprint))
  `)
      .get(projectId, origin.workId, origin.workPieceId ?? null, origin.workPieceId ?? null) !==
    undefined
  );
}

// The event as the project's pages should see it, or undefined for one they must not: work the
// current revision no longer wants. Carried work is told under the current revision, since
// that is the revision the pages show.
export function currentEvent(db: DatabaseSync, event: ProjectEvent): ProjectEvent | undefined {
  if (event.type === "project.updated") return event;
  if (
    event.type === "project.state" &&
    event.revisionId === undefined &&
    event.workId === undefined
  )
    return event;
  const head = currentRevisionId(db, event.projectId);
  if (head === undefined) return currentWorkOrigin(db, event.projectId, event) ? event : undefined;
  if (!currentWorkOrigin(db, event.projectId, event)) return undefined;
  return event.revisionId === head ? event : { ...event, revisionId: head };
}

export function currentProjectEvent(db: DatabaseSync, event: ProjectEvent): boolean {
  return currentEvent(db, event) !== undefined;
}

// `currentEvent` for the hub. The streamed text (a token at a time) asks the same question many
// times a second, so its answer is kept for a second per piece of work.
export function eventPresenter(
  db: DatabaseSync,
  now: () => number = Date.now,
): (event: ProjectEvent) => ProjectEvent | undefined {
  const seen = new Map<
    string,
    { readonly at: number; readonly shown: boolean; readonly revisionId: string | undefined }
  >();
  return (event) => {
    if (event.type !== "llm.preview" && event.type !== "article.delta")
      return currentEvent(db, event);
    const key = [event.projectId, event.revisionId, event.workId, event.workPieceId].join("|");
    const hit = seen.get(key);
    if (hit !== undefined && now() - hit.at < 1000)
      return !hit.shown
        ? undefined
        : hit.revisionId === undefined || hit.revisionId === event.revisionId
          ? event
          : { ...event, revisionId: hit.revisionId };
    const shown = currentEvent(db, event);
    if (seen.size > 512) seen.clear();
    seen.set(key, { at: now(), shown: shown !== undefined, revisionId: shown?.revisionId });
    return shown;
  };
}
