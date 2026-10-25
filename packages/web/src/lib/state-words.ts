import type { ProjectState } from "@app/kernel/pipeline.js";
import { heldRun, heldStateWord, projectStateWords } from "@app/slices/admission/state-words.js";
import type { Tone } from "@/components/kit/status";

// One word per state, everywhere a state is shown: Projects, the calendar, the project
// header, Home and the run's steps. A held project reads as what it waits for (projectStateOf);
// a screen that knows more (a limit wait, Ready to upload) says that before falling back to
// these. The words are the app's (`slices/admission/state-words.ts`), so the MCP tools say
// the same.

export interface StateLook {
  readonly tone: Tone;
  readonly word: string;
}

export const projectStateLook: Readonly<Record<ProjectState, StateLook>> = {
  running: { tone: "running", word: projectStateWords.running },
  paused: { tone: "waiting", word: projectStateWords.paused },
  pending: { tone: "off", word: projectStateWords.pending },
  failed: { tone: "failed", word: projectStateWords.failed },
  partial: { tone: "waiting", word: projectStateWords.partial },
  done: { tone: "done", word: projectStateWords.done },
  canceled: { tone: "off", word: projectStateWords.canceled },
};

// A project's state with its lamp, in the words the MCP tools say it (`projectStateWord`): a
// held run (`heldRun`) reads as what it waits for, the person (Waiting for your review), an
// External agent (Waiting for the agent), Continue the run (Stopped), its scheduled day
// (Waiting for its day), or nobody once set aside (Kept as is).
export function projectStateOf(project: {
  readonly status: ProjectState;
  readonly progress: number;
  readonly setAside?: boolean | undefined;
  readonly prepared?: boolean | undefined;
  readonly waitingForAgent?: boolean | undefined;
  readonly stopped?: boolean | undefined;
}): StateLook {
  if (!heldRun(project)) return projectStateLook[project.status];
  return { tone: project.setAside === true ? "done" : "waiting", word: heldStateWord(project) };
}

// A failed step that will try again by itself.
export const retryingWord = "Waiting to try again";

export type ScheduleStatus = "active" | "paused" | "completed" | "canceled";

export const scheduleStatusLook: Readonly<Record<ScheduleStatus, StateLook>> = {
  active: { tone: "running", word: "Active" },
  paused: { tone: "waiting", word: "Paused" },
  completed: { tone: "done", word: "Completed" },
  canceled: { tone: "off", word: "Canceled" },
};
