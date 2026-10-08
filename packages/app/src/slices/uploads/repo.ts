import type { DatabaseSync } from "node:sqlite";

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

// Uploaded projects with nothing admitted still to run: their leftover steps (a placeholder
// from an edit after the upload, a pause from a bulk Pause) are not work the person is
// waiting for, so the listing calls them done rather than "Paused" or "Waiting".
export function uploadedAndSettled(db: DatabaseSync): ReadonlySet<string> {
  return new Set(
    db
      .prepare(
        `SELECT u.project_id FROM project_uploads u WHERE NOT EXISTS(
           SELECT 1 FROM revision_work w WHERE w.project_id=u.project_id
             AND w.state IN ('pending','running') AND w.dispatch_state!='held')`,
      )
      .all()
      .map((row) => String(row.project_id)),
  );
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
