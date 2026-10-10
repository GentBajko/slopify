import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { StageKind } from "../../kernel/pipeline.js";
import {
  derive,
  type StageProgress,
  satisfied,
  deps as stageDeps,
} from "../../kernel/runner/graph.js";
import { liveProject, stageStandingsByProject } from "../admission/repo.js";
import type { CheckpointStage } from "../checkpoints/model.js";
import { checkpointStageSchema } from "../checkpoints/schema.js";
import { heldForItsDay } from "../schedules/prepare.js";
import { uploadedAndSettled } from "../uploads/repo.js";
import { projectsWaitingOnAgents } from "./external-repo.js";

// What a held run waits for when it isn't the person: the one rule the Projects list, a
// project's page, the calendar, Home and the MCP tools read (`admission/state-words.ts`).
export interface ProjectHolds {
  // Prepared ahead by a schedule and held only by the schedule's own Before Video hold: it
  // waits for its day. Any other checkpoint still to approve is the person's, prepared or not.
  readonly prepared: ReadonlySet<string>;
  // Parked on a review an External agent answers, with no checkpoint of the person's reached
  // and no other step held for Continue the run: it goes on by itself once the agent answers
  // or the review passes at its deadline.
  readonly waitingForAgent: ReadonlySet<string>;
  // Stopped before it finished, as a restart leaves a run: nothing moves it on but Continue the
  // run, no checkpoint of the person's holds it and no agent's review alone. A project's page
  // offers Continue the run for exactly these (`resumable`).
  readonly stopped: ReadonlySet<string>;
  // Each project's checkpoints that hold its run now, their stage's inputs made: the person's
  // to approve, or a schedule's own Before Video hold waiting for its day. One not reached yet
  // holds nothing, and a stopped run waits for Continue the run before any day.
  readonly holding: ReadonlyMap<string, readonly CheckpointHold[]>;
}

export interface CheckpointHold {
  readonly checkpointId: string;
  readonly stage: CheckpointStage;
  readonly waitsFor: "person" | "day";
  // What approving it names (`approve_checkpoint`), and since when it was set.
  readonly revisionId: string;
  readonly fingerprint: string;
  readonly since: string;
}

const gateRow = z.object({
  project_id: z.string(),
  checkpoint_id: z.string(),
  stage: checkpointStageSchema,
  revision_id: z.string(),
  fingerprint: z.string(),
  created_at: z.string(),
  own: z.number(),
});
const projectRow = z.object({ project_id: z.string() });

// Every project's holds, or one project's alone when `projectId` is given. A caller that has
// already read the stage standings (`stageStandingsByProject`) passes them; one that lists
// what it can read passes `skip`, given each checkpoint row that can't be read instead of
// failing them all.
export function projectHolds(
  db: DatabaseSync,
  scope: {
    readonly projectId?: string | undefined;
    readonly standings?: ReadonlyMap<string, readonly StageProgress[]> | undefined;
    readonly skip?: ((value: unknown, error: unknown) => void) | undefined;
  } = {},
): ProjectHolds {
  const { projectId } = scope;
  const onlyOne = projectId === undefined ? "" : " AND c.project_id=?";
  const gateSql = `SELECT c.project_id, c.checkpoint_id, c.stage, c.revision_id, c.fingerprint, c.created_at, (c.stage='video' AND ${heldForItsDay("c")}) AS own
       FROM review_checkpoints c
       JOIN project_heads h ON h.project_id=c.project_id AND h.revision_id=c.revision_id
       WHERE c.state IN ('held','pending-review') AND c.approved_at IS NULL AND ${liveProject("c", "project_id")}${onlyOne}`;
  const scoped = projectId === undefined ? [] : [projectId];
  const { skip } = scope;
  const gates = db
    .prepare(gateSql)
    .all(...scoped)
    .flatMap((row) => {
      if (skip === undefined) return [gateRow.parse(row)];
      const gate = gateRow.safeParse(row);
      if (gate.success) return [gate.data];
      skip(row, gate.error);
      return [];
    });
  const standings = scope.standings ?? stageStandingsByProject(db, projectId);
  // A checkpoint holds the run once the stages its step needs are made; before that the run
  // is held by whatever those stages wait on.
  const reached = (project: string, stage: StageKind): boolean =>
    stageDeps[stage].every((dependency) => {
      const standing = standings.get(project)?.find((made) => made.kind === dependency);
      return standing === undefined || satisfied(standing.state);
    });
  const theirs = new Set<string>();
  const reachedTheirs = new Set<string>();
  const holding = new Map<string, CheckpointHold[]>();
  for (const gate of gates) {
    const own = gate.own === 1;
    if (!own) theirs.add(gate.project_id);
    if (!reached(gate.project_id, gate.stage)) continue;
    if (!own) reachedTheirs.add(gate.project_id);
    const hold: CheckpointHold = {
      checkpointId: gate.checkpoint_id,
      stage: gate.stage,
      waitsFor: own ? "day" : "person",
      revisionId: gate.revision_id,
      fingerprint: gate.fingerprint,
      since: gate.created_at,
    };
    holding.set(gate.project_id, [...(holding.get(gate.project_id) ?? []), hold]);
  }
  const scheduled = db
    .prepare(
      `SELECT h.project_id FROM project_heads h WHERE ${heldForItsDay("h")}${
        projectId === undefined ? "" : " AND h.project_id=?"
      }`,
    )
    .all(...scoped)
    .map((row) => projectRow.parse(row).project_id);
  const agents = projectsWaitingOnAgents(db, projectId);
  const runs = heldRuns(db, projectId);
  // An uploaded project with nothing admitted reads Done (`edge/http/projects.ts`).
  const settled = uploadedAndSettled(db);
  const waitingForAgent = new Set(
    [...agents].filter((id) => !reachedTheirs.has(id) && runs.get(id)?.held !== true),
  );
  const stopped = new Set(
    [...runs]
      .filter(([, run]) => run.stuck)
      .map(([id]) => id)
      .filter(
        (id) =>
          !reachedTheirs.has(id) &&
          !waitingForAgent.has(id) &&
          !settled.has(id) &&
          derive(standings.get(id) ?? []) === "pending",
      ),
  );
  return {
    prepared: new Set(scheduled.filter((id) => !theirs.has(id) && !stopped.has(id))),
    waitingForAgent,
    stopped,
    // Only Continue the run moves a stopped run on: the one hold it can have reached, its
    // day's, holds it again once it has.
    holding: new Map([...holding].filter(([id]) => !stopped.has(id))),
  };
}

// An admitted step of `h`'s current version, of a stage not finished, held other than one
// parked on an agent's review: a restart (`recoverWork`) or a pause held it, and only Continue
// the run starts it. A saved edit's step nobody admitted yet (no `recipe_context`) waits for the
// person to choose what to remake instead.
function heldBesideReviews(h: string): string {
  return `EXISTS (SELECT 1 FROM revision_work w
     JOIN revision_work_reservations r ON r.work_id=w.id AND r.revision_id=${h}.revision_id
     JOIN stages s ON s.project_id=w.project_id AND s.id=w.stage_id
     WHERE w.project_id=${h}.project_id AND w.state='pending' AND w.dispatch_state='held'
       AND w.recipe_context IS NOT NULL
       AND s.state NOT IN ('done','provided','skipped')
       AND NOT EXISTS (SELECT 1 FROM external_reviews e WHERE e.work_id=w.id AND e.state='waiting'))`;
}

const runRow = z.object({ project_id: z.string(), held: z.number(), stuck: z.number() });

// Whether `h` is still: no call in flight, not paused and not waiting its turn in a batch.
function still(h: string): string {
  return `NOT EXISTS(SELECT 1 FROM stages s WHERE s.project_id=${h}.project_id AND s.state='running')
    AND NOT EXISTS(SELECT 1 FROM revision_work w WHERE w.project_id=${h}.project_id AND w.state='running')
    AND NOT EXISTS(SELECT 1 FROM project_controls c WHERE c.project_id=${h}.project_id AND c.paused=1)
    AND NOT EXISTS(SELECT 1 FROM project_queue q WHERE q.project_id=${h}.project_id AND q.state='queued')`;
}

// No admitted work of `h`'s current version that can start: a saved rerun or edit is admitted
// by no one until Resume, and work whose admission has a failed sibling never starts.
function nothingAdmitted(h: string): string {
  return `NOT EXISTS(SELECT 1 FROM revision_work w
    JOIN revision_work_reservations r ON r.work_id=w.id AND r.revision_id=${h}.revision_id
    WHERE w.state='pending' AND w.dispatch_state='allowed' AND NOT EXISTS(
      SELECT 1 FROM revision_work f WHERE f.admission_id=w.admission_id AND f.state IN ('failed','canceled')))`;
}

// Each project out of the Trash with a step held beside the reviews (`held`), and whether its
// run is stuck: it has unfinished stages, is still, and nothing will move it on but Continue
// the run, because nothing admitted can start or because a step is held (a step still allowed
// may wait on it).
function heldRuns(
  db: DatabaseSync,
  projectId: string | undefined,
): ReadonlyMap<string, { readonly held: boolean; readonly stuck: boolean }> {
  const stuck = `EXISTS(SELECT 1 FROM stages s WHERE s.project_id=h.project_id AND s.state NOT IN ('done','provided','skipped'))
    AND ${still("h")} AND (${heldBesideReviews("h")} OR ${nothingAdmitted("h")})`;
  const rows = db
    .prepare(
      `SELECT h.project_id, ${heldBesideReviews("h")} AS held, (${stuck}) AS stuck
       FROM project_heads h WHERE ${liveProject("h", "project_id")} AND (${heldBesideReviews("h")} OR (${stuck}))${
         projectId === undefined ? "" : " AND h.project_id=?"
       }`,
    )
    .all(...(projectId === undefined ? [] : [projectId]));
  return new Map(
    rows.map((row) => {
      const run = runRow.parse(row);
      return [run.project_id, { held: run.held === 1, stuck: run.stuck === 1 }] as const;
    }),
  );
}
