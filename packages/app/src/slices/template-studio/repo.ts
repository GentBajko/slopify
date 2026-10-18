import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { gateStates, type VersionGate } from "./model.js";

// The clause that keeps a template's hidden sample project out of a query over projects. Every
// list the user sees uses it (`edge/http/template-sample-isolation.test.ts` asks each GET
// route); the studio and its runner read the sample project by id, which it never limits.
export function notTemplateSample(alias = "projects", column = "id"): string {
  return `NOT EXISTS (SELECT 1 FROM template_samples WHERE template_samples.project_id = ${alias}.${column})`;
}

// The template whose sample a project is, with its current name; undefined for any other project.
export function sampleOwner(
  db: DatabaseSync,
  projectId: string,
): { readonly templateId: string; readonly name: string } | undefined {
  const row = db
    .prepare(
      `SELECT s.template_id AS templateId, r.name AS name FROM template_samples s
       JOIN project_templates t ON t.id=s.template_id
       JOIN project_template_revisions r ON r.template_id=t.id AND r.version=t.head_version
       WHERE s.project_id=?`,
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
