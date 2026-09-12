import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { recipeInputSchema } from "./recipe-input-schema.js";
import type { RecipeInput } from "./recipe-model.js";
export interface WorkPiece {
  readonly id: string;
  readonly workId: string;
  readonly key: string;
  readonly requestFingerprint: string;
  readonly fingerprint: string;
  readonly input: RecipeInput;
  readonly logicalFingerprint?: string | undefined;
  readonly continuation: string | null;
  readonly generationToken: string | null;
  readonly state: "pending" | "running" | "done" | "failed" | "held";
  readonly dispatchState: "held" | "allowed" | "draining";
  readonly submittedAt: string | null;
}
const pieceRow = z.object({
  id: z.string(),
  work_id: z.string(),
  work_key: z.string(),
  request_fingerprint: z.string(),
  fingerprint: z.string(),
  input_json: z.string(),
  logical_fingerprint: z.string().nullable(),
  continuation: z.string().nullable(),
  generation_token: z.string().nullable(),
  state: z.enum(["pending", "running", "done", "failed", "held"]),
  dispatch_state: z.enum(["held", "allowed", "draining"]),
  submitted_at: z.string().nullable(),
});
export function workPieces(db: DatabaseSync, workId: string): readonly WorkPiece[] {
  return db
    .prepare("SELECT * FROM revision_work_pieces WHERE work_id=? ORDER BY rowid")
    .all(workId)
    .map((value) => {
      const row = pieceRow.parse(value);
      return {
        id: row.id,
        workId: row.work_id,
        key: row.work_key,
        requestFingerprint: row.request_fingerprint,
        fingerprint: row.fingerprint,
        ...(row.logical_fingerprint === null
          ? {}
          : { logicalFingerprint: row.logical_fingerprint }),
        input: recipeInputSchema.parse(JSON.parse(row.input_json)),
        continuation: row.continuation,
        generationToken: row.generation_token,
        state: row.state,
        dispatchState: row.dispatch_state,
        submittedAt: row.submitted_at,
      };
    });
}
export function insertWorkPiece(db: DatabaseSync, piece: WorkPiece): void {
  const input = recipeInputSchema.parse(piece.input);
  db.prepare(
    `INSERT INTO revision_work_pieces(id,work_id,work_key,request_fingerprint,fingerprint,input_json,continuation,generation_token,state,dispatch_state,submitted_at,logical_fingerprint) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    piece.id,
    piece.workId,
    piece.key,
    piece.requestFingerprint,
    piece.fingerprint,
    JSON.stringify(input),
    piece.continuation,
    piece.generationToken,
    piece.state,
    piece.dispatchState,
    piece.submittedAt,
    piece.logicalFingerprint ?? null,
  );
}
