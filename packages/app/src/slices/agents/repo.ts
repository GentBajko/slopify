import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { type Actor, actors } from "./model.js";

export interface AgentAction {
  readonly id: string;
  readonly projectId: string | null;
  readonly scheduleId: string | null;
  // The MCP tool, and its title as the history shows it.
  readonly tool: string;
  readonly title: string;
  // The version the action saved, when it saved one.
  readonly revisionId: string | null;
  readonly createdAt: string;
}

// An action with the name of the project or schedule it changed, when it still exists.
export interface AgentActionView extends AgentAction {
  readonly subject: string | null;
}

// ceiling: Settings shows the latest twenty; a project's own are in its history.
export const recentAgentActionsMax = 20;

const actionRow = z.object({
  id: z.string(),
  project_id: z.string().nullable(),
  schedule_id: z.string().nullable(),
  tool: z.string(),
  title: z.string(),
  revision_id: z.string().nullable(),
  created_at: z.string(),
});

function actionOf(value: unknown): AgentAction {
  const row = actionRow.parse(value);
  return {
    id: row.id,
    projectId: row.project_id,
    scheduleId: row.schedule_id,
    tool: row.tool,
    title: row.title,
    revisionId: row.revision_id,
    createdAt: row.created_at,
  };
}

// A project the call itself deleted for good is gone: the action is kept without it.
export function recordAgentAction(db: DatabaseSync, action: AgentAction): void {
  db.prepare(
    `INSERT INTO agent_actions(id,project_id,schedule_id,tool,title,revision_id,created_at)
     VALUES (?,(SELECT id FROM projects WHERE id=?),?,?,?,?,?)`,
  ).run(
    action.id,
    action.projectId,
    action.scheduleId,
    action.tool,
    action.title,
    action.revisionId,
    action.createdAt,
  );
}

export function agentActionsOf(db: DatabaseSync, projectId: string): readonly AgentAction[] {
  return db
    .prepare("SELECT * FROM agent_actions WHERE project_id=? ORDER BY created_at DESC, rowid DESC")
    .all(projectId)
    .map(actionOf);
}

export function agentRevisionIds(db: DatabaseSync, projectId: string): ReadonlySet<string> {
  return new Set(
    db
      .prepare(
        "SELECT DISTINCT revision_id FROM agent_actions WHERE project_id=? AND revision_id IS NOT NULL",
      )
      .all(projectId)
      .map((row) => String(row.revision_id)),
  );
}

export function recentAgentActions(db: DatabaseSync): readonly AgentActionView[] {
  return db
    .prepare(
      `SELECT a.*, COALESCE(p.title, s.name) AS subject FROM agent_actions a
       LEFT JOIN projects p ON p.id=a.project_id LEFT JOIN schedules s ON s.id=a.schedule_id
       ORDER BY a.created_at DESC, a.rowid DESC LIMIT ?`,
    )
    .all(recentAgentActionsMax)
    .map((row) => ({
      ...actionOf(row),
      subject: z.object({ subject: z.string().nullable() }).parse(row).subject,
    }));
}

export function recordStart(
  db: DatabaseSync,
  start: { readonly projectId: string; readonly actor: Actor; readonly at: string },
): void {
  db.prepare(
    `INSERT INTO project_starts(project_id,actor,started_at)
     SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM projects WHERE id=?)
     ON CONFLICT(project_id) DO UPDATE SET actor=excluded.actor, started_at=excluded.started_at`,
  ).run(start.projectId, start.actor, start.at, start.projectId);
}

export function lastStarter(db: DatabaseSync, projectId: string): Actor | null {
  const row = db.prepare("SELECT actor FROM project_starts WHERE project_id=?").get(projectId);
  return row === undefined ? null : z.object({ actor: z.enum(actors) }).parse(row).actor;
}
