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
// Made ahead by its schedule (Make ahead): everything but the video is made, and the video is
// put together on the run's day.
export const preparedWord = "Waiting for its day";
export const keptAsIsWord = "Kept as is";
// A running run whose only movement is a step that failed on something time can fix (a rate
// limit, a dropped connection) and runs again by itself at a set time.
export const retryingWord = "Waiting to try again";
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
  // The checkpoints holding the run now (`reviews/holds.ts`): one reached holds a run that made
  // nothing yet, every step before it supplied by the person.
  readonly holding?: readonly unknown[] | undefined;
  // When a step waiting to run again by itself tries, while nothing else runs (`retryingAt`).
  readonly retryAt?: string | undefined;
}

type Holds = Pick<ProjectStanding, "setAside" | "prepared" | "waitingForAgent" | "stopped">;

// A run that ran and is held: a waiting project with some of its run done (`progress` is the
// run's share done, `progressOf`) or a step failed, one a checkpoint holds (it reached it with
// every step before it supplied), or one stopped or parked on an agent's review before it got
// going. One with none done that waits for none of these is Queued, waiting its turn.
export function heldRun(project: ProjectStanding): boolean {
  return (
    project.status === "pending" &&
    (project.progress > 0 ||
      project.stepFailed === true ||
      (project.holding?.length ?? 0) > 0 ||
      project.stopped === true ||
      project.waitingForAgent === true)
  );
}

// When the run tries again by itself: the soonest wait of a step that failed on something time
// can fix, while no step runs. Undefined while one runs (the run reads Running) or none waits.
export function retryingAt(
  stages: readonly { readonly state: StageState; readonly retryAt?: string | null | undefined }[],
): string | undefined {
  if (stages.some((stage) => stage.state === "running")) return undefined;
  const waits = stages.flatMap((stage) =>
    stage.state === "pending" && typeof stage.retryAt === "string" ? [stage.retryAt] : [],
  );
  return waits.toSorted()[0];
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

// A settled project already reads "done" from the projects route (`settledProjects`). A
// running run that only waits to try a step again says so.
export function projectStateWord(project: ProjectStanding): string {
  if (heldRun(project)) return heldStateWord(project);
  if (retryingRun(project)) return retryingWord;
  return projectStateWords[project.status];
}

// Running, and the one thing it does is wait to try a failed step again at a set time.
export function retryingRun(project: Pick<ProjectStanding, "status" | "retryAt">): boolean {
  return project.status === "running" && project.retryAt !== undefined;
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

// Everything a run asks of the person, the one set Home's Needs you lists and the Projects
// "Needs you" filter holds: a decision (approve, Continue the run, resume) or a failure to fix.
export function needsYou(project: ProjectStanding): boolean {
  return waitsForPerson(project) || failedRun(project);
}
