import type { DatabaseSync } from "node:sqlite";
import { templateById } from "../project-templates/repo.js";
import type { AssistantScreen } from "./model.js";
import type { ScreenNames } from "./prompt.js";

// The names behind the ids the page sent, read from the database rather than taken from the
// page, so the model is told what is really there. An id that names nothing is left unnamed.

function named(db: DatabaseSync, sql: string, id: string | undefined): string | undefined {
  if (id === undefined) return undefined;
  const row = db.prepare(sql).get(id);
  const value = row === undefined ? undefined : Object.values(row)[0];
  return typeof value === "string" ? value : undefined;
}

export function projectTitle(db: DatabaseSync, id: string | undefined): string | undefined {
  return named(db, "SELECT title FROM projects WHERE id=?", id);
}

export function screenNames(db: DatabaseSync, screen: AssistantScreen | undefined): ScreenNames {
  if (screen === undefined) return {};
  return {
    project: projectTitle(db, screen.projectId),
    schedule: named(db, "SELECT name FROM schedules WHERE id=?", screen.scheduleId),
    channel: named(db, "SELECT name FROM channels WHERE id=?", screen.channelId),
    template:
      screen.templateId === undefined ? undefined : templateById(db, screen.templateId)?.name,
  };
}
