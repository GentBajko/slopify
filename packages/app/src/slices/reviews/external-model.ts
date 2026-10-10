import { z } from "zod";
import { type Actor, actors } from "../agents/model.js";
import { type ReviewStage, type ReviewVerdict, reviewStages } from "./model.js";
import type { ReviewMaterial } from "./verdict.js";

// ceiling: the owner's number. An hourly agent routine answers well inside two hours; a run
// with no agent at all still finishes the same evening.
export const externalReviewWaitMs = 2 * 60 * 60 * 1000;

export const externalReviewStates = ["waiting", "answered", "auto-passed", "superseded"] as const;
export type ExternalReviewState = (typeof externalReviewStates)[number];

// What the built-in reviewer would be sent: the prompt's parts, and the pictures by their stored
// path (`storage/layout.ts` outputPath finds where each is when it is read).
export interface ExternalMaterial {
  readonly request: ReviewMaterial;
  readonly images: readonly { readonly stored: string; readonly name: string }[];
}

export interface ExternalReview {
  readonly id: string;
  readonly projectId: string;
  readonly revisionId: string;
  readonly workId: string;
  readonly pieceId: string;
  readonly workKey: string;
  readonly itemKey: string;
  readonly stage: ReviewStage;
  readonly itemFingerprint: string;
  readonly reviewFingerprint: string;
  readonly material: ExternalMaterial;
  readonly state: ExternalReviewState;
  readonly waitingSince: string;
  readonly deadlineAt: string;
  readonly verdict: ReviewVerdict | null;
  readonly answeredBy: Actor | null;
  readonly answeredAt: string | null;
}

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
  answered_by: z.enum(actors).nullable(),
  answered_at: z.string().nullable(),
});

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

export type ExternalAnswerResult =
  | { readonly ok: true; readonly value: ExternalReview }
  | { readonly ok: false; readonly reason: "not-found" }
  | { readonly ok: false; readonly reason: "trashed" }
  | {
      readonly ok: false;
      readonly reason: "answered" | "superseded";
      readonly value: ExternalReview;
    };

export type SettledReview = Pick<
  ExternalReview,
  "id" | "projectId" | "revisionId" | "workId" | "stage" | "itemKey"
>;
