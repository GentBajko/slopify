import { heldWord, stoppedWord } from "@app/slices/admission/state-words.js";
import type { Calendar } from "@app/slices/schedules/schema.js";
import type { Tone } from "@/components/kit/status";
import { projectStateOf } from "@/lib/state-words";
import { limitWaitLine } from "@/project/limit-wait";

// How a project reads on the calendar: what it needs from the person, whether its video is
// ready to upload, or that it waits for a CLI's limits - before its plain state. The server
// decides each (`slices/schedules/agenda.ts`), with the same rules as Home.

export type CalendarProject = Calendar["projects"][number];

export interface ProjectLook {
  readonly tone: Tone;
  readonly word: string;
  // What pressing the row's action does: open the project to act there, or prepare the upload.
  readonly action?: { readonly kind: "open"; readonly label: string } | { readonly kind: "upload" };
}

export function projectLook(
  project: CalendarProject,
  clock?: (iso: string) => string,
): ProjectLook {
  switch (project.needs) {
    case "failed":
      return { tone: "failed", word: "Failed", action: { kind: "open", label: "Open to fix" } };
    case "paused":
      return {
        tone: "waiting",
        word: "Paused",
        action: { kind: "open", label: "Open to continue" },
      };
    case "stopped":
      return {
        tone: "waiting",
        word: stoppedWord,
        action: { kind: "open", label: "Open to continue" },
      };
    case "review":
      return {
        tone: "waiting",
        word: heldWord,
        action: { kind: "open", label: "Open to review" },
      };
    case undefined:
      break;
  }
  const waiting = limitWaitLine(project.limitWaits, clock);
  if (waiting !== undefined) return { tone: "waiting", word: waiting };
  if (project.readyToUpload === true)
    return { tone: "done", word: "Ready to upload", action: { kind: "upload" } };
  return projectStateOf({ ...project, status: project.state });
}

// What a project asks of the person, counted as Home's Needs you counts it: what it needs, and a
// step failed beside its wait as one more item.
function asks(project: CalendarProject): number {
  return (project.needs === undefined ? 0 : 1) + (project.stepFailed === true ? 1 : 0);
}

// "2 waiting for you · 1 ready to upload".
export function attentionMeta(projects: readonly CalendarProject[]): string {
  const needs = projects.reduce((total, project) => total + asks(project), 0);
  const ready = projects.filter((project) => asks(project) === 0).length;
  return [
    needs === 0 ? undefined : `${String(needs)} waiting for you`,
    ready === 0 ? undefined : `${String(ready)} ready to upload`,
  ]
    .filter((part) => part !== undefined)
    .join(" · ");
}

// The projects that ask something of the person, then the ones ready to upload, as the
// calendar's "Needs you" list shows them.
export function needingAttention(projects: readonly CalendarProject[]): readonly CalendarProject[] {
  return [
    ...projects.filter((project) => asks(project) > 0),
    ...projects.filter((project) => asks(project) === 0 && project.readyToUpload === true),
  ];
}
