import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { ProjectTemplate, TemplateSummary } from "./model.js";
import { projectTemplateSchema } from "./schema.js";

const select = `SELECT t.id,r.version,r.name,t.created_at AS createdAt,r.created_at AS updatedAt,r.document_json AS document FROM project_templates t JOIN project_template_revisions r ON r.template_id=t.id`;
const templateSummarySchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    version: z.number().int().positive(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict()
  .readonly();
export function templateById(
  db: DatabaseSync,
  id: string,
  version?: number,
): ProjectTemplate | undefined {
  const row = db
    .prepare(
      `${select} WHERE t.id=? AND r.version=${version === undefined ? "t.head_version" : "?"}`,
    )
    .get(...(version === undefined ? [id] : [id, version]));
  if (row === undefined) return undefined;
  if (typeof row.document !== "string") throw new Error("Template document is missing");
  return projectTemplateSchema.parse({ ...row, document: JSON.parse(row.document) });
}
export function templateSummaries(db: DatabaseSync): readonly TemplateSummary[] {
  return db
    .prepare(`${select} WHERE r.version=t.head_version ORDER BY lower(r.name),t.id`)
    .all()
    .map((row) => {
      const parsed = templateSummarySchema.parse({
        id: row.id,
        name: row.name,
        version: row.version,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      });
      return parsed;
    });
}
export function insertTemplateRevision(db: DatabaseSync, template: ProjectTemplate): void {
  db.prepare(
    "INSERT INTO project_template_revisions(template_id,version,name,document_json,created_at) VALUES (?,?,?,?,?)",
  ).run(
    template.id,
    template.version,
    template.name,
    JSON.stringify(template.document),
    template.updatedAt,
  );
}
