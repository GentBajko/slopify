import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { type ExternalReview, externalAnswerers, externalReviewStates } from "./external-model.js";
import { reviewStages } from "./model.js";

const materialSchema = z.object({
  request: z.object({
    stage: z.enum(reviewStages),
    instruction: z.string(),
    sections: z.array(z.object({ label: z.string(), text: z.string() })),
    images: z.array(z.string()),
  }),
  images: z.array(z.object({ stored: z.string(), name: z.string() })),
});
const verdictSchema = z.object({ passed: z.boolean(), reasons: z.array(z.string()) });
const rowSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  revision_id: z.string(),
  work_id: z.string(),
  piece_id: z.string(),
  work_key: z.string(),
  item_key: z.string(),
  stage: z.enum(reviewStages),
  item_fingerprint: z.string(),
  review_fingerprint: z.string(),
  material: z.string(),
  state: z.enum(externalReviewStates),
  waiting_since: z.string(),
  deadline_at: z.string(),
  verdict: z.string().nullable(),
  answered_by: z.enum(externalAnswerers).nullable(),
  answered_at: z.string().nullable(),
});

// One stored review as the slice speaks of it; throws for a row that can't be read back.
export function externalReviewOf(value: unknown): ExternalReview {
  const row = rowSchema.parse(value);
  return {
    id: row.id,
    projectId: row.project_id,
    revisionId: row.revision_id,
    workId: row.work_id,
    pieceId: row.piece_id,
    workKey: row.work_key,
    itemKey: row.item_key,
    stage: row.stage,
    itemFingerprint: row.item_fingerprint,
    reviewFingerprint: row.review_fingerprint,
    material: materialSchema.parse(JSON.parse(row.material)),
    state: row.state,
    waitingSince: row.waiting_since,
    deadlineAt: row.deadline_at,
    verdict: row.verdict === null ? null : verdictSchema.parse(JSON.parse(row.verdict)),
    answeredBy: row.answered_by,
    answeredAt: row.answered_at,
  };
}

export function externalReviewByFingerprint(
  db: DatabaseSync,
  projectId: string,
  reviewFingerprint: string,
): ExternalReview | undefined {
  const row = db
    .prepare("SELECT * FROM external_reviews WHERE project_id=? AND review_fingerprint=?")
    .get(projectId, reviewFingerprint);
  return row === undefined ? undefined : externalReviewOf(row);
}

export function externalReviewById(
  db: DatabaseSync,
  projectId: string,
  id: string,
): ExternalReview | undefined {
  const row = db
    .prepare("SELECT * FROM external_reviews WHERE project_id=? AND id=?")
    .get(projectId, id);
  return row === undefined ? undefined : externalReviewOf(row);
}
