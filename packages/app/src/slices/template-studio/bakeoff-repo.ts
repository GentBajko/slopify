import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";

// The bake-off's rows (`0074-template-bakeoffs.sql`): one per template, and one copy per model.

export const bakeoffSections = ["script", "voice", "pictures"] as const;
export type BakeoffSection = (typeof bakeoffSections)[number];

export const bakeoffStates = ["queued", "making", "done", "held", "failed"] as const;
export type BakeoffState = (typeof bakeoffStates)[number];
export const cloneStates = ["queued", "making", "done", "failed"] as const;
export type CloneState = (typeof cloneStates)[number];

export interface BakeoffRow {
  readonly id: string;
  readonly templateId: string;
  readonly templateVersion: number;
  readonly section: BakeoffSection;
  readonly ackHigh: number;
  readonly ackUnknown: boolean;
  readonly state: BakeoffState;
  readonly sentence: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CloneRow {
  readonly slot: number;
  readonly provider: string;
  readonly model: string;
  readonly projectId: string | null;
  readonly state: CloneState;
  readonly quotedHigh: number | null;
  readonly failure: string | null;
  readonly startedAt: string | null;
  readonly finishedAt: string | null;
}

const bakeoffRow = z.object({
  id: z.string(),
  templateId: z.string(),
  templateVersion: z.number().int().positive(),
  section: z.enum(bakeoffSections),
  ackHigh: z.number(),
  ackUnknown: z.number(),
  state: z.enum(bakeoffStates),
  sentence: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
const cloneRow = z.object({
  slot: z.number().int(),
  provider: z.string(),
  model: z.string(),
  projectId: z.string().nullable(),
  state: z.enum(cloneStates),
  quotedHigh: z.number().nullable(),
  failure: z.string().nullable(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
});

export function bakeoffOf(db: DatabaseSync, templateId: string): BakeoffRow | undefined {
  const row = db
    .prepare(
      `SELECT id,template_id AS templateId,template_version AS templateVersion,section,ack_high AS ackHigh,
         ack_unknown AS ackUnknown,state,sentence,created_at AS createdAt,updated_at AS updatedAt
       FROM template_bakeoffs WHERE template_id=?`,
    )
    .get(templateId);
  if (row === undefined) return undefined;
  const parsed = bakeoffRow.parse(row);
  return { ...parsed, ackUnknown: parsed.ackUnknown === 1 };
}

export function clonesOf(db: DatabaseSync, bakeoffId: string): readonly CloneRow[] {
  return db
    .prepare(
      `SELECT slot,provider,model,project_id AS projectId,state,quoted_high AS quotedHigh,failure,
         started_at AS startedAt,finished_at AS finishedAt
       FROM template_bakeoff_clones WHERE bakeoff_id=? ORDER BY slot`,
    )
    .all(bakeoffId)
    .map((row) => cloneRow.parse(row));
}

export function insertBakeoff(
  db: DatabaseSync,
  row: Omit<BakeoffRow, "updatedAt" | "sentence" | "state">,
  clones: readonly {
    readonly provider: string;
    readonly model: string;
    readonly quotedHigh: number;
  }[],
): void {
  db.prepare(
    `INSERT INTO template_bakeoffs (id,template_id,template_version,section,ack_high,ack_unknown,state,sentence,created_at,updated_at)
     VALUES (?,?,?,?,?,?,'queued',NULL,?,?)`,
  ).run(
    row.id,
    row.templateId,
    row.templateVersion,
    row.section,
    row.ackHigh,
    row.ackUnknown ? 1 : 0,
    row.createdAt,
    row.createdAt,
  );
  const insert = db.prepare(
    "INSERT INTO template_bakeoff_clones (bakeoff_id,slot,provider,model,state,quoted_high) VALUES (?,?,?,?,'queued',?)",
  );
  clones.forEach((clone, slot) => {
    insert.run(row.id, slot, clone.provider, clone.model, clone.quotedHigh);
  });
}

export function setBakeoff(
  db: DatabaseSync,
  id: string,
  state: BakeoffState,
  sentence: string | null,
  at: string,
): void {
  db.prepare("UPDATE template_bakeoffs SET state=?,sentence=?,updated_at=? WHERE id=?").run(
    state,
    sentence,
    at,
    id,
  );
}

// Records what one copy is now. A field left out keeps what it was.
export function setClone(
  db: DatabaseSync,
  bakeoffId: string,
  slot: number,
  change: {
    readonly state?: CloneState;
    readonly projectId?: string | null;
    readonly quotedHigh?: number | null;
    readonly failure?: string | null;
    readonly startedAt?: string | null;
    readonly finishedAt?: string | null;
  },
): void {
  const columns = {
    state: change.state,
    project_id: change.projectId,
    quoted_high: change.quotedHigh,
    failure: change.failure,
    started_at: change.startedAt,
    finished_at: change.finishedAt,
  };
  const set = Object.entries(columns).filter(([, value]) => value !== undefined);
  if (set.length === 0) return;
  db.prepare(
    `UPDATE template_bakeoff_clones SET ${set.map(([column]) => `${column}=?`).join(",")} WHERE bakeoff_id=? AND slot=?`,
  ).run(...set.map(([, value]) => value ?? null), bakeoffId, slot);
}

export function deleteBakeoffRow(db: DatabaseSync, id: string): void {
  db.prepare("DELETE FROM template_bakeoffs WHERE id=?").run(id);
}

// A newer Save, topic or full script takes the place of a bake-off still waiting to start: the
// bake-off was priced on the version before it.
export function supersedeQueuedBakeoff(db: DatabaseSync, templateId: string, at: string): void {
  db.prepare(
    `UPDATE template_bakeoffs SET state='failed',updated_at=?,
       sentence='A newer Save took its place before it started, so nothing was spent on it. Start the bake-off again on the new version.'
     WHERE template_id=? AND state='queued'`,
  ).run(at, templateId);
}
