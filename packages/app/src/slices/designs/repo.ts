import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import { z } from "zod";
import { type Design, designKinds } from "./model.js";

// Rows of `designs` (migration 0070). Every list leaves out deleted designs
// and the hidden samples a design template's editor redraws (`sample_of`).

const designRow = z.object({
  id: z.string(),
  kind: z.enum(designKinds),
  name: z.string(),
  channel_id: z.string(),
  project_id: z.string().nullable(),
  template_id: z.string().nullable(),
  template_version: z.number().nullable(),
  schedule_id: z.string().nullable(),
  schedule_run_id: z.string().nullable(),
  document_json: z.string().nullable(),
  values_json: z.string(),
  head_step_id: z.string().nullable(),
  sample_of: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  deleted_at: z.string().nullable(),
});

const valuesSchema = z.record(z.string(), z.string());
export const notDesignSample = "sample_of IS NULL";

function toDesign(raw: unknown): Design {
  const row = designRow.parse(raw);
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    channelId: row.channel_id,
    projectId: row.project_id,
    templateId: row.template_id,
    templateVersion: row.template_version,
    scheduleId: row.schedule_id,
    scheduleRunId: row.schedule_run_id,
    document: row.document_json === null ? null : JSON.parse(row.document_json),
    values: valuesSchema.catch({}).parse(JSON.parse(row.values_json)),
    headStepId: row.head_step_id,
    sampleOf: row.sample_of,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export interface NewDesign {
  readonly id: string;
  readonly kind: Design["kind"];
  readonly name: string;
  readonly channelId: string;
  readonly projectId: string | null;
  readonly templateId?: string | null | undefined;
  readonly templateVersion?: number | null | undefined;
  readonly scheduleId?: string | null | undefined;
  readonly scheduleRunId?: string | null | undefined;
  readonly document: unknown;
  readonly values: Readonly<Record<string, string>>;
  readonly sampleOf?: string | null | undefined;
  readonly mutationId: string | null;
  readonly mutationHash: string | null;
  readonly at: string;
}

export function insertDesign(db: DatabaseSync, row: NewDesign): void {
  db.prepare(
    `INSERT INTO designs (id,kind,name,channel_id,project_id,template_id,template_version,schedule_id,schedule_run_id,document_json,values_json,sample_of,mutation_id,mutation_hash,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    row.id,
    row.kind,
    row.name,
    row.channelId,
    row.projectId,
    row.templateId ?? null,
    row.templateVersion ?? null,
    row.scheduleId ?? null,
    row.scheduleRunId ?? null,
    row.document === null || row.document === undefined ? null : JSON.stringify(row.document),
    JSON.stringify(row.values),
    row.sampleOf ?? null,
    row.mutationId,
    row.mutationHash,
    row.at,
    row.at,
  );
}

// Deleted designs included: the trash and a mutation replay read them too.
export function designById(db: DatabaseSync, id: string): Design | undefined {
  const row = db.prepare("SELECT * FROM designs WHERE id=?").get(id);
  return row === undefined ? undefined : toDesign(row);
}

export function designByMutation(
  db: DatabaseSync,
  mutationId: string,
): { readonly design: Design; readonly hash: string | null } | undefined {
  const row = db.prepare("SELECT * FROM designs WHERE mutation_id=?").get(mutationId);
  return row === undefined
    ? undefined
    : {
        design: toDesign(row),
        hash: row.mutation_hash === null ? null : String(row.mutation_hash),
      };
}

export function listDesigns(
  db: DatabaseSync,
  filter: { readonly projectId?: string | undefined } = {},
): readonly Design[] {
  const where = [`deleted_at IS NULL`, notDesignSample];
  const params: SQLInputValue[] = [];
  if (filter.projectId !== undefined) {
    where.push("project_id=?");
    params.push(filter.projectId);
  }
  return db
    .prepare(`SELECT * FROM designs WHERE ${where.join(" AND ")} ORDER BY updated_at DESC, id`)
    .all(...params)
    .map(toDesign);
}

export interface DesignChanges {
  readonly name?: string | undefined;
  readonly kind?: Design["kind"] | undefined;
  readonly projectId?: string | null | undefined;
  readonly document?: unknown;
  readonly values?: Readonly<Record<string, string>> | undefined;
  readonly headStepId?: string | undefined;
}

// Only when the row still has `baseUpdatedAt`; false when someone changed it meanwhile.
export function updateDesign(
  db: DatabaseSync,
  id: string,
  baseUpdatedAt: string | undefined,
  changes: DesignChanges,
  at: string,
): boolean {
  const sets: string[] = ["updated_at=?"];
  const params: SQLInputValue[] = [at];
  const set = (column: string, value: SQLInputValue) => {
    sets.push(`${column}=?`);
    params.push(value);
  };
  if (changes.name !== undefined) set("name", changes.name);
  if (changes.kind !== undefined) set("kind", changes.kind);
  if (changes.projectId !== undefined) set("project_id", changes.projectId);
  if (changes.document !== undefined) set("document_json", JSON.stringify(changes.document));
  if (changes.values !== undefined) set("values_json", JSON.stringify(changes.values));
  if (changes.headStepId !== undefined) set("head_step_id", changes.headStepId);
  const guard = baseUpdatedAt === undefined ? "" : " AND updated_at=?";
  const result = db
    .prepare(`UPDATE designs SET ${sets.join(",")} WHERE id=? AND deleted_at IS NULL${guard}`)
    .run(...params, id, ...(baseUpdatedAt === undefined ? [] : [baseUpdatedAt]));
  return Number(result.changes) > 0;
}
