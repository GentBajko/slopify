import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { catalogueSchema } from "../../catalog/schema.js";
import type {
  DraftResult,
  DraftStartDeps,
  PlayReview,
  PlayStartInput,
  PlayStartResult,
} from "./model.js";
import { draftRow, requestHash } from "./repo.js";
import { resolveReviewInputs } from "./review.js";
import { playReviewSchema, playStartResultSchema } from "./schema.js";
import { readDraft } from "./service.js";

const receiptSchema = z.object({
  id: z.uuid(),
  draft_id: z.uuid(),
  draft_version: z.number().int().positive(),
  request_hash: z.string(),
  result_json: z.string(),
});
export interface StoredStartReceipt {
  readonly id: string;
  readonly draftId: string;
  readonly draftVersion: number;
  readonly requestHash: string;
  readonly result: PlayStartResult;
}
export const executionSchema = z.object({
  review: playReviewSchema,
  execution: z.object({
    catalogue: catalogueSchema,
    attachmentIdentity: z.array(
      z.object({ id: z.uuid(), stagedFileId: z.string(), bytes: z.number() }),
    ),
    font: z
      .object({
        id: z.string(),
        name: z.string(),
        family: z.string(),
        source: z.enum(["bundled", "system", "uploaded"]),
        path: z.string(),
        extension: z.enum([".ttf", ".otf", ".ttc"]),
        assName: z.string(),
        faceIndex: z.number(),
      })
      .nullable(),
  }),
});
export function readStartReceipt(
  db: DatabaseSync,
  reviewId: string,
): StoredStartReceipt | undefined {
  const raw = db.prepare("SELECT * FROM play_start_receipts WHERE id=?").get(reviewId);
  if (!raw) return undefined;
  const row = receiptSchema.parse(raw);
  return {
    id: row.id,
    draftId: row.draft_id,
    draftVersion: row.draft_version,
    requestHash: row.request_hash,
    result: playStartResultSchema.parse(JSON.parse(row.result_json)),
  };
}
export function replayResult(
  receipt: StoredStartReceipt,
  input: PlayStartInput,
): DraftResult<PlayStartResult> {
  if (
    receipt.id !== input.reviewId ||
    receipt.draftId !== input.draftId ||
    receipt.draftVersion !== input.baseVersion ||
    receipt.requestHash !== requestHash(input) ||
    receipt.result.requestId !== input.reviewId
  )
    return { ok: false, reason: "conflict", currentVersion: receipt.draftVersion, fields: [] };
  return { ok: true, value: { ...receipt.result, replayed: true } };
}
export function requireStartingIdentity(
  deps: DraftStartDeps,
  input: PlayStartInput,
): DraftResult<PlayReview> {
  const row = draftRow(deps.db, input.draftId);
  const denied = (
    reason: "not-found" | "stale-review" | "pending-start" | "conflict",
  ): DraftResult<never> => ({
    ok: false,
    reason,
    currentVersion: row?.version ?? null,
    fields: [],
    ...(row?.start_id ? { reviewId: row.start_id } : {}),
  });
  if (!row) return denied("not-found");
  if (row.state !== "starting" || row.start_id !== input.reviewId) return denied("pending-start");
  if (row.version !== input.baseVersion) return denied("conflict");
  if (row.review_id !== input.reviewId || row.review_json === null) return denied("stale-review");
  const stored = executionSchema.parse(JSON.parse(row.review_json));
  const view = readDraft(deps, input.draftId);
  if (!view.ok) return view;
  const resolved = resolveReviewInputs(deps, view.value, stored.execution.font);
  if (!resolved.ok) return { ...resolved, reason: "stale-review" };
  const { fingerprint: _fingerprint, ...current } = resolved.value;
  if (
    requestHash({
      ...(stored.review.checkpointSet === undefined
        ? {}
        : { checkpointSet: stored.review.checkpointSet }),
      runs: stored.review.runs,
      estimates: stored.review.estimates,
      ...stored.execution,
    }) !== requestHash(current) ||
    stored.review.draftId !== input.draftId ||
    stored.review.draftVersion !== input.baseVersion ||
    stored.review.id !== input.reviewId ||
    resolved.value.fingerprint !== stored.review.fingerprint ||
    row.review_fingerprint !== stored.review.fingerprint
  )
    return denied("stale-review");
  return { ok: true, value: stored.review };
}
export function insertStartReceipt(
  deps: DraftStartDeps,
  input: PlayStartInput,
  value: PlayStartResult,
): void {
  deps.db
    .prepare(
      "INSERT INTO play_start_receipts(id,draft_id,draft_version,request_hash,result_json,created_at) VALUES(?,?,?,?,?,?)",
    )
    .run(
      input.reviewId,
      input.draftId,
      input.baseVersion,
      requestHash(input),
      JSON.stringify(playStartResultSchema.parse(value)),
      deps.clock.now().toISOString(),
    );
}
export function markDraftStartedAndReleaseRefs(db: DatabaseSync, input: PlayStartInput): void {
  const changed = db
    .prepare(
      "UPDATE play_drafts SET state='started' WHERE id=? AND version=? AND state='starting' AND start_id=?",
    )
    .run(input.draftId, input.baseVersion, input.reviewId);
  if (Number(changed.changes) !== 1) throw new Error("The pending Start identity changed");
  db.prepare("DELETE FROM play_draft_attachments WHERE draft_id=?").run(input.draftId);
}
export function releaseStartClaim(
  deps: DraftStartDeps,
  input: PlayStartInput,
  stale: boolean,
): void {
  deps.db
    .prepare(
      `UPDATE play_drafts SET state='active',start_id=NULL${stale ? ",review_id=NULL,review_json=NULL,review_fingerprint=NULL" : ""} WHERE id=? AND version=? AND state='starting' AND start_id=?`,
    )
    .run(input.draftId, input.baseVersion, input.reviewId);
}
