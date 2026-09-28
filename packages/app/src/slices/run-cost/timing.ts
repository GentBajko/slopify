import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { type StageKind, stageKinds } from "../../kernel/pipeline.js";
import { currentRevisionId } from "../revisions/repo.js";

// How long a project's steps spent working, from the attempts they made: only the time some
// attempt was running, with steps side by side counted once, so waiting on a review, a plan
// limit or a pause never counts. A run is one revision's work: each save that remakes something starts a
// new one. The latest run is the current revision's, or, when that one reused everything and
// ran nothing, the last revision that ran something; `current` says which.

export interface RunTiming {
  readonly current: boolean;
  // Whether a step of the run runs now, so its working time is still growing.
  readonly running: boolean;
  readonly workingMs: number;
}

export interface ProjectTiming {
  readonly run: RunTiming | null;
  // Every run's working time together, and each stage's.
  readonly workingMs: number;
  readonly byStage: ReadonlyMap<StageKind, number>;
}

type Interval = readonly [start: number, end: number];

const attemptRow = z.object({
  kind: z.enum(stageKinds),
  revision_id: z.string().nullable(),
  started_at: z.string(),
  ended_at: z.string().nullable(),
  work_state: z.string().nullable(),
});

// The time any of the intervals covers.
export function coveredMs(intervals: readonly Interval[]): number {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  let total = 0;
  let open: [number, number] | undefined;
  for (const [start, end] of sorted) {
    if (open === undefined || start > open[1]) {
      if (open !== undefined) total += open[1] - open[0];
      open = [start, end];
    } else open[1] = Math.max(open[1], end);
  }
  return open === undefined ? total : total + open[1] - open[0];
}

export function projectTiming(db: DatabaseSync, projectId: string, now: number): ProjectTiming {
  const rows = db
    .prepare(
      `SELECT s.kind AS kind, a.revision_id AS revision_id, a.started_at AS started_at,
         a.ended_at AS ended_at, w.state AS work_state
       FROM attempts a JOIN stages s ON s.id = a.stage_id
       LEFT JOIN revision_work w ON w.id = a.work_id
       WHERE s.project_id = ?`,
    )
    .all(projectId)
    .map((row) => attemptRow.parse(row));
  const head = currentRevisionId(db, projectId);
  const all: Interval[] = [];
  const runs = new Map<string, { intervals: Interval[]; running: boolean; last: number }>();
  const stages = new Map<StageKind, Interval[]>();
  for (const row of rows) {
    const start = Date.parse(row.started_at);
    if (!Number.isFinite(start)) continue;
    // An attempt with no end is still running only while its step is; one a crash left open
    // counts as nothing, so no clock ticks on forever.
    const live = row.ended_at === null && row.work_state === "running";
    const end = row.ended_at === null ? (live ? now : start) : Date.parse(row.ended_at);
    if (!Number.isFinite(end) || end < start) continue;
    const interval: Interval = [start, end];
    all.push(interval);
    stages.set(row.kind, [...(stages.get(row.kind) ?? []), interval]);
    if (row.revision_id !== null) {
      const run = runs.get(row.revision_id) ?? { intervals: [], running: false, last: start };
      run.intervals.push(interval);
      run.running ||= live;
      run.last = Math.max(run.last, start);
      runs.set(row.revision_id, run);
    }
  }
  const latest =
    (head === undefined ? undefined : runs.get(head)) ??
    [...runs.values()].sort((a, b) => b.last - a.last)[0];
  const byStage = new Map<StageKind, number>();
  for (const [kind, intervals] of stages) byStage.set(kind, coveredMs(intervals));
  return {
    run:
      latest === undefined
        ? null
        : runOf(latest.intervals, latest.running, latest === runs.get(head ?? "")),
    workingMs: coveredMs(all),
    byStage,
  };
}

function runOf(intervals: readonly Interval[], running: boolean, current: boolean): RunTiming {
  return { current, running, workingMs: coveredMs(intervals) };
}
