import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { Ids } from "../ids.js";
import type { ProviderErrorKind } from "../ports/model.js";
import { providerErrorKinds } from "../ports/model.js";

// One row per provider call attempt. The project page reads the last error text off these rows
// and Usage counts them, so an attempt is written when it opens rather than when it ends: a
// process that dies mid-call leaves the evidence behind.

export const attemptOutcomes = ["ok", "canceled", ...providerErrorKinds] as const;
export type AttemptOutcome = "ok" | "canceled" | ProviderErrorKind;

export interface AttemptStart {
  readonly stageId: string;
  readonly pieceId: string | null;
  readonly n: number;
  readonly startedAt: string;
}

export interface AttemptEnd {
  readonly outcome: AttemptOutcome;
  readonly endedAt: string;
  readonly errorText: string | null;
}

export interface Attempt extends AttemptStart {
  readonly id: string;
  readonly endedAt: string | null;
  readonly outcome: AttemptOutcome | null;
  readonly errorText: string | null;
}

// The attempt wrapper's only reach into storage, so a test can hand it a recorder.
export interface AttemptStore {
  readonly start: (attempt: AttemptStart) => string;
  readonly end: (id: string, ended: AttemptEnd) => void;
}

const attemptRow = z.object({
  id: z.string(),
  stage_id: z.string(),
  piece_id: z.string().nullable(),
  n: z.number(),
  started_at: z.string(),
  ended_at: z.string().nullable(),
  outcome: z.enum(attemptOutcomes).nullable(),
  error_text: z.string().nullable(),
});

export function sqliteAttempts(db: DatabaseSync, ids: Ids): AttemptStore {
  return {
    start: (attempt: AttemptStart): string => {
      const id = ids.next();
      db.prepare(
        "INSERT INTO attempts (id, stage_id, piece_id, n, started_at) VALUES (?, ?, ?, ?, ?)",
      ).run(id, attempt.stageId, attempt.pieceId, attempt.n, attempt.startedAt);
      // The stage shows the attempt count beside the error. A stage with pieces (twenty images)
      // shows the count of the call being attempted, not a sum.
      db.prepare("UPDATE stages SET attempt_count = ? WHERE id = ?").run(
        attempt.n,
        attempt.stageId,
      );
      return id;
    },
    end: (id: string, ended: AttemptEnd): void => {
      db.prepare("UPDATE attempts SET ended_at = ?, outcome = ?, error_text = ? WHERE id = ?").run(
        ended.endedAt,
        ended.outcome,
        ended.errorText,
        id,
      );
    },
  };
}

export function attemptsOf(db: DatabaseSync, stageId: string): readonly Attempt[] {
  return db
    .prepare("SELECT * FROM attempts WHERE stage_id = ? ORDER BY rowid")
    .all(stageId)
    .map((row) => toAttempt(attemptRow.parse(row)));
}

function toAttempt(row: z.infer<typeof attemptRow>): Attempt {
  return {
    id: row.id,
    stageId: row.stage_id,
    pieceId: row.piece_id,
    n: row.n,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    outcome: row.outcome,
    errorText: row.error_text,
  };
}
