import type { DatabaseSync } from "node:sqlite";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { transact } from "../../kernel/db/tx.js";
import { stageKinds } from "../../kernel/pipeline.js";
import { outputSchema } from "../storage/schema.js";
import type {
  ManifestOutput,
  ManifestPiece,
  ProjectRevision,
  RevisionOutputRecord,
  RevisionPieceRecord,
} from "./model.js";
import { stagePieceSchema } from "./schema.js";

const selected = z.union([z.literal(0), z.literal(1)]).transform((value) => value === 1);
const commonRow = z.object({
  id: z.string(),
  asset_id: z.string().nullable(),
  fingerprint: z.string(),
  descriptor: z.string(),
  publication_id: z.string().nullable(),
  selected,
});
const outputRow = commonRow.extend({
  slot: z.string(),
  work_key: z.string(),
  asset_id: z.string(),
  state: z.enum(["ready", "outdated", "review"]),
});
const pieceRow = commonRow.extend({ piece_key: z.string(), stage_kind: z.enum(stageKinds) });

export function insertManifestOutput(
  db: DatabaseSync,
  revision: ProjectRevision,
  output: ManifestOutput,
  recordId: string,
  publicationId: string | null = null,
): void {
  if (publicationId !== null) {
    const row = db
      .prepare(
        "SELECT * FROM revision_outputs WHERE project_id=? AND revision_id=? AND publication_id=? AND slot=?",
      )
      .get(revision.projectId, revision.id, publicationId, output.slot);
    if (row !== undefined) {
      const previous = toOutput(row);
      if (
        !isDeepStrictEqual(previous, {
          ...output,
          output: outputSchema.parse(JSON.parse(JSON.stringify(output.output))),
          recordId: previous.recordId,
          publicationId,
          selected: previous.selected,
        })
      )
        throw new Error("Output publication conflicts with its retained result.");
      return;
    }
  }
  db.prepare(`INSERT INTO revision_outputs
    (id,project_id,revision_id,slot,work_key,asset_id,fingerprint,state,descriptor,publication_id,selected,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,0,?)`).run(
    recordId,
    revision.projectId,
    revision.id,
    output.slot,
    output.workKey,
    output.assetId,
    output.fingerprint,
    output.state,
    JSON.stringify(output.output),
    publicationId,
    revision.createdAt,
  );
}

export function insertManifestPiece(
  db: DatabaseSync,
  revision: ProjectRevision,
  piece: ManifestPiece,
  recordId: string,
  publicationId: string | null = null,
): void {
  if (publicationId !== null) {
    const row = db
      .prepare(
        "SELECT * FROM revision_pieces WHERE project_id=? AND revision_id=? AND publication_id=? AND piece_key=?",
      )
      .get(revision.projectId, revision.id, publicationId, piece.key);
    if (row !== undefined) {
      const previous = toPiece(row);
      if (
        !isDeepStrictEqual(previous, {
          ...piece,
          piece: stagePieceSchema.parse(JSON.parse(JSON.stringify(piece.piece))),
          recordId: previous.recordId,
          publicationId,
          selected: previous.selected,
        })
      )
        throw new Error("Piece publication conflicts with its retained result.");
      return;
    }
  }
  db.prepare(`INSERT INTO revision_pieces
    (id,project_id,revision_id,piece_key,stage_kind,asset_id,fingerprint,descriptor,publication_id,selected,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,0,?)`).run(
    recordId,
    revision.projectId,
    revision.id,
    piece.key,
    piece.stageKind,
    piece.assetId,
    piece.fingerprint,
    JSON.stringify(piece.piece),
    publicationId,
    revision.createdAt,
  );
}

export function outputsForRevision(
  db: DatabaseSync,
  projectId: string,
  revisionId: string,
): readonly RevisionOutputRecord[] {
  return db
    .prepare(
      "SELECT * FROM revision_outputs WHERE project_id=? AND revision_id=? ORDER BY created_at,id",
    )
    .all(projectId, revisionId)
    .map(toOutput);
}

export function piecesForRevision(
  db: DatabaseSync,
  projectId: string,
  revisionId: string,
): readonly RevisionPieceRecord[] {
  return db
    .prepare(
      "SELECT * FROM revision_pieces WHERE project_id=? AND revision_id=? ORDER BY created_at,id",
    )
    .all(projectId, revisionId)
    .map(toPiece);
}

export function selectOutputRecord(
  db: DatabaseSync,
  revisionId: string,
  slot: string,
  recordId: string,
): void {
  transact(db, () => {
    db.prepare(
      "UPDATE revision_outputs SET selected=0 WHERE revision_id=? AND slot=? AND selected=1",
    ).run(revisionId, slot);
    const result = db
      .prepare("UPDATE revision_outputs SET selected=1 WHERE id=? AND revision_id=? AND slot=?")
      .run(recordId, revisionId, slot);
    if (Number(result.changes) !== 1) throw new Error("Published output record was not found.");
  });
}

export function selectPieceRecord(
  db: DatabaseSync,
  revisionId: string,
  key: string,
  recordId: string,
): void {
  transact(db, () => {
    db.prepare(
      "UPDATE revision_pieces SET selected=0 WHERE revision_id=? AND piece_key=? AND selected=1",
    ).run(revisionId, key);
    const result = db
      .prepare("UPDATE revision_pieces SET selected=1 WHERE id=? AND revision_id=? AND piece_key=?")
      .run(recordId, revisionId, key);
    if (Number(result.changes) !== 1) throw new Error("Published piece record was not found.");
  });
}

function toOutput(value: unknown): RevisionOutputRecord {
  const row = outputRow.parse(value);
  return {
    recordId: row.id,
    publicationId: row.publication_id,
    selected: row.selected,
    slot: row.slot,
    workKey: row.work_key,
    assetId: row.asset_id,
    output: outputSchema.parse(JSON.parse(row.descriptor)),
    fingerprint: row.fingerprint,
    state: row.state,
  };
}

function toPiece(value: unknown): RevisionPieceRecord {
  const row = pieceRow.parse(value);
  return {
    recordId: row.id,
    publicationId: row.publication_id,
    selected: row.selected,
    key: row.piece_key,
    stageKind: row.stage_kind,
    piece: stagePieceSchema.parse(JSON.parse(row.descriptor)),
    assetId: row.asset_id,
    fingerprint: row.fingerprint,
  };
}
