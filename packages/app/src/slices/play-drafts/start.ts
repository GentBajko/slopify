import { z } from "zod";
import { transact } from "../../kernel/db/tx.js";
import { startRun } from "../admission/start.js";
import { enqueueBatch, pumpQueue } from "../batch/index.js";
import { admitReviewedCheckpoints } from "../rebuild/recipe-checkpoints.js";
import { releaseStagedFile } from "../storage/staging-refs.js";
import type { DraftResult, DraftStartDeps, PlayStartInput, PlayStartResult } from "./model.js";
import { checkDraftReadiness, localDraftReadiness } from "./readiness.js";
import { attachmentRows, draftRow } from "./repo.js";
import { readDraft } from "./service.js";
import {
  executionSchema,
  insertStartReceipt,
  markDraftStartedAndReleaseRefs,
  readStartReceipt,
  releaseStartClaim,
  replayResult,
  requireStartingIdentity,
} from "./start-repo.js";

const inputSchema = z
  .object({ draftId: z.uuid(), baseVersion: z.number().int().positive(), reviewId: z.uuid() })
  .strict();
export async function startPlayDraft(
  deps: DraftStartDeps,
  input: PlayStartInput,
): Promise<DraftResult<PlayStartResult>> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, reason: "invalid-edit", currentVersion: null, fields: [] };
  input = parsed.data;
  const claimed = transact(deps.db, () => {
    const receipt = readStartReceipt(deps.db, input.reviewId);
    if (receipt) return replayResult(receipt, input);
    const row = draftRow(deps.db, input.draftId);
    if (!row) return { ok: false, reason: "not-found", currentVersion: null, fields: [] } as const;
    const view = readDraft(deps, input.draftId);
    if (!view.ok) return view;
    if (row.state === "started")
      return {
        ok: false,
        reason: "already-started",
        currentVersion: row.version,
        fields: [],
      } as const;
    if (row.state === "starting" && row.start_id !== input.reviewId)
      return {
        ok: false,
        reason: "pending-start",
        currentVersion: row.version,
        reviewId: row.start_id ?? input.reviewId,
        fields: [],
      } as const;
    if (row.version !== input.baseVersion || view.value.review?.id !== input.reviewId)
      return {
        ok: false,
        reason: "stale-review",
        currentVersion: row.version,
        fields: [],
      } as const;
    if (row.state === "active") {
      deps.db
        .prepare(
          "UPDATE play_drafts SET state='starting',start_id=? WHERE id=? AND version=? AND state='active'",
        )
        .run(input.reviewId, input.draftId, input.baseVersion);
    }
    return { ok: true, value: view.value.review } as const;
  });
  if (!claimed.ok) {
    releaseStartClaim(deps, input, claimed.reason === "stale-review");
    return claimed;
  }
  if ("requestId" in claimed.value) return { ok: true, value: claimed.value };
  const identity = requireStartingIdentity(deps, input);
  if (!identity.ok) {
    releaseStartClaim(deps, input, identity.reason === "stale-review");
    return identity;
  }
  const row = draftRow(deps.db, input.draftId);
  if (row?.review_json == null) throw new Error("Pending Start lost its review");
  const { catalogue } = executionSchema.parse(JSON.parse(row.review_json)).execution;
  const captured: DraftStartDeps = {
    ...deps,
    catalogue: {
      ...deps.catalogue,
      read: () => catalogue,
      models: (provider, family) =>
        catalogue[family].filter((m) => m.provider === provider && m.enabled && !m.deprecated),
    },
  };
  const checked = await checkDraftReadiness(captured, claimed.value.runs);
  const oldFiles = attachmentRows(deps.db, input.draftId).flatMap((a) =>
    a.staged_file_id === null ? [] : [a.staged_file_id],
  );
  const result: DraftResult<PlayStartResult> = transact(deps.db, () => {
    const receipt = readStartReceipt(deps.db, input.reviewId);
    if (receipt) return replayResult(receipt, input);
    const starting = requireStartingIdentity(deps, input);
    if (!starting.ok) return starting;
    const fields = [
      ...checked.fields,
      ...localDraftReadiness(captured, starting.value.runs, checked.providers),
    ];
    if (fields.length)
      return { ok: false, reason: "readiness", currentVersion: input.baseVersion, fields };
    const runs = starting.value.runs;
    const first = runs[0];
    if (!first) throw new Error("Reviewed run list was empty");
    const queue = runs.length === 1 ? [] : enqueueBatch(captured, input.reviewId, runs, true);
    const projectIds =
      runs.length === 1
        ? [startRun(captured, first.draft, first.rendered, true, first.templates).project.id]
        : queue.map((e) => e.projectId);
    const checkpointSet = admitReviewedCheckpoints(
      captured,
      projectIds,
      starting.value.checkpointSet ?? [],
      catalogue,
    );
    const value = {
      requestId: input.reviewId,
      projectIds,
      queue,
      replayed: false,
      ...(checkpointSet.length ? { checkpointSet } : {}),
    };
    insertStartReceipt(deps, input, value);
    markDraftStartedAndReleaseRefs(deps.db, input);
    return { ok: true, value };
  });
  if (!result.ok) {
    releaseStartClaim(deps, input, result.reason === "stale-review");
    return result;
  }
  if (!result.value.replayed) {
    afterCommit(deps, () => deps.recordStarted(result.value.projectIds));
    for (const id of oldFiles) afterCommit(deps, () => releaseStagedFile(deps, id));
    afterCommit(deps, () => {
      if (result.value.queue.length) pumpQueue(deps.db, deps.runner);
      else for (const id of result.value.projectIds) deps.runner.tick(id);
    });
  }
  return result;
}
function afterCommit(deps: DraftStartDeps, run: () => void): void {
  try {
    run();
  } catch {
    try {
      deps.log.write("warn", "play.start.after-commit", {
        detail: "Start committed; a post-commit action failed.",
      });
    } catch {
      /* The durable receipt remains authoritative even if logging fails. */
    }
  }
}
