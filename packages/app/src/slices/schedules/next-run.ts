import type { DatabaseSync } from "node:sqlite";
import { runnableDesignVersion } from "../designs/gate.js";
import type { DesignDocument } from "../designs/schema.js";
import { getTemplate } from "../designs/templates.js";
import { nextDesignOccurrence } from "./by-date.js";
import { type Cadence, nextOccurrence } from "./calendar.js";
import type { ScheduleSummary } from "./schema.js";

// When a schedule runs next. A project schedule asks `nextOccurrence`, exactly as before
// designs; a design schedule asks its table's dates (`by-date.ts`), reading the date field and
// how many days ahead from the design template's ready version (else its newest).

export interface DesignPlan {
  readonly name: string;
  readonly dateField: string;
  readonly daysBefore: number;
  // The version a run makes; null while none is marked ready.
  readonly readyVersion: number | null;
  readonly headVersion: number;
  readonly document: DesignDocument;
}

export function designPlanOf(db: DatabaseSync, templateId: string): DesignPlan | undefined {
  const template = getTemplate(db, templateId);
  if (template === undefined) return undefined;
  const ready = runnableDesignVersion(db, templateId);
  const document = ready?.document ?? template.document;
  const schedule = document.schedule;
  if (schedule === undefined) return undefined;
  return {
    name: ready?.name ?? template.name,
    dateField: schedule.dateField,
    daysBefore: schedule.daysBefore,
    readyVersion: ready?.version ?? null,
    headVersion: template.headVersion,
    document,
  };
}

type Timing = Pick<ScheduleSummary, "templateKind" | "templateId" | "timezone" | "items"> & {
  readonly cadence: Cadence;
};

export function nextRunOf(db: DatabaseSync, schedule: Timing, now: Date): Date | null {
  if (schedule.cadence.kind !== "by-date")
    return nextOccurrence(schedule.cadence, schedule.timezone, now);
  const plan = designPlanOf(db, schedule.templateId);
  if (plan === undefined) return null;
  return (
    nextDesignOccurrence(
      schedule.items,
      plan.dateField,
      plan.daysBefore,
      schedule.cadence.time,
      schedule.timezone,
      now,
    )?.at ?? null
  );
}

// Every active design schedule of a template takes its next run again, for when a version is
// marked ready or the template's dates change.
export function refreshDesignSchedules(db: DatabaseSync, templateId: string, now: Date): number {
  const rows = db
    .prepare(
      `SELECT id FROM schedules WHERE template_kind='design' AND template_id=? AND status='active' AND deleted_at IS NULL`,
    )
    .all(templateId)
    .map((row) => String(row.id));
  let changed = 0;
  for (const id of rows) {
    const raw = db
      .prepare("SELECT cadence_json, timezone, items_json, next_run_at FROM schedules WHERE id=?")
      .get(id);
    if (raw === undefined) continue;
    const next = nextRunOf(
      db,
      {
        templateKind: "design",
        templateId,
        timezone: String(raw.timezone),
        cadence: JSON.parse(String(raw.cadence_json)) as Cadence,
        items: JSON.parse(String(raw.items_json)) as ScheduleSummary["items"],
      },
      now,
    );
    const at = next?.toISOString() ?? null;
    if (at === raw.next_run_at) continue;
    db.prepare(
      "UPDATE schedules SET next_run_at=?, version=version+1, updated_at=? WHERE id=?",
    ).run(at, now.toISOString(), id);
    changed += 1;
  }
  return changed;
}
