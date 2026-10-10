import type { ProjectState, StageState } from "../../kernel/pipeline.js";

// One word per state: the MCP tools say a project's and a step's state with these, and the
// web's lists and pages (`web/src/lib/state-words.ts`) take their base words from here. The
// web still derives a waiting project's word on its own (Projects says "Waiting for you", the
// project header "Queued"), so those can differ from projectStateWord's. Browser-safe.

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

// An uploaded project already reads "done" from the projects route (`uploadedAndSettled`).
// `progress` is the run's share done (`progressOf`): a waiting project with none is Queued,
// one with some is held, as Projects tells them apart (`isWaiting`).
export function projectStateWord(project: {
  readonly status: ProjectState;
  readonly progress: number;
  readonly setAside?: boolean | undefined;
  readonly prepared?: boolean | undefined;
}): string {
  if (project.status === "pending" && project.progress > 0) {
    if (project.setAside === true) return keptAsIsWord;
    if (project.prepared === true) return preparedWord;
    return heldWord;
  }
  return projectStateWords[project.status];
}
