import { type ProjectState, projectStates } from "@app/kernel/pipeline.js";

// "While you were away": what the runs did while no Slopify tab was open or in view. The page
// keeps a snapshot of every project's state (in this browser) while it is seen; on return the
// projects as they are now are compared with it.

export interface AwaySnapshot {
  readonly at: number;
  readonly states: Readonly<Record<string, ProjectState>>;
}

export interface AwaySummary {
  readonly finished: number;
  readonly failed: number;
  readonly waiting: number;
}

const key = "slopify.away.snapshot";
// Shorter absences than this are a glance at another tab, not time away.
export const awayAfterMs = 2 * 60_000;

const going: ReadonlySet<ProjectState> = new Set(["running", "pending", "paused"]);

export function awaySummary(
  before: AwaySnapshot,
  now: readonly { readonly id: string; readonly status: ProjectState }[],
): AwaySummary {
  let finished = 0;
  let failed = 0;
  let waiting = 0;
  for (const project of now) {
    const was = before.states[project.id];
    if (was === project.status) continue;
    // A project started while away (a schedule's) counts once it ended.
    const counts = was === undefined || going.has(was);
    if (!counts) continue;
    if (project.status === "done" || project.status === "partial") finished += 1;
    else if (project.status === "failed") failed += 1;
    // Stopped to wait for a review or a decision.
    else if (project.status === "pending" && was === "running") waiting += 1;
  }
  return { finished, failed, waiting };
}

export function awayMessage(summary: AwaySummary): string | undefined {
  const parts = [
    summary.finished > 0
      ? `${String(summary.finished)} ${summary.finished === 1 ? "run finished" : "runs finished"}`
      : undefined,
    summary.failed > 0
      ? `${String(summary.failed)} ${summary.failed === 1 ? "run failed" : "runs failed"}`
      : undefined,
    summary.waiting > 0
      ? `${String(summary.waiting)} ${summary.waiting === 1 ? "run waits" : "runs wait"} for you`
      : undefined,
  ].filter((part) => part !== undefined);
  if (parts.length === 0) return undefined;
  return `While you were away: ${parts.join(", ")}.`;
}

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
      stored.states !== null
    )
      return {
        at: stored.at,
        states: Object.fromEntries(
          Object.entries(stored.states).flatMap(([id, state]) => {
            const known = projectStates.find((one) => one === state);
            return known === undefined ? [] : [[id, known]];
          }),
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
