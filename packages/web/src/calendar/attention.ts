import type { ProjectListing } from "@app/slices/admission/model.js";
import {
  failedRun,
  heldWord,
  stoppedWord,
  waitsForPerson,
} from "@app/slices/admission/state-words.js";
import type { Calendar } from "@app/slices/schedules/schema.js";
import type { Tone } from "@/components/kit/status";
import { isReadyToUpload } from "@/home/ready";
import { plural } from "@/lib/format";
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
  // A video made with a failed step reads Done with problems, as on Home, Projects and its page,
  // and is still ready to copy for YouTube Studio.
  if (project.readyToUpload === true)
    return project.state === "partial"
      ? { ...projectStateOf({ ...project, status: "partial" }), action: { kind: "upload" } }
      : { tone: "done", word: "Ready to upload", action: { kind: "upload" } };
  return projectStateOf({ ...project, status: project.state });
}

// The line above the weeks, counted from the same projects by the same rules as Home, so the two
// screens give one number: Needs you's decisions and failures, and the finished videos ready to
// upload ("1 decision · 1 failed · 2 ready to upload"). Undefined when there is nothing to say.
export function attentionLine(
  projects: readonly ProjectListing[],
): { readonly text: string; readonly items: number } | undefined {
  const decisions = projects.filter(waitsForPerson).length;
  const failed = projects.filter(failedRun).length;
  const ready = projects.filter(isReadyToUpload).length;
  const items = decisions + failed + ready;
  if (items === 0) return undefined;
  const text = [
    decisions === 0 ? undefined : plural(decisions, "decision", "decisions"),
    failed === 0 ? undefined : `${String(failed)} failed`,
    ready === 0 ? undefined : `${String(ready)} ready to upload`,
  ]
    .filter((part) => part !== undefined)
    .join(" · ");
  return { text, items };
}
