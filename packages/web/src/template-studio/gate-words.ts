import type { ScheduleTemplateGate } from "@app/slices/schedules/schema.js";
import type { BadgeTone } from "@/components/kit/status";

// The words for which version of a template its schedules run, shared by the Schedules screen,
// Library → Templates and Create. A version saved before the studio keeps running ("Not checked
// in the studio"); a newer one waits until it is marked ready.

export type TemplateGate = ScheduleTemplateGate;

// The schedule's own line: what its next run uses.
export function scheduleGateWords(gate: TemplateGate): {
  readonly text: string;
  readonly tone: BadgeTone;
} {
  if (gate.runs === null)
    return {
      text: "Runs nothing yet: no version is marked ready",
      tone: "waiting",
    };
  const newer = gate.head > gate.runs ? ` · version ${String(gate.head)} not ready yet` : "";
  const checked = gate.gate === "legacy" ? " · Not checked in the studio" : "";
  return {
    text: `Runs version ${String(gate.runs)}${checked}${newer}`,
    tone: newer === "" ? "neutral" : "info",
  };
}

// The template's badge: whether its newest version is ready for schedules.
export function templateGateBadge(gate: TemplateGate): {
  readonly word: string;
  readonly tone: BadgeTone;
  readonly detail: string;
} {
  const headGate = gate.runs === gate.head ? gate.gate : "unchecked";
  if (headGate === "ready" || headGate === "carried")
    return { word: "Ready", tone: "running", detail: "Schedules run this version." };
  if (headGate === "legacy")
    return {
      word: "Not checked in the studio",
      tone: "neutral",
      detail: "Saved before the studio: schedules keep running it.",
    };
  return {
    word: "Not ready",
    tone: "waiting",
    detail:
      gate.runs === null
        ? "Schedules don't run it until you open its studio and press Mark ready."
        : `Schedules run version ${String(gate.runs)} until you mark version ${String(gate.head)} ready in its studio.`,
  };
}
