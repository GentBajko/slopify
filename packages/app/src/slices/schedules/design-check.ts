import { designFields } from "../designs/fields.js";
import { getTemplate } from "../designs/templates.js";
import { rowDate } from "./by-date.js";
import type { ScheduleDeps, ScheduleResult } from "./model.js";
import { designPlanOf } from "./next-run.js";
import type { ScheduleCreate, ScheduleSummary } from "./schema.js";

// What a design schedule must hold to be saved: it runs ahead of each row's date, finds no
// topics of its own and has no release days (a designed piece isn't uploaded), and every row
// fills the template's fields with a real date in its date field.

type Refusal = Extract<ScheduleResult<ScheduleSummary>, { ok: false }>;

export function checkDesign(
  deps: Pick<ScheduleDeps, "db">,
  input: ScheduleCreate,
): Refusal | { readonly ok: true; readonly value: number } {
  const refuse = (message: string): Refusal => ({ ok: false, reason: "invalid-topics", message });
  if (
    input.cadence.kind !== "by-date" ||
    input.topicGeneration.mode !== "off" ||
    input.topicKeyword !== null ||
    input.releases.length > 0
  )
    return {
      ok: false,
      reason: "invalid-input",
      message:
        "A design schedule makes each row's piece ahead of its date: it has no cadence, topic generation or release days. Choose Ahead of each date.",
    };
  const template = getTemplate(deps.db, input.templateId);
  if (template === undefined) return { ok: false, reason: "missing-template" };
  const plan = designPlanOf(deps.db, input.templateId);
  if (plan === undefined)
    return refuse(
      `The schedule wasn't saved. ${template.name} doesn't say which keyword holds each date. Open it from Templates → Poster templates, choose the date keyword under Schedule, save it, then save the schedule again.`,
    );
  const fields = designFields(plan.document);
  const named = fields.length === 0 ? "none" : fields.map((one) => `{{${one}}}`).join(", ");
  const problems: string[] = [];
  for (const keyword of Object.keys(input.values))
    if (!fields.includes(keyword))
      problems.push(
        `{{${keyword}}} (for every row) is not a keyword of this template (its keywords are ${named}). Remove it.`,
      );
  for (const [index, row] of input.items.entries()) {
    const where = `Row ${String(index + 1)} (${row.title})`;
    for (const keyword of Object.keys(row.values))
      if (!fields.includes(keyword))
        problems.push(
          `${where} fills {{${keyword}}}, which this template doesn't use (its keywords are ${named}). Remove that column.`,
        );
    if (rowDate(row, plan.dateField) === undefined)
      problems.push(
        `${where} has no date in {{${plan.dateField}}}. Write it as YYYY-MM-DD, for example 2026-11-14.`,
      );
  }
  if (problems.length === 0) return { ok: true, value: template.headVersion };
  const shown = problems.slice(0, 5);
  const more = problems.length - shown.length;
  return refuse(
    `The schedule wasn't saved. ${shown.join(" ")}${more > 0 ? ` And ${String(more)} more like these.` : ""}`,
  );
}
