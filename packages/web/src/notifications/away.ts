import { type ProjectState, projectStates } from "@app/kernel/pipeline.js";
import type { ProjectListing } from "@app/slices/admission/model.js";
import { waitsForPerson } from "@app/slices/admission/state-words.js";

// "While you were away": what the runs did while no Slopify tab was open or in view. The page
// keeps a snapshot of every project's state (in this browser) while it is seen; on return the
// projects as they are now are compared with it.

export interface AwaySnapshot {
  readonly at: number;
  readonly states: Readonly<Record<string, ProjectState>>;
  // The projects that waited for the person when it was taken (`waitsForPerson`, the rule of
  // Home's Needs you), each with the points it waited at (`waitPoints`, comma-joined): one held
  // for an agent or its day waits for nobody.
  readonly waiting: Readonly<Record<string, string>>;
  // Each step failed while its run still read by a wait (`stepFailed`), by its project and its
  // identity (`stepFailures`): `${projectId} ${failureId}`.
  readonly stepFailures: readonly string[];
}

type Standing = Pick<
  ProjectListing,
  | "id"
  | "status"
  | "progress"
  | "setAside"
  | "prepared"
  | "waitingForAgent"
  | "stopped"
  | "holding"
  | "stepFailed"
  | "stepFailures"
  | "pauseCount"
  | "stopCount"
>;

export interface AwaySummary {
  readonly finished: number;
  readonly failed: number;
  readonly waiting: number;
  // Steps that failed while their run still waits on another ("Step failed"): not over yet.
  readonly stepsFailed: number;
}

const key = "slopify.away.snapshot";
// Shorter absences than this are a glance at another tab, not time away.
export const awayAfterMs = 2 * 60_000;

export function snapshotOf(at: number, now: readonly Standing[]): AwaySnapshot {
  return {
    at,
    states: Object.fromEntries(now.map((one) => [one.id, one.status])),
    waiting: Object.fromEntries(
      now.filter(waitsForPerson).map((one) => [one.id, waitPoints(one).join(",")]),
    ),
    stepFailures: now.flatMap(stepFailuresOf),
  };
}

function stepFailuresOf(project: Standing): readonly string[] {
  return project.stepFailed === true
    ? (project.stepFailures ?? []).map((failure) => `${project.id} ${failure}`)
    : [];
}

// Where a run waiting for the person waits: at its latest pause or its latest stop by a restart
// (a Continue and a new pause or stop make it another point), each checkpoint of the person's
// that holds it, or nowhere named.
function waitPoints(project: Standing): readonly string[] {
  if (project.status === "paused") return [`paused@${String(project.pauseCount ?? 0)}`];
  if (project.stopped === true) return [`stopped@${String(project.stopCount ?? 0)}`];
  const at = (project.holding ?? [])
    .filter((hold) => hold.waitsFor === "person")
    .map((hold) => `${hold.checkpointId}:${hold.fingerprint}`);
  return at.length === 0 ? ["held"] : at;
}

// Whether a run waits at a point it did not wait at when the page last looked.
function waitsAnew(before: string | undefined, now: readonly string[]): boolean {
  const seen = before === undefined ? [] : before.split(",");
  return now.some((point) => !seen.includes(point));
}

export function awaySummary(before: AwaySnapshot, now: readonly Standing[]): AwaySummary {
  let finished = 0;
  let failed = 0;
  let waiting = 0;
  let stepsFailed = 0;
  for (const project of now) {
    stepsFailed += stepFailuresOf(project).filter(
      (failure) => !before.stepFailures.includes(failure),
    ).length;
    // A run that ended differently since the page looked: one started while away (a
    // schedule's), or a failed or finished one an agent took up again.
    const changed = before.states[project.id] !== project.status;
    if (changed && (project.status === "done" || project.status === "partial")) finished += 1;
    else if (changed && project.status === "failed") failed += 1;
    // Stopped to wait for a review or a decision since the page last looked, or at another one.
    else if (waitsForPerson(project) && waitsAnew(before.waiting[project.id], waitPoints(project)))
      waiting += 1;
  }
  return { finished, failed, waiting, stepsFailed };
}

export function awayMessage(summary: AwaySummary): string | undefined {
  const parts = [
    summary.finished > 0
      ? `${String(summary.finished)} ${summary.finished === 1 ? "run finished" : "runs finished"}`
      : undefined,
    summary.failed > 0
      ? `${String(summary.failed)} ${summary.failed === 1 ? "run failed" : "runs failed"}`
      : undefined,
    summary.stepsFailed > 0
      ? `${String(summary.stepsFailed)} ${summary.stepsFailed === 1 ? "step failed" : "steps failed"} beside a wait`
      : undefined,
    summary.waiting > 0
      ? `${String(summary.waiting)} ${summary.waiting === 1 ? "run waits" : "runs wait"} for you`
      : undefined,
  ].filter((part) => part !== undefined);
  if (parts.length === 0) return undefined;
  return `While you were away: ${parts.join(", ")}.`;
}

// A snapshot kept before it said who waited, on what, and whose step failed reads as none: every
// run waiting then would be told as news.
export function readSnapshot(): AwaySnapshot | undefined {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(key) ?? "null");
    if (
      typeof stored === "object" &&
      stored !== null &&
      "at" in stored &&
      typeof stored.at === "number" &&
      "states" in stored &&
      typeof stored.states === "object" &&
      stored.states !== null &&
      "waiting" in stored &&
      typeof stored.waiting === "object" &&
      stored.waiting !== null &&
      !Array.isArray(stored.waiting) &&
      "stepFailures" in stored &&
      Array.isArray(stored.stepFailures)
    )
      return {
        at: stored.at,
        states: Object.fromEntries(
          Object.entries(stored.states).flatMap(([id, state]) => {
            const known = projectStates.find((one) => one === state);
            return known === undefined ? [] : [[id, known]];
          }),
        ),
        waiting: Object.fromEntries(
          Object.entries(stored.waiting).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
        ),
        stepFailures: stored.stepFailures.filter(
          (failure): failure is string => typeof failure === "string",
        ),
      };
  } catch {
    // Unreadable storage or a damaged value: no summary this time.
  }
  return undefined;
}

export function writeSnapshot(snapshot: AwaySnapshot): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(snapshot));
  } catch {
    // Without storage there is no summary on return; nothing else depends on it.
  }
}
