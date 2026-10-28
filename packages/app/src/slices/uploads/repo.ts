import type { DatabaseSync } from "node:sqlite";
import { admittedUnfinished } from "../admission/admitted-work.js";
import { liveProject, oneProject } from "../admission/repo.js";

// "Mark uploaded": the person's own note that a finished video is on YouTube. Slopify never
// uploads, so this is the only way it learns; Home's Ready to upload leaves such a project out.

export type UploadMarkResult =
  | { readonly ok: true; readonly uploadedAt: string | null }
  | { readonly ok: false; readonly reason: "not-found" };

export function markUploaded(
  db: DatabaseSync,
  projectId: string,
  uploaded: boolean,
  at: string,
): UploadMarkResult {
  if (db.prepare("SELECT 1 FROM projects WHERE id=?").get(projectId) === undefined)
    return { ok: false, reason: "not-found" };
  if (!uploaded) {
    db.prepare("DELETE FROM project_uploads WHERE project_id=?").run(projectId);
    return { ok: true, uploadedAt: null };
  }
  // Marking twice keeps the first time: it is when the video went up.
  db.prepare(
    "INSERT INTO project_uploads(project_id,uploaded_at) VALUES (?,?) ON CONFLICT(project_id) DO NOTHING",
  ).run(projectId, at);
  const row = db
    .prepare("SELECT uploaded_at FROM project_uploads WHERE project_id=?")
    .get(projectId);
  return { ok: true, uploadedAt: typeof row?.uploaded_at === "string" ? row.uploaded_at : at };
}

export function uploadedProjects(db: DatabaseSync): ReadonlyMap<string, string> {
  return new Map(
    db
      .prepare("SELECT project_id, uploaded_at FROM project_uploads")
      .all()
      .map((row) => [String(row.project_id), String(row.uploaded_at)] as const),
  );
}

// Uploaded projects with nothing left to run read done, not "Paused" or "Waiting": a step still
// allowed to run, or a held one admitted for the current version (`admittedUnfinished`, as
// `reviews/holds.ts` heldBesideReviews reads it), keeps one unsettled. What is left otherwise
// - a placeholder from an edit after the upload, a pause from a bulk Pause - is not work the
// person waits for. One project's alone when `projectId` is given.
export function uploadedAndSettled(db: DatabaseSync, projectId?: string): ReadonlySet<string> {
  const one = oneProject("u", projectId);
  return new Set(
    db
      .prepare(
        `SELECT u.project_id FROM project_uploads u WHERE NOT EXISTS(
           SELECT 1 FROM revision_work w WHERE w.project_id=u.project_id
             AND w.state IN ('pending','running')
             AND (w.dispatch_state!='held' OR ${admittedUnfinished("w")}))${one.sql}`,
      )
      .all(...one.params)
      .map((row) => String(row.project_id)),
  );
}

// A finished project an edit left with outdated files reads done too, not "Stopped": every step
// still to run made its files before the edit (a selected output of the current version, now
// outdated), and nothing runs it until the person chooses to make those files again, which shows
// the cost first. Renaming a project with a PDF is one: its PDF prints the title. A step that
// never made a file, a failed or canceled step, a step a run admitted (`admittedUnfinished`, as
// a restart holds it), a pause or a queued run keep it unsettled, so a run a restart stopped
// still reads Stopped. One project's alone when `projectId` is given.
export function editedAndSettled(db: DatabaseSync, projectId?: string): ReadonlySet<string> {
  const one = oneProject("h", projectId);
  const unfinished = "s.project_id=h.project_id AND s.state NOT IN ('done','provided','skipped')";
  return new Set(
    db
      .prepare(
        `SELECT h.project_id FROM project_heads h
         WHERE ${liveProject("h", "project_id")}
           AND EXISTS(SELECT 1 FROM stages s WHERE ${unfinished})
           AND NOT EXISTS(SELECT 1 FROM stages s WHERE ${unfinished}
             AND (s.state!='pending' OR NOT EXISTS(SELECT 1 FROM revision_outputs o
               WHERE o.project_id=h.project_id AND o.revision_id=h.revision_id AND o.selected=1
                 AND o.state='outdated' AND json_extract(o.descriptor,'$.stageKind')=s.kind)))
           AND NOT EXISTS(SELECT 1 FROM revision_work w WHERE w.project_id=h.project_id
             AND w.state IN ('pending','running')
             AND (w.dispatch_state!='held' OR ${admittedUnfinished("w")}))
           AND NOT EXISTS(SELECT 1 FROM project_controls c WHERE c.project_id=h.project_id AND c.paused=1)
           AND NOT EXISTS(SELECT 1 FROM project_queue q WHERE q.project_id=h.project_id AND q.state='queued')${one.sql}`,
      )
      .all(...one.params)
      .map((row) => String(row.project_id)),
  );
}

// Every project that reads done though a step is left: uploaded with nothing left to run
// (`uploadedAndSettled`), or finished and left only with files an edit made outdated
// (`editedAndSettled`).
export function settledProjects(db: DatabaseSync, projectId?: string): ReadonlySet<string> {
  return new Set([...uploadedAndSettled(db, projectId), ...editedAndSettled(db, projectId)]);
}

// "Keep as is": a waiting run the person leaves as it is, until the project's next edit. Set on
// the current head revision; the listing counts it only while that revision is still the head.
export function setAside(
  db: DatabaseSync,
  projectId: string,
  aside: boolean,
  at: string,
): { readonly ok: true } | { readonly ok: false; readonly reason: "not-found" } {
  const head = db
    .prepare("SELECT revision_id FROM project_heads WHERE project_id=?")
    .get(projectId);
  if (head === undefined) return { ok: false, reason: "not-found" };
  if (!aside) db.prepare("DELETE FROM project_set_aside WHERE project_id=?").run(projectId);
  else
    db.prepare(
      "INSERT INTO project_set_aside(project_id,revision_id,set_at) VALUES (?,?,?) ON CONFLICT(project_id) DO UPDATE SET revision_id=excluded.revision_id,set_at=excluded.set_at",
    ).run(projectId, String(head.revision_id), at);
  return { ok: true };
}

export function setAsideProjects(db: DatabaseSync): ReadonlySet<string> {
  return new Set(
    db
      .prepare(
        `SELECT s.project_id FROM project_set_aside s
         JOIN project_heads h ON h.project_id=s.project_id AND h.revision_id=s.revision_id`,
      )
      .all()
      .map((row) => String(row.project_id)),
  );
}
