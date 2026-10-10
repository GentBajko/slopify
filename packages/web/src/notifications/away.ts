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
  // The projects with a step failed while the run still read by a wait (`stepFailed`).
  readonly stepFailed: readonly string[];
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
> & {
  // When the project last changed: a pause and a Continue each set it (`setProjectPaused`).
  readonly updatedAt?: string | undefined;
};

export interface AwaySummary {
  readonly finished: number;
  readonly failed: number;
  readonly waiting: number;
  // Runs whose step failed while another still waits ("Step failed"): not over yet.
  readonly stepFailed: number;
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
    stepFailed: now.filter((one) => one.stepFailed === true).map((one) => one.id),
  };
}

// Where a run waiting for the person waits: paused since its last change (a Continue and a new
// pause make it another point), stopped at how far it got (moved on and stopped again, it got
// further), each checkpoint of the person's that holds it, or nowhere named.
function waitPoints(project: Standing): readonly string[] {
  if (project.status === "paused") return [`paused@${project.updatedAt ?? ""}`];
  if (project.stopped === true) return [`stopped@${String(project.progress)}`];
  const at = (project.holding ?? [])
    .filter((hold) => hold.waitsFor === "person")
    .map((hold) => `${hold.checkpointId}:${hold.fingerprint}`);
  return at.length === 0 ? ["held"] : at;
}

// Whether a run waits at a point it did not wait at when the page last looked. A snapshot kept
// before points carried their change marker said only "paused" or "stopped".
function waitsAnew(before: string | undefined, now: readonly string[]): boolean {
  const seen = before === undefined ? [] : before.split(",");
  return now.some((point) => !seen.some((old) => point === old || point.startsWith(`${old}@`)));
}

export function awaySummary(before: AwaySnapshot, now: readonly Standing[]): AwaySummary {
  let finished = 0;
  let failed = 0;
  let waiting = 0;
  let stepFailed = 0;
  for (const project of now) {
    if (project.stepFailed === true && !before.stepFailed.includes(project.id)) stepFailed += 1;
    // A run that ended differently since the page looked: one started while away (a
    // schedule's), or a failed or finished one an agent took up again.
    const changed = before.states[project.id] !== project.status;
    if (changed && (project.status === "done" || project.status === "partial")) finished += 1;
    else if (changed && project.status === "failed") failed += 1;
    // Stopped to wait for a review or a decision since the page last looked, or at another one.
    else if (waitsForPerson(project) && waitsAnew(before.waiting[project.id], waitPoints(project)))
      waiting += 1;
  }
  return { finished, failed, waiting, stepFailed };
}

export function awayMessage(summary: AwaySummary): string | undefined {
  const parts = [
    summary.finished > 0
      ? `${String(summary.finished)} ${summary.finished === 1 ? "run finished" : "runs finished"}`
      : undefined,
    summary.failed > 0
      ? `${String(summary.failed)} ${summary.failed === 1 ? "run failed" : "runs failed"}`
      : undefined,
    summary.stepFailed > 0
      ? `${String(summary.stepFailed)} ${summary.stepFailed === 1 ? "run had a step fail" : "runs had a step fail"}`
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
      "stepFailed" in stored &&
      Array.isArray(stored.stepFailed)
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
        stepFailed: stored.stepFailed.filter((id): id is string => typeof id === "string"),
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
