import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { type DesignStep, type StepInputs, stepKinds, stepStates } from "./model.js";

// Rows of `design_steps` (migration 0070): each one version of a design's picture.

const stepRow = z.object({
  id: z.string(),
  design_id: z.string(),
  n: z.number(),
  parent_id: z.string().nullable(),
  kind: z.enum(stepKinds),
  instruction: z.string().nullable(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  inputs_json: z.string(),
  state: z.enum(stepStates),
  error: z.string().nullable(),
  sha256: z.string().nullable(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  created_at: z.string(),
  settled_at: z.string().nullable(),
});

const inputsSchema = z
  .object({
    castMemberIds: z.array(z.string()).default([]),
    aspect: z.enum(["16:9", "9:16", "1:1"]).optional(),
    prompt: z.string().optional(),
  })
  .catch({ castMemberIds: [] });

function toStep(raw: unknown): DesignStep {
  const row = stepRow.parse(raw);
  const inputs: StepInputs = inputsSchema.parse(JSON.parse(row.inputs_json));
  return {
    id: row.id,
    designId: row.design_id,
    n: row.n,
    parentId: row.parent_id,
    kind: row.kind,
    instruction: row.instruction,
    provider: row.provider,
    model: row.model,
    inputs,
    state: row.state,
    error: row.error,
    sha256: row.sha256,
    width: row.width,
    height: row.height,
    createdAt: row.created_at,
    settledAt: row.settled_at,
  };
}

export interface NewStep {
  readonly id: string;
  readonly designId: string;
  readonly parentId: string | null;
  readonly kind: DesignStep["kind"];
  readonly instruction: string | null;
  readonly provider: string | null;
  readonly model: string | null;
  readonly inputs: StepInputs;
  readonly state: DesignStep["state"];
  readonly sha256: string | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly mutationId: string | null;
  readonly mutationHash: string | null;
  readonly at: string;
}

// Numbered after the design's last step, inside the caller's transaction.
export function insertStep(db: DatabaseSync, step: NewStep): DesignStep {
  const last = db
    .prepare("SELECT max(n) AS n FROM design_steps WHERE design_id=?")
    .get(step.designId);
  const n = typeof last?.n === "number" ? last.n + 1 : 1;
  db.prepare(
    `INSERT INTO design_steps (id,design_id,n,parent_id,kind,instruction,provider,model,inputs_json,state,sha256,width,height,mutation_id,mutation_hash,created_at,settled_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    step.id,
    step.designId,
    n,
    step.parentId,
    step.kind,
    step.instruction,
    step.provider,
    step.model,
    JSON.stringify(step.inputs),
    step.state,
    step.sha256,
    step.width,
    step.height,
    step.mutationId,
    step.mutationHash,
    step.at,
    step.state === "making" ? null : step.at,
  );
  const made = stepById(db, step.id);
  if (made === undefined) throw new Error(`design step ${step.id} was not stored`);
  return made;
}

export function stepById(db: DatabaseSync, id: string): DesignStep | undefined {
  const row = db.prepare("SELECT * FROM design_steps WHERE id=?").get(id);
  return row === undefined ? undefined : toStep(row);
}

export function stepByMutation(
  db: DatabaseSync,
  mutationId: string,
): { readonly step: DesignStep; readonly hash: string | null } | undefined {
  const row = db.prepare("SELECT * FROM design_steps WHERE mutation_id=?").get(mutationId);
  return row === undefined
    ? undefined
    : { step: toStep(row), hash: row.mutation_hash === null ? null : String(row.mutation_hash) };
}

export function stepsOf(db: DatabaseSync, designId: string): readonly DesignStep[] {
  return db
    .prepare("SELECT * FROM design_steps WHERE design_id=? ORDER BY n")
    .all(designId)
    .map(toStep);
}

export function makingSteps(db: DatabaseSync): readonly DesignStep[] {
  return db
    .prepare("SELECT * FROM design_steps WHERE state='making' ORDER BY created_at, n")
    .all()
    .map(toStep);
}

export function settleStep(
  db: DatabaseSync,
  id: string,
  outcome:
    | {
        readonly state: "ready";
        readonly sha256: string;
        readonly width: number;
        readonly height: number;
      }
    | { readonly state: "failed"; readonly error: string },
  at: string,
): boolean {
  const result =
    outcome.state === "ready"
      ? db
          .prepare(
            "UPDATE design_steps SET state='ready',sha256=?,width=?,height=?,error=NULL,settled_at=? WHERE id=? AND state='making'",
          )
          .run(outcome.sha256, outcome.width, outcome.height, at, id)
      : db
          .prepare(
            "UPDATE design_steps SET state='failed',error=?,settled_at=? WHERE id=? AND state='making'",
          )
          .run(outcome.error, at, id);
  return Number(result.changes) > 0;
}

// Try again: the same step asks again, in place.
export function restartStep(db: DatabaseSync, id: string): boolean {
  const result = db
    .prepare(
      "UPDATE design_steps SET state='making',error=NULL,settled_at=NULL WHERE id=? AND state='failed'",
    )
    .run(id);
  return Number(result.changes) > 0;
}
