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
