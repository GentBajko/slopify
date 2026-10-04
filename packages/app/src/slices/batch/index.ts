import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { transact } from "../../kernel/db/tx.js";
import { derive } from "../../kernel/runner/graph.js";
import type { Runner } from "../../kernel/runner/index.js";
import type { RunDraft } from "../admission/model.js";
import { liveProject, projectPaused, stagesOf } from "../admission/repo.js";
import { startRun } from "../admission/start.js";
import { deleteStagedFile } from "../storage/repo.js";
import type { StorageDeps } from "../storage/staging.js";
import { releaseStagedFile } from "../storage/staging-refs.js";

const queueRow = z.object({
  projectId: z.string(),
  batchId: z.string(),
  position: z.number(),
  state: z.enum(["queued", "active", "finished"]),
});
export type QueueEntry = z.infer<typeof queueRow>;
// A project in the trash leaves the queue's view, so the queue moves on past it; restored,
// it is back in its place.
export function queueEntries(db: DatabaseSync, batchId?: string): QueueEntry[] {
  return db
    .prepare(`SELECT project_id AS projectId, batch_id AS batchId, position, state
    FROM project_queue ${batchId === undefined ? "WHERE state != 'finished'" : "WHERE batch_id = ?"}
    AND ${liveProject("project_queue", "project_id")}
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
  runs: readonly {
    draft: RunDraft;
    rendered: Readonly<Record<string, string>>;
    templates?: Readonly<Record<string, string>>;
  }[],
  retainStaged = false,
): QueueEntry[] {
  if (batchExists(deps.db, batchId)) return queueEntries(deps.db, batchId);
  const sources = new Set<string>();
  transact(deps.db, () => {
    deps.db
      .prepare("INSERT INTO batches(id, created_at) VALUES (?, ?)")
      .run(batchId, deps.clock.now().toISOString());
    const used = new Set<string>();
    for (const { draft, rendered, templates } of runs) {
      const { project } = startRun(deps, draft, rendered, true, templates);
      deps.db
        .prepare("INSERT INTO project_queue(project_id, batch_id) VALUES (?, ?)")
        .run(project.id, batchId);
      if (draft.sources.audio === "provide" && draft.provided.audio) used.add(draft.provided.audio);
      if (draft.sources.thumbnail === "provide" && draft.provided.thumbnail)
        used.add(draft.provided.thumbnail);
      if (draft.sources.images === "provide")
        for (const id of draft.provided.images ?? []) used.add(id);
      if (draft.shorts?.enabled === true && draft.provided.shortsMusic)
        used.add(draft.provided.shortsMusic);
      if (draft.ambientBed?.source === "upload" && draft.provided.ambientBed)
        used.add(draft.provided.ambientBed);
    }
    for (const id of retainStaged ? [] : used) {
      sources.add(id);
      deleteStagedFile(deps.db, id);
    }
  });
  for (const source of sources) releaseStagedFile(deps, source);
  return queueEntries(deps.db, batchId);
}
// Only one batch video runs at once. A paused item holds its place; a failed or
// canceled item releases the next video once its provider calls have drained.
export function pumpQueue(db: DatabaseSync, runner: Runner): void {
  for (const entry of queueEntries(db)) {
    const stages = stagesOf(db, entry.projectId);
    const status = derive(stages, projectPaused(db, entry.projectId));
    if (runner.hasInflight?.(entry.projectId)) return;
    if (["done", "partial", "failed", "canceled"].includes(status)) {
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

export type QueueMove =
  | { readonly ok: true; readonly queue: QueueEntry[] }
  | { readonly ok: false; readonly reason: "not-queued" | "edge" };

// Batch queue's Up and Down: a video still waiting its turn trades places with the next waiting
// one before or after it. A video already started (active) or finished keeps its place, so
// nothing admitted is ever overtaken.
export function moveQueued(db: DatabaseSync, projectId: string, by: -1 | 1): QueueMove {
  return transact<QueueMove>(db, () => {
    const waiting = queueEntries(db).filter((entry) => entry.state === "queued");
    const at = waiting.findIndex((entry) => entry.projectId === projectId);
    if (at === -1) return { ok: false, reason: "not-queued" };
    const other = waiting[at + by];
    const self = waiting[at];
    if (other === undefined || self === undefined) return { ok: false, reason: "edge" };
    // `position` is the row's key, so the swap goes through a free one.
    const free = -1 - Math.max(self.position, other.position);
    const set = db.prepare("UPDATE project_queue SET position = ? WHERE project_id = ?");
    set.run(free, self.projectId);
    set.run(self.position, other.projectId);
    set.run(other.position, self.projectId);
    return { ok: true, queue: queueEntries(db) };
  });
}
