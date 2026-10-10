import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { StageKind } from "../../kernel/pipeline.js";
import { type StageProgress, satisfied, deps as stageDeps } from "../../kernel/runner/graph.js";
import { liveProject, stageStandingsByProject } from "../admission/repo.js";
import { checkpointStageSchema } from "../checkpoints/schema.js";
import { heldForItsDay } from "../schedules/prepare.js";
import { projectsWaitingOnAgents } from "./external.js";

// What a held run waits for when it isn't the person: the one rule the Projects list, a
// project's page, the calendar, Home and the MCP tools read (`admission/state-words.ts`).
export interface ProjectHolds {
  // Prepared ahead by a schedule and held only by the schedule's own Before Video hold: it
  // waits for its day. Any other checkpoint still to approve is the person's, prepared or not.
  readonly prepared: ReadonlySet<string>;
  // Parked on a review an External agent answers, with no checkpoint of the person's reached:
  // it goes on by itself once the agent answers or the review passes at its deadline.
  readonly waitingForAgent: ReadonlySet<string>;
}

const gateRow = z.object({
  project_id: z.string(),
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
  const one = projectId === undefined ? "" : " AND c.project_id=?";
  const gateSql = `SELECT c.project_id, c.stage, (c.stage='video' AND ${heldForItsDay("c")}) AS own
       FROM review_checkpoints c
       JOIN project_heads h ON h.project_id=c.project_id AND h.revision_id=c.revision_id
       WHERE c.state IN ('held','pending-review') AND c.approved_at IS NULL AND ${liveProject("c", "project_id")}${one}`;
  const gates = (
    projectId === undefined ? db.prepare(gateSql).all() : db.prepare(gateSql).all(projectId)
  ).map((row) => gateRow.parse(row));
  const standings = scope.standings ?? stageStandingsByProject(db, projectId);
  // A checkpoint holds the run once the stages its step needs are made; before that the run
  // is held by whatever those stages wait on.
  const reached = (projectId: string, stage: StageKind): boolean =>
    stageDeps[stage].every((dependency) => {
      const standing = standings.get(projectId)?.find((one) => one.kind === dependency);
      return standing === undefined || satisfied(standing.state);
    });
  const theirs = new Set<string>();
  const reachedTheirs = new Set<string>();
  for (const gate of gates) {
    if (gate.own === 1) continue;
    theirs.add(gate.project_id);
    if (reached(gate.project_id, gate.stage)) reachedTheirs.add(gate.project_id);
  }
  const preparedSql = `SELECT project_id FROM prepared_videos WHERE added_checkpoint=1${
    projectId === undefined ? "" : " AND project_id=?"
  }`;
  const scheduled = (
    projectId === undefined ? db.prepare(preparedSql).all() : db.prepare(preparedSql).all(projectId)
  ).map((row) => projectRow.parse(row).project_id);
  const agents = projectsWaitingOnAgents(db, projectId);
  return {
    prepared: new Set(scheduled.filter((id) => !theirs.has(id))),
    waitingForAgent: new Set([...agents].filter((id) => !reachedTheirs.has(id))),
  };
}
