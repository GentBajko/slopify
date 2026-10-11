import type { ProjectState, StageState } from "../../kernel/pipeline.js";
import { type StageStanding, waitsForAnswer } from "../../kernel/runner/graph.js";

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
  readonly stepFailed?: boolean | undefined;
  readonly setAside?: boolean | undefined;
  readonly prepared?: boolean | undefined;
  readonly waitingForAgent?: boolean | undefined;
  readonly stopped?: boolean | undefined;
}

type Holds = Pick<ProjectStanding, "setAside" | "prepared" | "waitingForAgent" | "stopped">;

// A run that ran and is held: a waiting project with some of its run done (`progress` is the
// run's share done, `progressOf`) or a step failed, or one stopped or parked on an agent's review
// before it got going. One with none done that waits for neither is Queued, waiting its turn.
export function heldRun(project: ProjectStanding): boolean {
  return (
    project.status === "pending" &&
    (project.progress > 0 ||
      project.stepFailed === true ||
      project.stopped === true ||
      project.waitingForAgent === true)
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

// Going on by itself: running, or parked on an agent's review. Home's Running now and the
// Projects Running filter.
export function runningNow(
  project: Pick<ProjectStanding, "status" | "setAside" | "waitingForAgent">,
): boolean {
  return project.status === "running" || parkedOnAgent(project);
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

// A run that ran and now waits for the person, held or paused: Home's Needs you, the Projects
// "Needs you" filter and its waiting-first sort.
export function waitsForPerson(project: ProjectStanding): boolean {
  return project.status === "paused" || (heldRun(project) && heldForPerson(project));
}

// A step failed and the run reads Pending by the wait beside it, nothing else running
// (`derive`): what `stepFailed` says on the Projects list, a project's page and the calendar.
// Unlike `stepFailedWhileWaiting`, false while a third step still runs.
export function readsByWaitBesideFailure(
  status: ProjectState,
  stages: readonly { readonly state: StageState }[],
): boolean {
  return status === "pending" && stages.some((stage) => stage.state === "failed");
}

// A step failed while another waits for the agent, the person or its day (`waitsForAnswer`),
// whether or not a third still runs: what "Step failed" is told for (`notifications/rules.ts`
// runNotices) and While you were away counts. A failed step in a run with nothing waiting is
// told by the run's own end notice. Unlike `readsByWaitBesideFailure`, true while a third step
// still runs.
export function stepFailedWhileWaiting(
  status: ProjectState,
  stages: readonly StageStanding[],
): boolean {
  return (
    (status === "running" || status === "pending") &&
    stages.some((stage) => stage.state === "failed") &&
    waitsForAnswer(stages)
  );
}

// A run listed as failed, on Home's Needs you and under the Projects Failed filter: it failed, or
// a step failed while the run still waits for the agent or the person (`stepFailed`).
export function failedRun(project: Pick<ProjectStanding, "status" | "stepFailed">): boolean {
  return project.status === "failed" || project.stepFailed === true;
}
