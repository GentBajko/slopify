import { z } from "zod";
import type { StageContext } from "../../kernel/runner/index.js";
import type { RevisionDeps } from "../revisions/model.js";
import { recipeInputSchema } from "./recipe-input-schema.js";
import { executionView } from "./runtime-plan.js";
import type { WorkPiece } from "./work-records.js";

export function frozenInstructions(
  deps: RevisionDeps,
  context: StageContext,
  current: WorkPiece,
): string {
  const view = executionView(deps, context.work.projectId, context.work.revisionId);
  const selected = new Set(
    view?.pieces
      .filter((row) => row.selected && row.piece.state === "done")
      .map((row) => row.piece.id),
  );
  const rows = deps.db
    .prepare(
      `SELECT p.id,p.work_id,p.work_key,p.input_json,p.result_json,p.state FROM revision_work_pieces p JOIN revision_work w ON w.id=p.work_id WHERE w.project_id=? AND w.kind=? ORDER BY w.rowid,p.rowid`,
    )
    .all(context.work.projectId, context.work.kind);
  const sections: string[] = [];
  for (const raw of rows) {
    const row = z
      .object({
        id: z.string(),
        work_id: z.string(),
        work_key: z.string(),
        input_json: z.string(),
        result_json: z.string().nullable(),
        state: z.string(),
      })
      .parse(raw);
    if (
      row.id !== current.id &&
      !selected.has(row.id) &&
      !(row.work_id === current.workId && row.result_json !== null)
    )
      continue;
    const input = recipeInputSchema.parse(JSON.parse(row.input_json));
    if (input.kind !== "llm") continue;
    sections.push(
      `## ${label(row.work_key)}\n\n${input.messages.map((message) => `### ${message.role}\n\n${message.content}`).join("\n\n")}`,
    );
    for (const document of input.documents ?? [])
      sections.push(`### Document ${document.id}: ${document.title}\n\n${document.content}`);
  }
  return `${sections.join("\n\n")}\n`;
}
function label(key: string): string {
  if (key === "research:planner") return "Research outline";
  if (key === "research:notes") return "Research synthesis";
  if (key.startsWith("research:chapter:")) return `Research chapter ${key.split(":").at(-1)}`;
  if (key === "article:body") return "Article";
  if (key.startsWith("article:continuation:"))
    return `Article continuation ${key.split(":").at(-1)}`;
  if (key === "entry:intro:text") return "Intro";
  if (key === "entry:outro:text") return "Outro";
  return "Thumbnail instructions";
}
