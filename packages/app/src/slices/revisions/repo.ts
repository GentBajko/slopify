import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { ProjectAsset, ProjectRevision, RevisionSummary } from "./model.js";
import { projectRevisionSchema } from "./schema.js";

export {
  insertManifestOutput,
  insertManifestPiece,
  outputsForRevision,
  piecesForRevision,
  selectOutputRecord,
  selectPieceRecord,
} from "./manifest-repo.js";

const revisionRow = z.object({
  id: z.string(),
  project_id: z.string(),
  parent_id: z.string().nullable(),
  restored_from_id: z.string().nullable(),
  config: z.string(),
  content: z.string(),
  fingerprints: z.string(),
  created_at: z.string(),
});
const assetRow = z.object({
  id: z.string(),
  project_id: z.string(),
  path: z.string(),
  bytes: z.number().nullable(),
  created_at: z.string(),
});

export function insertRevision(db: DatabaseSync, revision: ProjectRevision): void {
  db.prepare(`INSERT INTO project_revisions
    (id,project_id,parent_id,restored_from_id,config,content,fingerprints,created_at)
    VALUES (?,?,?,?,?,?,?,?)`).run(
    revision.id,
    revision.projectId,
    revision.parentId,
    revision.restoredFromId,
    JSON.stringify(revision.config),
    JSON.stringify(revision.content),
    JSON.stringify(revision.fingerprints),
    revision.createdAt,
  );
}

export function revisionById(
  db: DatabaseSync,
  projectId: string,
  revisionId: string,
): ProjectRevision | undefined {
  const row = db
    .prepare("SELECT * FROM project_revisions WHERE project_id=? AND id=?")
    .get(projectId, revisionId);
  return row === undefined ? undefined : toRevision(row);
}

export function currentRevisionId(db: DatabaseSync, projectId: string): string | undefined {
  const row = db.prepare("SELECT revision_id FROM project_heads WHERE project_id=?").get(projectId);
  return row === undefined
    ? undefined
    : z.object({ revision_id: z.string() }).parse(row).revision_id;
}

export function listRevisionHistory(
  db: DatabaseSync,
  projectId: string,
): readonly RevisionSummary[] {
  const head = currentRevisionId(db, projectId);
  return db
    .prepare("SELECT * FROM project_revisions WHERE project_id=? ORDER BY created_at DESC,id DESC")
    .all(projectId)
    .map((row) => {
      const revision = toRevision(row);
      return {
        id: revision.id,
        parentId: revision.parentId,
        restoredFromId: revision.restoredFromId,
        title: revision.config.title,
        createdAt: revision.createdAt,
        current: revision.id === head,
      };
    });
}

export function insertAsset(db: DatabaseSync, asset: ProjectAsset): void {
  const existing = db
    .prepare("SELECT * FROM project_assets WHERE id=? OR (project_id=? AND path=?)")
    .all(asset.id, asset.projectId, asset.path);
  if (existing.length > 0) {
    const row = assetRow.parse(existing[0]);
    if (
      existing.length !== 1 ||
      row.id !== asset.id ||
      row.project_id !== asset.projectId ||
      row.path !== asset.path ||
      row.bytes !== asset.bytes
    )
      throw new Error("Asset identity conflicts with a registered file.");
    return;
  }
  db.prepare(
    "INSERT INTO project_assets(id,project_id,path,bytes,created_at) VALUES (?,?,?,?,?)",
  ).run(asset.id, asset.projectId, asset.path, asset.bytes, asset.createdAt);
}

function toRevision(value: unknown): ProjectRevision {
  const row = revisionRow.parse(value);
  return projectRevisionSchema.parse({
    id: row.id,
    projectId: row.project_id,
    parentId: row.parent_id,
    restoredFromId: row.restored_from_id,
    config: JSON.parse(row.config),
    content: JSON.parse(row.content),
    fingerprints: JSON.parse(row.fingerprints),
    createdAt: row.created_at,
  });
}
