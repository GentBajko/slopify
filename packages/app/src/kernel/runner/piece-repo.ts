import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";

// One `stage_pieces` row per resumable sub-unit of a stage: a research chapter, an audio
// chunk, an image index. It sits beside the attempt store because the wrapper stamps
// `piece_id` on every row it writes. The payload stays the JSON text it was stored as - its
// shape belongs to whichever stage owns the kind, and nothing here reads inside it.

export const pieceKinds = ["chapter", "chunk", "segment", "image", "prompt_written"] as const;
export type PieceKind = (typeof pieceKinds)[number];

export const pieceStates = ["pending", "running", "done", "failed"] as const;
export type PieceState = (typeof pieceStates)[number];

export interface StagePiece {
  readonly id: string;
  readonly stageId: string;
  readonly kind: PieceKind;
  // `idx` is the column's name: 1-based, and unique within a stage and kind.
  readonly idx: number;
  readonly state: PieceState;
  readonly payload: string | null;
}

const pieceRow = z.object({
  id: z.string(),
  stage_id: z.string(),
  kind: z.enum(pieceKinds),
  idx: z.number(),
  state: z.enum(pieceStates),
  payload: z.string().nullable(),
});

export function insertPiece(db: DatabaseSync, piece: StagePiece): void {
  db.prepare(
    "INSERT INTO stage_pieces (id, stage_id, kind, idx, state, payload) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(piece.id, piece.stageId, piece.kind, piece.idx, piece.state, piece.payload);
}

// In `idx` order: a resume re-runs only the unfinished pieces, and planning order is
// assembly order.
export function piecesOf(
  db: DatabaseSync,
  stageId: string,
  kind: PieceKind,
): readonly StagePiece[] {
  return db
    .prepare("SELECT * FROM stage_pieces WHERE stage_id = ? AND kind = ? ORDER BY idx")
    .all(stageId, kind)
    .map((row) => toPiece(pieceRow.parse(row)));
}

// Every piece of a stage whatever its kind, for the one caller that does not care: a
// re-run throws the whole plan away, because the text a chunk was cut from and the prompt
// an image was sent with are what changed.
export function allPiecesOf(db: DatabaseSync, stageId: string): readonly StagePiece[] {
  return db
    .prepare("SELECT * FROM stage_pieces WHERE stage_id = ? ORDER BY kind, idx")
    .all(stageId)
    .map((row) => toPiece(pieceRow.parse(row)));
}

export function deletePieces(db: DatabaseSync, stageId: string): void {
  db.prepare("DELETE FROM stage_pieces WHERE stage_id = ?").run(stageId);
}

// One piece: an image the user deleted leaves no row behind, or the next run would look at
// the plan and make it again.
export function deletePiece(db: DatabaseSync, id: string): void {
  db.prepare("DELETE FROM stage_pieces WHERE id = ?").run(id);
}

export function setPiece(
  db: DatabaseSync,
  id: string,
  state: PieceState,
  payload: string | null,
): void {
  db.prepare("UPDATE stage_pieces SET state = ?, payload = ? WHERE id = ?").run(state, payload, id);
}

function toPiece(row: z.infer<typeof pieceRow>): StagePiece {
  return {
    id: row.id,
    stageId: row.stage_id,
    kind: row.kind,
    idx: row.idx,
    state: row.state,
    payload: row.payload,
  };
}
