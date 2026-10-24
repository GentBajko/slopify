import type { ScheduleTemplateGate } from "@app/slices/schedules/schema.js";
import type { BadgeTone } from "@/components/kit/status";

// The words for which version of a template its schedules run, shared by the Schedules screen
// and Templates. Until a version is first approved for schedules (Edit template → More), they
// run each version as it is saved; from then on a newer one waits for its approval. Nobody
// without a schedule needs these words, so Templates shows them only on a template a schedule
// runs or one that was approved once.

export type TemplateGate = ScheduleTemplateGate;

// The schedule's own line: what its next run uses.
export function scheduleGateWords(gate: TemplateGate): {
  readonly text: string;
  readonly tone: BadgeTone;
} {
  if (!gate.gated) return { text: "Runs each version you save", tone: "neutral" };
  if (gate.runs === null)
    return {
      text: "Runs nothing yet: no version is approved for schedules",
      tone: "waiting",
    };
  const newer =
    gate.head > gate.runs ? ` · version ${String(gate.head)} waits for your approval` : "";
  return {
    text: `Runs version ${String(gate.runs)}${newer}`,
    tone: newer === "" ? "neutral" : "info",
  };
}

// A template's badge on Templates, or undefined when it has nothing to say: no schedule runs
// the template and no version of it was ever approved.
export function templateGateBadge(
  gate: TemplateGate | undefined,
  schedules: number,
):
  | {
      readonly word: string;
      readonly tone: BadgeTone;
      readonly detail: string;
    }
  | undefined {
  if (gate === undefined || (!gate.gated && schedules === 0)) return undefined;
  const runs = `${String(schedules)} ${schedules === 1 ? "schedule runs" : "schedules run"}`;
  if (!gate.gated)
    return {
      word: "Ready for schedules",
      tone: "running",
      detail: `${runs} each version you save.`,
    };
  const headGate = gate.runs === gate.head ? gate.gate : "unchecked";
  if (headGate === "ready" || headGate === "carried" || headGate === "legacy")
    return { word: "Ready for schedules", tone: "running", detail: "Schedules run this version." };
  return {
    word: "Not ready for schedules",
    tone: "waiting",
    detail:
      gate.runs === null
        ? "No schedule runs it until you approve a version in Edit template."
        : `Schedules run version ${String(gate.runs)} until you approve version ${String(gate.head)} in Edit template.`,
  };
}
