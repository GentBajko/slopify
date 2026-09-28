import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { type StageKind, stageKinds } from "../../kernel/pipeline.js";
import { currentRevisionId } from "../revisions/repo.js";

// How long a project took, from the attempts its steps made. Two numbers, because a run can
// sit for hours on a review or a plan limit: start to finish (the first attempt starting to
// the last one ending) and working (the time some attempt was running; steps that run side by
// side count once). A run is one revision's work: each save that remakes something starts a
// new one. The latest run is the current revision's, or, when that one reused everything and
// ran nothing, the last revision that ran something; `current` says which.

export interface RunTiming {
  readonly current: boolean;
  readonly startedAt: string;
  // Null while a step of the run still runs.
  readonly endedAt: string | null;
  readonly spanMs: number;
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
  const start = Math.min(...intervals.map((one) => one[0]));
  const end = Math.max(...intervals.map((one) => one[1]));
  return {
    current,
    startedAt: new Date(start).toISOString(),
    endedAt: running ? null : new Date(end).toISOString(),
    spanMs: end - start,
    workingMs: coveredMs(intervals),
  };
}
