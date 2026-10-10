import type { ProjectState, StageState } from "../../kernel/pipeline.js";

// One word per state, everywhere a state is said: the MCP tools, and the web's lists and pages
// (`web/src/lib/state-words.ts` projectStateOf, Home's Needs you, the project's next action).
// Browser-safe.

// A project that has not started yet is Queued: it waits its turn, not for the person.
export const projectStateWords: Readonly<Record<ProjectState, string>> = {
  running: "Running",
  paused: "Paused",
  pending: "Queued",
  failed: "Failed",
  partial: "Done with problems",
  done: "Done",
  canceled: "Canceled",
};

// A step of a run. A skipped step is one the run's settings turned off.
export const stageStateWords: Readonly<Record<StageState, string>> = {
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
// A project whose leftover steps were set aside on purpose.
export const keptAsIsWord = "Kept as is";
// A project a schedule made ahead, held before its video until its day.
export const preparedWord = "Prepared";

interface ProjectStanding {
  readonly status: ProjectState;
  readonly progress: number;
  readonly setAside?: boolean | undefined;
  readonly prepared?: boolean | undefined;
}

// What a held project waits for: nobody once it is Kept as is, its scheduled day once a
// schedule prepared it, otherwise the person's review.
export function heldStateWord(project: Pick<ProjectStanding, "setAside" | "prepared">): string {
  if (project.setAside === true) return keptAsIsWord;
  if (project.prepared === true) return preparedWord;
  return heldWord;
}

// An uploaded project already reads "done" from the projects route (`uploadedAndSettled`).
// `progress` is the run's share done (`progressOf`): a waiting project with none is Queued,
// one with some is held.
export function projectStateWord(project: ProjectStanding): string {
  return project.status === "pending" && project.progress > 0
    ? heldStateWord(project)
    : projectStateWords[project.status];
}

// A run that ran and now waits for the person: Home's Needs you, the Projects "Needs you"
// filter and its waiting-first sort, as needs_attention reads it.
export function waitsForPerson(project: ProjectStanding): boolean {
  return projectStateWord(project) === heldWord;
}
