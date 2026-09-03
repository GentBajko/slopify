import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";

// One row per resumable sub-unit of a stage (02-models, `stage_pieces`): a research
// chapter, an audio chunk, an image index. It sits beside the attempt store because the
// attempt wrapper stamps `piece_id` on every row it writes and the kernel may not import
// the slices that fill these in. The payload is carried as the JSON text it is stored
// as: its shape belongs to whichever stage owns the kind, and nothing here reads inside.

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

// In `idx` order: the resume of `logic/06` §Q54 re-runs the pieces a previous attempt did
// not finish and keeps the rest, and the order they were planned in is the order the
// stage's output is assembled in.
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
