import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { transact } from "../../kernel/db/tx.js";
import { derive } from "../../kernel/runner/graph.js";
import type { Runner } from "../../kernel/runner/index.js";
import type { RunDraft } from "../admission/model.js";
import { projectPaused, stagesOf } from "../admission/repo.js";
import { startRun } from "../admission/start.js";
import { stagingPath } from "../storage/layout.js";
import { deleteStagedFile, stagedFileById } from "../storage/repo.js";
import { dropStagedSource, type StorageDeps } from "../storage/staging.js";

const queueRow = z.object({
  projectId: z.string(),
  batchId: z.string(),
  position: z.number(),
  state: z.enum(["queued", "active", "finished"]),
});
export type QueueEntry = z.infer<typeof queueRow>;
export function queueEntries(db: DatabaseSync, batchId?: string): QueueEntry[] {
  return db
    .prepare(`SELECT project_id AS projectId, batch_id AS batchId, position, state
    FROM project_queue ${batchId === undefined ? "WHERE state != 'finished'" : "WHERE batch_id = ?"}
    ORDER BY position`)
    .all(...(batchId === undefined ? [] : [batchId]))
    .map((row) => queueRow.parse(row));
}
export function queueWaiting(db: DatabaseSync, projectId: string): boolean {
  return (
    db
      .prepare("SELECT 1 FROM project_queue WHERE project_id = ? AND state = 'queued'")
      .get(projectId) !== undefined
  );
}
export function batchExists(db: DatabaseSync, id: string): boolean {
  return db.prepare("SELECT 1 FROM batches WHERE id = ?").get(id) !== undefined;
}
export function enqueueBatch(
  deps: StorageDeps,
  batchId: string,
  runs: readonly { draft: RunDraft; rendered: Readonly<Record<string, string>> }[],
): QueueEntry[] {
  if (batchExists(deps.db, batchId)) return queueEntries(deps.db, batchId);
  const sources = new Set<string>();
  transact(deps.db, () => {
    deps.db
      .prepare("INSERT INTO batches(id, created_at) VALUES (?, ?)")
      .run(batchId, deps.clock.now().toISOString());
    const used = new Set<string>();
    for (const { draft, rendered } of runs) {
      const { project } = startRun(deps, draft, rendered, true);
      deps.db
        .prepare("INSERT INTO project_queue(project_id, batch_id) VALUES (?, ?)")
        .run(project.id, batchId);
      if (draft.sources.audio === "provide" && draft.provided.audio) used.add(draft.provided.audio);
      if (draft.sources.thumbnail === "provide" && draft.provided.thumbnail)
        used.add(draft.provided.thumbnail);
      if (draft.sources.images === "provide")
        for (const id of draft.provided.images ?? []) used.add(id);
    }
    for (const id of used) {
      const file = stagedFileById(deps.db, id);
      if (file) sources.add(stagingPath(deps.paths, file.path));
      deleteStagedFile(deps.db, id);
    }
  });
  for (const source of sources) dropStagedSource(deps, source);
  return queueEntries(deps.db, batchId);
}
// Only one batch video runs at once. A paused item holds its place; a failed or
// canceled item releases the next video once its provider calls have drained.
export function pumpQueue(db: DatabaseSync, runner: Runner): void {
  for (const entry of queueEntries(db)) {
    const stages = stagesOf(db, entry.projectId);
    const status = derive(stages, projectPaused(db, entry.projectId));
    if (runner.hasInflight?.(entry.projectId)) return;
    if (["done", "failed", "canceled"].includes(status)) {
      db.prepare("UPDATE project_queue SET state = 'finished' WHERE project_id = ?").run(
        entry.projectId,
      );
      continue;
    }
    if (status === "paused") return;
    db.prepare("UPDATE project_queue SET state = 'active' WHERE project_id = ?").run(
      entry.projectId,
    );
    runner.tick(entry.projectId);
    return;
  }
}
