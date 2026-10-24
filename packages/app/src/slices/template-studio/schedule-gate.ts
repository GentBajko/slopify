import type { DatabaseSync } from "node:sqlite";
import type { ProjectTemplate } from "../project-templates/model.js";
import { templateById } from "../project-templates/repo.js";
import { type GateView, gateOf, isGated, runnableVersion } from "./gate.js";
import { gatesOf } from "./repo.js";

// What a schedule runs of its template (`schedules/model.ts` ScheduleDeps, wired in `main.ts`).
// Until a version of the template is first marked ready in the studio, its newest version, as
// in 3.x. From then on the template is gated: the newest version marked ready, legacy, or
// carried over by Slopify from one of those; a newer unchecked version waits for Mark ready.

export interface ScheduleTemplateGate {
  // The template's newest version, and the one its schedules run (null: none was checked).
  readonly head: number;
  readonly runs: number | null;
  // Whether a version was ever marked ready, so newer versions wait for Mark ready.
  readonly gated: boolean;
  // The gate of the version that runs, or the head's when none does.
  readonly gate: GateView;
}

export function templateGate(
  db: DatabaseSync,
  templateId: string,
): ScheduleTemplateGate | undefined {
  const head = templateById(db, templateId);
  if (head === undefined) return undefined;
  const gates = gatesOf(db, templateId);
  const runs = runnableVersion(gates, head.version) ?? null;
  return {
    head: head.version,
    runs,
    gated: isGated(gates),
    gate: gateOf(gates, runs ?? head.version),
  };
}

// The version a schedule runs, previews and checks against. A gated template with nothing it may
// run answers its newest one, so the schedule can still be edited and its calendar shows
// titles; its runs wait (`notReadySentence`).
export function runnableTemplate(
  db: DatabaseSync,
  templateId: string,
): ProjectTemplate | undefined {
  const gate = templateGate(db, templateId);
  if (gate === undefined) return undefined;
  return templateById(db, templateId, gate.runs ?? gate.head);
}

// Why a schedule's run doesn't start: its gated template has no version it may run. Undefined
// when it has one, or when the template is gone (the run says that itself).
export function notReadySentence(db: DatabaseSync, templateId: string): string | undefined {
  const gate = templateGate(db, templateId);
  if (gate === undefined || gate.runs !== null) return undefined;
  const name = templateById(db, templateId)?.name ?? "This schedule's template";
  return `Not started: ${name} has no version approved for schedules. Open it in Templates → Edit template and choose More → Approve for schedules.`;
}
