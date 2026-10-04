import type { ProjectState, StageState } from "@app/kernel/pipeline.js";
import type { Tone } from "@/components/kit/status";

// One word per state, everywhere a state is shown: Projects, the calendar, the project
// header, Home and the run's steps. A screen that knows more (a project waiting for your
// review, a limit wait, Ready to upload) says that instead, before falling back to these.

export interface StateLook {
  readonly tone: Tone;
  readonly word: string;
}

// A project that has not started yet is Queued: it waits its turn, not for the person.
// "Waiting" is kept for a project that waits on someone or something named.
export const projectStateLook: Readonly<Record<ProjectState, StateLook>> = {
  running: { tone: "running", word: "Running" },
  paused: { tone: "waiting", word: "Paused" },
  pending: { tone: "off", word: "Queued" },
  failed: { tone: "failed", word: "Failed" },
  partial: { tone: "waiting", word: "Done with problems" },
  done: { tone: "done", word: "Done" },
  canceled: { tone: "off", word: "Canceled" },
};

// A project whose leftover steps were set aside on purpose.
export const keptAsIs: StateLook = { tone: "done", word: "Kept as is" };

// A step of a run. A skipped step is one the run's settings turned off.
export const stageStateWord: Readonly<Record<StageState, string>> = {
  pending: "Not started",
  running: "Running",
  done: "Done",
  provided: "Provided",
  failed: "Failed",
  canceled: "Canceled",
  skipped: "Off",
};

// Work held at a checkpoint until the person approves it, on a step or on a project.
export const heldWord = "Waiting for your review";

// A failed step that will try again by itself.
export const retryingWord = "Waiting to try again";

export type ScheduleStatus = "active" | "paused" | "completed" | "canceled";

export const scheduleStatusLook: Readonly<Record<ScheduleStatus, StateLook>> = {
  active: { tone: "running", word: "Active" },
  paused: { tone: "waiting", word: "Paused" },
  completed: { tone: "done", word: "Completed" },
  canceled: { tone: "off", word: "Canceled" },
};
