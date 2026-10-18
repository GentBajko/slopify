import { existsSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { type SampleProjects, templateSamplesDir } from "../../kernel/paths.js";
import { carryGate } from "./gate.js";
import { gateStates, type VersionGate } from "./model.js";

// The clause that keeps the studio's hidden projects (each template's sample and each
// bake-off copy, `template_hidden_projects`) out of a query over projects. Every list the user
// sees uses it (`edge/http/template-sample-isolation.test.ts` asks each GET route); the studio
// and its runner read those projects by id, which it never limits.
export function notTemplateSample(alias = "projects", column = "id"): string {
  return `NOT EXISTS (SELECT 1 FROM template_hidden_projects h WHERE h.project_id = ${alias}.${column})`;
}

const hiddenProject = "SELECT 1 FROM template_hidden_projects WHERE project_id=?";

export function isTemplateSample(db: DatabaseSync, projectId: string): boolean {
  return db.prepare(hiddenProject).get(projectId) !== undefined;
}

// The same question asked on every project event (the shell's tally, the global stream):
// one prepared statement, reused.
export function templateSampleCheck(db: DatabaseSync): (projectId: string) => boolean {
  const named = db.prepare(hiddenProject);
  return (projectId) => named.get(projectId) !== undefined;
}

// Which projects' folders are kept in the data dir (`kernel/paths.ts` samples): a project
// named by a template's sample row, or one whose folder is already there (a sample whose row
// went with its template keeps its files where they are until the project is deleted).
export function sampleProjects(db: DatabaseSync, dataDir: string): SampleProjects {
  const named = db.prepare(hiddenProject);
  const root = templateSamplesDir({ dataDir });
  return {
    has: (projectId) =>
      named.get(projectId) !== undefined ||
      (/^[0-9A-Za-z_-]{1,64}$/u.test(projectId) && existsSync(join(root, projectId))),
  };
}

export function templateSampleProjects(db: DatabaseSync): ReadonlySet<string> {
  return new Set(
    db
      .prepare("SELECT project_id FROM template_hidden_projects")
      .all()
      .map((row) => String(row.project_id)),
  );
}

// The template whose sample (or bake-off copy) a project is, with its current name; undefined
// for any other project.
export function sampleOwner(
  db: DatabaseSync,
  projectId: string,
): { readonly templateId: string; readonly name: string } | undefined {
  const row = db
    .prepare(
      `SELECT o.template_id AS templateId, r.name AS name FROM (
         SELECT template_id, project_id FROM template_samples
         UNION ALL
         SELECT b.template_id, c.project_id FROM template_bakeoff_clones c
           JOIN template_bakeoffs b ON b.id=c.bakeoff_id
       ) o
       JOIN project_templates t ON t.id=o.template_id
       JOIN project_template_revisions r ON r.template_id=t.id AND r.version=t.head_version
       WHERE o.project_id=?`,
    )
    .get(projectId);
  return row === undefined
    ? undefined
    : z.object({ templateId: z.string(), name: z.string() }).parse(row);
}

const gateRow = z.object({
  version: z.number().int().positive(),
  state: z.enum(gateStates),
  carriedFrom: z.number().int().positive().nullable(),
});

export function gatesOf(db: DatabaseSync, templateId: string): readonly VersionGate[] {
  return db
    .prepare(
      "SELECT version,state,carried_from AS carriedFrom FROM template_gates WHERE template_id=? ORDER BY version",
    )
    .all(templateId)
    .map((row) => gateRow.parse(row));
}

export interface SampleRecord {
  readonly projectId: string;
  readonly topic: string;
  readonly topicSource: "fixed" | "queued";
  readonly fullScript: boolean;
}

export function sampleOf(db: DatabaseSync, templateId: string): SampleRecord | undefined {
  const row = db
    .prepare(
      "SELECT project_id AS projectId,topic,topic_source AS topicSource,full_script AS fullScript FROM template_samples WHERE template_id=?",
    )
    .get(templateId);
  if (row === undefined) return undefined;
  const parsed = z
    .object({
      projectId: z.string(),
      topic: z.string(),
      topicSource: z.enum(["fixed", "queued"]),
      fullScript: z.number(),
    })
    .parse(row);
  return { ...parsed, fullScript: parsed.fullScript === 1 };
}

export interface SampleVersion {
  readonly templateVersion: number;
  readonly revisionId: string | null;
  readonly state: import("./model.js").SampleVersionState;
  readonly quotedHigh: number | null;
  readonly heldReason: string | null;
  readonly updatedAt: string;
}

const versionRow = z.object({
  templateVersion: z.number().int().positive(),
  revisionId: z.string().nullable(),
  state: z.enum(["queued", "making", "done", "failed", "skipped", "held"]),
  quotedHigh: z.number().nullable(),
  heldReason: z.string().nullable(),
  updatedAt: z.string(),
});

// Each version's paid sample, newest first.
export function sampleVersions(db: DatabaseSync, templateId: string): readonly SampleVersion[] {
  return db
    .prepare(
      `SELECT template_version AS templateVersion,revision_id AS revisionId,state,quoted_high AS quotedHigh,
         held_reason AS heldReason,updated_at AS updatedAt
       FROM template_sample_versions WHERE template_id=? ORDER BY template_version DESC`,
    )
    .all(templateId)
    .map((row) => versionRow.parse(row));
}

// Records what a version's paid sample is now. A field left out keeps what it was.
export function setSampleVersion(
  db: DatabaseSync,
  templateId: string,
  version: number,
  change: {
    readonly state: SampleVersion["state"];
    readonly at: string;
    readonly revisionId?: string | null;
    readonly quotedHigh?: number | null;
    readonly heldReason?: string | null;
  },
): void {
  db.prepare(
    `INSERT INTO template_sample_versions (template_id,template_version,revision_id,state,quoted_high,held_reason,updated_at)
     VALUES (?,?,?,?,?,?,?)
     ON CONFLICT(template_id,template_version) DO UPDATE SET state=excluded.state,updated_at=excluded.updated_at,
       revision_id=CASE WHEN ? THEN excluded.revision_id ELSE revision_id END,
       quoted_high=CASE WHEN ? THEN excluded.quoted_high ELSE quoted_high END,
       held_reason=CASE WHEN ? THEN excluded.held_reason ELSE held_reason END`,
  ).run(
    templateId,
    version,
    change.revisionId ?? null,
    change.state,
    change.quotedHigh ?? null,
    change.heldReason ?? null,
    change.at,
    change.revisionId === undefined ? 0 : 1,
    change.quotedHigh === undefined ? 0 : 1,
    change.heldReason === undefined ? 0 : 1,
  );
}

// Records the hidden project a template's samples are made on.
export function upsertSample(
  db: DatabaseSync,
  templateId: string,
  sample: {
    readonly projectId: string;
    readonly topic: string;
    readonly topicSource: "fixed" | "queued";
    readonly fullScript: boolean;
    readonly at: string;
  },
): void {
  db.prepare(
    `INSERT INTO template_samples (template_id,project_id,topic,topic_source,full_script,created_at)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT(template_id) DO UPDATE SET project_id=excluded.project_id,topic=excluded.topic,
       topic_source=excluded.topic_source,full_script=excluded.full_script`,
  ).run(
    templateId,
    sample.projectId,
    sample.topic,
    sample.topicSource,
    sample.fullScript ? 1 : 0,
    sample.at,
  );
}

// Records a version's gate: marked ready (with the checks it passed), or carried from the
// version a system writer made it from. Marking a carried or legacy version ready replaces it.
export function writeGate(
  db: DatabaseSync,
  templateId: string,
  gate: VersionGate & { readonly checksJson?: string | null; readonly markedAt?: string | null },
): void {
  db.prepare(
    `INSERT INTO template_gates (template_id,version,state,carried_from,checks_json,marked_at)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT(template_id,version) DO UPDATE SET state=excluded.state,
       carried_from=excluded.carried_from,checks_json=excluded.checks_json,marked_at=excluded.marked_at`,
  ).run(
    templateId,
    gate.version,
    gate.state,
    gate.carriedFrom,
    gate.checksJson ?? null,
    gate.markedAt ?? null,
  );
}

// A version Slopify wrote itself from `parent` (a retired model switched, a restore under a new
// name) keeps its gate: a runnable parent makes `next` carried, so no schedule stops over a
// change its user didn't make. Call it in the writer's transaction.
export function carryGateOnto(
  db: DatabaseSync,
  templateId: string,
  parent: number,
  next: number,
): void {
  const carried = carryGate(gatesOf(db, templateId), parent, next);
  if (carried !== undefined) writeGate(db, templateId, carried);
}
