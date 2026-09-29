import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { transact } from "../../kernel/db/tx.js";
import { currentRevisionId } from "../revisions/repo.js";
import { recoverProject } from "./recovery.js";
import type { RecoveryResult } from "./recovery-model.js";
import type { RebuildDeps } from "./service.js";

// How many times one narration chunk is recorded again by itself. A voice that garbles a
// sentence rarely does it twice; one that reads a name its own way does it every time, so
// after this the run stops and asks the person.
export const narrationRetryLimit = 2;

const row = z.object({
  project_id: z.string(),
  chunk_key: z.string(),
  tries: z.number(),
  state: z.enum(["pending", "started", "failed"]),
});
export interface NarrationRetry {
  readonly projectId: string;
  readonly chunkKey: string;
  readonly tries: number;
}

// Asked by the caption step when the audio stopped matching the text in a chunk. Returns the
// try this is (1 or 2), or undefined once the chunk has had its tries.
export function requestNarrationRetry(
  db: DatabaseSync,
  input: { readonly projectId: string; readonly chunkKey: string; readonly now: string },
): number | undefined {
  return transact(db, () => {
    const saved = db
      .prepare("SELECT tries FROM narration_retries WHERE project_id=? AND chunk_key=?")
      .get(input.projectId, input.chunkKey);
    const tries = saved === undefined ? 0 : z.number().parse(saved.tries);
    if (tries >= narrationRetryLimit) return undefined;
    db.prepare(
      `INSERT INTO narration_retries(project_id, chunk_key, tries, state, detail, updated_at)
       VALUES (?, ?, 1, 'pending', NULL, ?)
       ON CONFLICT(project_id, chunk_key)
       DO UPDATE SET tries=tries+1, state='pending', detail=NULL, updated_at=excluded.updated_at`,
    ).run(input.projectId, input.chunkKey, input.now);
    return tries + 1;
  });
}

export function pendingNarrationRetries(
  db: DatabaseSync,
  projectId?: string,
): readonly NarrationRetry[] {
  const rows =
    projectId === undefined
      ? db.prepare("SELECT * FROM narration_retries WHERE state='pending'").all()
      : db
          .prepare("SELECT * FROM narration_retries WHERE state='pending' AND project_id=?")
          .all(projectId);
  return rows.map((value) => {
    const parsed = row.parse(value);
    return { projectId: parsed.project_id, chunkKey: parsed.chunk_key, tries: parsed.tries };
  });
}

function settle(
  db: DatabaseSync,
  retry: NarrationRetry,
  state: "started" | "failed",
  detail: string | null,
  now: string,
): void {
  db.prepare(
    "UPDATE narration_retries SET state=?, detail=?, updated_at=? WHERE project_id=? AND chunk_key=? AND tries=?",
  ).run(state, detail, now, retry.projectId, retry.chunkKey, retry.tries);
}

// Starts the retries the caption step asked for, once its failure is saved (the runner's
// `onFinished`). The chunk is made again through Redo's path: a new regeneration token saved as
// a new project version, then the chunk and everything built on it (the joined narration,
// the captions, the video) rebuilt as ordinary work.
export function createNarrationRetries(): {
  readonly bind: (deps: RebuildDeps) => void;
  readonly kick: (projectId?: string) => void;
} {
  let bound: RebuildDeps | undefined;
  const running = new Set<string>();
  const kick = (projectId?: string): void => {
    const deps = bound;
    if (deps === undefined) return;
    for (const retry of pendingNarrationRetries(deps.db, projectId)) {
      const id = `${retry.projectId}\n${retry.chunkKey}`;
      if (running.has(id)) continue;
      running.add(id);
      void recordAgain(deps, retry)
        .catch((error: unknown) => {
          deps.log.write("error", "narration.retry", {
            projectId: retry.projectId,
            detail: error instanceof Error ? error.message : String(error),
          });
          settle(deps.db, retry, "failed", "internal error", deps.clock.now().toISOString());
        })
        .finally(() => {
          running.delete(id);
          try {
            deps.runner.tick(retry.projectId);
          } catch {
            // The next tick of this project picks the released work up.
          }
        });
    }
  };
  return {
    bind: (deps) => {
      bound = deps;
    },
    kick,
  };
}

async function recordAgain(deps: RebuildDeps, retry: NarrationRetry): Promise<void> {
  const base = currentRevisionId(deps.db, retry.projectId);
  if (base === undefined) {
    settle(deps.db, retry, "failed", "no project", deps.clock.now().toISOString());
    return;
  }
  const result = await recoverProject(
    deps,
    retry.projectId,
    {
      baseRevisionId: base,
      idempotencyKey: retryKey(retry),
      action: { kind: "redo", item: retry.chunkKey },
    },
    { pendingSuperseded: true },
  );
  const now = deps.clock.now().toISOString();
  if (result.ok) {
    settle(deps.db, retry, "started", null, now);
    deps.log.write("info", "narration.retry", {
      projectId: retry.projectId,
      detail: `Recording ${retry.chunkKey} again (try ${String(retry.tries)} of ${String(narrationRetryLimit)}).`,
    });
  } else {
    settle(deps.db, retry, "failed", refusal(result), now);
    deps.log.write("warn", "narration.retry", {
      projectId: retry.projectId,
      detail: `Could not record ${retry.chunkKey} again: ${refusal(result)}`,
    });
  }
  deps.emit(retry.projectId, { type: "project.updated", projectId: retry.projectId });
}

function refusal(result: Extract<RecoveryResult, { ok: false }>): string {
  const detail = result.fields?.map((field) => field.message).join(" ");
  return detail ? `${result.reason}: ${detail}` : result.reason;
}

// One request identity per try, so a restart that starts the same try again gets the first
// start's answer instead of a second recording.
export function retryKey(retry: NarrationRetry): string {
  const hex = createHash("sha256")
    .update(`narration-retry:${retry.projectId}:${retry.chunkKey}:${String(retry.tries)}`)
    .digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
