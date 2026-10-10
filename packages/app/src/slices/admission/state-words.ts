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

// What a held run waits for, on a step or on a project: the person's review at a checkpoint,
// an External agent's review, Continue the run once a restart stopped it, its scheduled day,
// or nobody once its leftover steps were set aside on purpose.
export const heldWord = "Waiting for your review";
export const waitingForAgentWord = "Waiting for the agent";
export const stoppedWord = "Stopped";
export const preparedWord = "Prepared";
export const keptAsIsWord = "Kept as is";
export const heldStateWords = [
  heldWord,
  waitingForAgentWord,
  stoppedWord,
  preparedWord,
  keptAsIsWord,
] as const;
export type HeldStateWord = (typeof heldStateWords)[number];

// `prepared`, `waitingForAgent` and `stopped` are the server's (`reviews/holds.ts`
// projectHolds).
interface ProjectStanding {
  readonly status: ProjectState;
  readonly progress: number;
  readonly setAside?: boolean | undefined;
  readonly prepared?: boolean | undefined;
  readonly waitingForAgent?: boolean | undefined;
  readonly stopped?: boolean | undefined;
}

type Holds = Pick<ProjectStanding, "setAside" | "prepared" | "waitingForAgent" | "stopped">;

// A run that ran and is held: a waiting project with some of its run done (`progress` is the
// run's share done, `progressOf`), or one stopped or parked on an agent's review before it got
// going. One with none done that waits for neither is Queued, waiting its turn.
export function heldRun(project: ProjectStanding): boolean {
  return (
    project.status === "pending" &&
    (project.progress > 0 || project.stopped === true || project.waitingForAgent === true)
  );
}

// Whether the person is the one it waits for (to approve, or to Continue the run): not when it
// is Kept as is, waits for an agent or for its scheduled day.
function heldForPerson(project: Holds): boolean {
  return project.setAside !== true && project.waitingForAgent !== true && project.prepared !== true;
}

export function heldStateWord(project: Holds): HeldStateWord {
  if (project.setAside === true) return keptAsIsWord;
  if (project.waitingForAgent === true) return waitingForAgentWord;
  if (project.stopped === true) return stoppedWord;
  if (project.prepared === true) return preparedWord;
  return heldWord;
}

// A waiting run parked on an External agent's review, which goes on by itself once the agent
// answers. Kept as is wins, as in `heldStateWord`.
export function parkedOnAgent(
  project: Pick<ProjectStanding, "status" | "setAside" | "waitingForAgent">,
): boolean {
  return (
    project.status === "pending" && project.waitingForAgent === true && project.setAside !== true
  );
}

// Started and waiting its turn: pending with none of its run done, not stopped and not parked
// on an agent's review. Projects' Queued filter and Home's queued line under Running now.
export function queuedRun(project: ProjectStanding): boolean {
  return project.status === "pending" && !heldRun(project);
}

// An uploaded project already reads "done" from the projects route (`uploadedAndSettled`).
export function projectStateWord(project: ProjectStanding): string {
  return heldRun(project) ? heldStateWord(project) : projectStateWords[project.status];
}

// A run that ran and now waits for the person: Home's Needs you, the Projects "Needs you"
// filter and its waiting-first sort.
export function waitsForPerson(project: ProjectStanding): boolean {
  return heldRun(project) && heldForPerson(project);
}
