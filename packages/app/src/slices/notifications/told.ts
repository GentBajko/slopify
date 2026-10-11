import type { DatabaseSync } from "node:sqlite";
import { transact } from "../../kernel/db/tx.js";

// The failures a project's notices named (`rules.ts` runNotices), only those it still has: what
// the Notification URL was told, so each failure is told once.
export interface ToldFailures {
  readonly read: (projectId: string) => ReadonlySet<string>;
  readonly keep: (projectId: string, told: ReadonlySet<string>) => void;
}

// In memory, for a notifier whose told failures needn't outlive it: tests.
// ceiling: one entry per project with a told failure.
export function toldInMemory(): ToldFailures {
  const told = new Map<string, ReadonlySet<string>>();
  return {
    read: (projectId) => told.get(projectId) ?? new Set(),
    keep: (projectId, ids) => {
      if (ids.size === 0) told.delete(projectId);
      else told.set(projectId, ids);
    },
  };
}

// The server's, in `told_failures`, so a restart neither tells a failure again nor counts one
// never told as told. A project's rows go with it.
export function toldFailures(db: DatabaseSync): ToldFailures {
  return {
    read: (projectId) =>
      new Set(
        db
          .prepare("SELECT failure_id FROM told_failures WHERE project_id=?")
          .all(projectId)
          .map((row) => String(row.failure_id)),
      ),
    keep: (projectId, told) => {
      transact(db, () => {
        db.prepare("DELETE FROM told_failures WHERE project_id=?").run(projectId);
        const insert = db.prepare("INSERT INTO told_failures(project_id,failure_id) VALUES (?,?)");
        for (const id of told) insert.run(projectId, id);
      });
    },
  };
}
