import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { StageKind } from "../../kernel/pipeline.js";
import { type StageProgress, satisfied, deps as stageDeps } from "../../kernel/runner/graph.js";
import { liveProject, stageStandingsByProject } from "../admission/repo.js";
import type { CheckpointStage } from "../checkpoints/model.js";
import { checkpointStageSchema } from "../checkpoints/schema.js";
import { heldForItsDay } from "../schedules/prepare.js";
import { projectsWaitingOnAgents } from "./external.js";

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
  // Each project's checkpoints that hold its run now, their stage's inputs made: the person's
  // to approve, or a schedule's own Before Video hold waiting for its day. One not reached yet
  // holds nothing.
  readonly holding: ReadonlyMap<string, readonly CheckpointHold[]>;
}

export interface CheckpointHold {
  readonly checkpointId: string;
  readonly stage: CheckpointStage;
  readonly waitsFor: "person" | "day";
}

const gateRow = z.object({
  project_id: z.string(),
  checkpoint_id: z.string(),
  stage: checkpointStageSchema,
  own: z.number(),
});
const projectRow = z.object({ project_id: z.string() });

// Every project's holds, or one project's alone when `projectId` is given. A caller that has
// already read the stage standings (`stageStandingsByProject`) passes them.
export function projectHolds(
  db: DatabaseSync,
  scope: {
    readonly projectId?: string | undefined;
    readonly standings?: ReadonlyMap<string, readonly StageProgress[]> | undefined;
  } = {},
): ProjectHolds {
  const { projectId } = scope;
  const onlyOne = projectId === undefined ? "" : " AND c.project_id=?";
  const gateSql = `SELECT c.project_id, c.checkpoint_id, c.stage, (c.stage='video' AND ${heldForItsDay("c")}) AS own
       FROM review_checkpoints c
       JOIN project_heads h ON h.project_id=c.project_id AND h.revision_id=c.revision_id
       WHERE c.state IN ('held','pending-review') AND c.approved_at IS NULL AND ${liveProject("c", "project_id")}${onlyOne}`;
  const gates = (
    projectId === undefined ? db.prepare(gateSql).all() : db.prepare(gateSql).all(projectId)
  ).map((row) => gateRow.parse(row));
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
    };
    holding.set(gate.project_id, [...(holding.get(gate.project_id) ?? []), hold]);
  }
  const preparedSql = `SELECT project_id FROM prepared_videos WHERE added_checkpoint=1${
    projectId === undefined ? "" : " AND project_id=?"
  }`;
  const scheduled = (
    projectId === undefined ? db.prepare(preparedSql).all() : db.prepare(preparedSql).all(projectId)
  ).map((row) => projectRow.parse(row).project_id);
  const agents = projectsWaitingOnAgents(db, projectId);
  const stopped = heldBesideReviews(db, projectId);
  return {
    prepared: new Set(scheduled.filter((id) => !theirs.has(id))),
    waitingForAgent: new Set(
      [...agents].filter((id) => !reachedTheirs.has(id) && !stopped.has(id)),
    ),
    holding,
  };
}

// Projects whose current version has a step of an unfinished stage held other than one parked
// on an agent's review: a restart (`recoverWork`), a pause or a saved edit held it, and only
// Continue the run starts it.
function heldBesideReviews(db: DatabaseSync, projectId: string | undefined): ReadonlySet<string> {
  const sql = `SELECT DISTINCT w.project_id FROM revision_work w
     JOIN revision_work_reservations r ON r.work_id=w.id
     JOIN project_heads h ON h.project_id=r.project_id AND h.revision_id=r.revision_id
     JOIN stages s ON s.project_id=w.project_id AND s.id=w.stage_id
     WHERE w.state='pending' AND w.dispatch_state='held'
       AND s.state NOT IN ('done','provided','skipped')
       AND NOT EXISTS (SELECT 1 FROM external_reviews e WHERE e.work_id=w.id AND e.state='waiting')${
         projectId === undefined ? "" : " AND w.project_id=?"
       }`;
  const rows = projectId === undefined ? db.prepare(sql).all() : db.prepare(sql).all(projectId);
  return new Set(rows.map((row) => projectRow.parse(row).project_id));
}
