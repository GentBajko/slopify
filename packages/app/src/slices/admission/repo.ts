import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { stageKinds, stageStates } from "../../kernel/pipeline.js";
import type { StageProgress } from "../../kernel/runner/graph.js";
import { chunkModes } from "../narration/chunk.js";
import type { Project, RunConfig, Stage } from "./model.js";
import { entryModes, formats, stageSources } from "./model.js";

const providerChoice = z.object({ provider: z.string(), model: z.string() });
const entryChoice = z.object({ name: z.string(), mode: z.enum(entryModes) });

// The shape Play posts and the shape `projects.config` holds, in one place: the second
// is the first plus the rendered prompt texts (logic/03 §Q25).
export const runDraftSchema = z.object({
  title: z.string(),
  format: z.enum(formats),
  // Spelled out rather than built from stageKinds, so the inferred type carries the six
  // keys and this schema stays assignable to the domain type without a cast.
  sources: z.object({
    research: z.enum(stageSources),
    article: z.enum(stageSources),
    audio: z.enum(stageSources),
    images: z.enum(stageSources),
    thumbnail: z.enum(stageSources),
    video: z.enum(stageSources),
  }),
  llm: providerChoice.optional(),
  audio: providerChoice.extend({ voice: z.string() }).optional(),
  images: providerChoice.optional(),
  articlePrompt: z.string().optional(),
  imagePrompts: z.array(z.object({ name: z.string(), number: z.number() })),
  thumbnailPrompt: z.string().optional(),
  intro: entryChoice.optional(),
  outro: entryChoice.optional(),
  values: z.record(z.string(), z.string()),
  provided: z.object({
    research: z.string().optional(),
    article: z.string().optional(),
    audio: z.string().optional(),
    images: z.array(z.string()).optional(),
    thumbnail: z.string().optional(),
  }),
  // logic/08 §Q65. Optional until Play carries the control; unknown keys are stripped by
  // this schema, so a mode that is not listed here would never reach the audio stage.
  chunking: z.object({ mode: z.enum(chunkModes), words: z.number().optional() }).optional(),
  silenceGapSeconds: z.number(),
});

export const runConfigSchema = runDraftSchema.extend({
  rendered: z.record(z.string(), z.string()),
});

const projectRow = z.object({
  id: z.string(),
  title: z.string(),
  format: z.enum(formats),
  config: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
});

const standingRow = z.object({
  project_id: z.string(),
  kind: z.enum(stageKinds),
  state: z.enum(stageStates),
  progress_current: z.number().nullable(),
  progress_total: z.number().nullable(),
});

const stageRow = z.object({
  id: z.string(),
  project_id: z.string(),
  kind: z.enum(stageKinds),
  source: z.enum(stageSources),
  state: z.enum(stageStates),
  failure_reason: z.string().nullable(),
  attempt_count: z.number(),
  progress_current: z.number().nullable(),
  progress_total: z.number().nullable(),
  started_at: z.string().nullable(),
  finished_at: z.string().nullable(),
});

export function insertProject(db: DatabaseSync, project: Project): void {
  db.prepare(
    "INSERT INTO projects (id, title, format, config, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(
    project.id,
    project.title,
    project.format,
    JSON.stringify(project.config),
    project.createdAt,
    project.updatedAt,
  );
}

export function insertStage(db: DatabaseSync, stage: Stage): void {
  db.prepare(
    "INSERT INTO stages (id, project_id, kind, source, state, attempt_count) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(stage.id, stage.projectId, stage.kind, stage.source, stage.state, stage.attemptCount);
}

export function projectById(db: DatabaseSync, id: string): Project | undefined {
  const row = db.prepare("SELECT * FROM projects WHERE id = ?").get(id);
  return row === undefined ? undefined : toProject(projectRow.parse(row));
}

// Existence alone, for a caller that needs no run configuration: `slices/cancel` only
// asks whether the id names a project, and parsing the config to answer that would tie
// cancelling to a schema it never reads.
export function projectExists(db: DatabaseSync, id: string): boolean {
  return db.prepare("SELECT 1 FROM projects WHERE id = ?").get(id) !== undefined;
}

// mockup/07: newest first.
export function listProjects(db: DatabaseSync): Project[] {
  return db
    .prepare("SELECT * FROM projects ORDER BY created_at DESC, id DESC")
    .all()
    .map((row) => toProject(projectRow.parse(row)));
}

// What 07 Projects needs of every project's stages and no more: the state each one is in
// and how far through itself a running one is. One statement for the whole list rather
// than `stagesOf` per row, and five columns rather than the whole stage table, because
// the screen shows a status word and a meter and reads nothing else from a stage.
export function stageStandingsByProject(db: DatabaseSync): Map<string, StageProgress[]> {
  const grouped = new Map<string, StageProgress[]>();
  const rows = db
    .prepare(
      "SELECT project_id, kind, state, progress_current, progress_total FROM stages ORDER BY rowid",
    )
    .all();
  for (const row of rows) {
    const parsed = standingRow.parse(row);
    const standing: StageProgress = {
      kind: parsed.kind,
      state: parsed.state,
      progressCurrent: parsed.progress_current,
      progressTotal: parsed.progress_total,
    };
    const seen = grouped.get(parsed.project_id);
    if (seen === undefined) {
      grouped.set(parsed.project_id, [standing]);
    } else {
      seen.push(standing);
    }
  }
  return grouped;
}

export function stagesOf(db: DatabaseSync, projectId: string): Stage[] {
  return db
    .prepare("SELECT * FROM stages WHERE project_id = ? ORDER BY rowid")
    .all(projectId)
    .map((row) => toStage(stageRow.parse(row)));
}

// The runner's claim: one statement, so two callers cannot both find the stage pending.
export function claimStage(db: DatabaseSync, stageId: string, at: string): boolean {
  const result = db
    .prepare(
      "UPDATE stages SET state = 'running', started_at = ?, finished_at = NULL, failure_reason = NULL WHERE id = ? AND state = 'pending'",
    )
    .run(at, stageId);
  return Number(result.changes) === 1;
}

export function finishStage(
  db: DatabaseSync,
  stageId: string,
  state: Stage["state"],
  failureReason: string | null,
  at: string,
): void {
  db.prepare("UPDATE stages SET state = ?, failure_reason = ?, finished_at = ? WHERE id = ?").run(
    state,
    failureReason,
    at,
    stageId,
  );
}

// `logic/12` step 9 and `logic/13` step 5: a stage put back to `pending` by a re-run, a
// cascade or a retry starts again from a clean row - no error text, no progress from the
// run before it, and the fresh attempt budget of `logic/01` §Q5.
export function resetStage(db: DatabaseSync, stageId: string): void {
  db.prepare(
    "UPDATE stages SET state = 'pending', failure_reason = NULL, attempt_count = 0, progress_current = NULL, progress_total = NULL, started_at = NULL, finished_at = NULL WHERE id = ?",
  ).run(stageId);
}

export function setStageProgress(
  db: DatabaseSync,
  stageId: string,
  current: number,
  total: number,
): void {
  db.prepare("UPDATE stages SET progress_current = ?, progress_total = ? WHERE id = ?").run(
    current,
    total,
    stageId,
  );
}

function toProject(row: z.infer<typeof projectRow>): Project {
  return {
    id: row.id,
    title: row.title,
    format: row.format,
    config: parseConfig(row.config),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// A JSON column never reaches a caller as a string.
function parseConfig(config: string): RunConfig {
  const parsed: unknown = JSON.parse(config);
  return runConfigSchema.parse(parsed);
}

function toStage(row: z.infer<typeof stageRow>): Stage {
  return {
    id: row.id,
    projectId: row.project_id,
    kind: row.kind,
    source: row.source,
    state: row.state,
    failureReason: row.failure_reason,
    attemptCount: row.attempt_count,
    progressCurrent: row.progress_current,
    progressTotal: row.progress_total,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}
