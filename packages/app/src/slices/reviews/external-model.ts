import type { Actor } from "../agents/model.js";
import type { ReviewStage, ReviewVerdict } from "./model.js";
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

export type ExternalAnswerResult =
  | { readonly ok: true; readonly value: ExternalReview }
  | { readonly ok: false; readonly reason: "not-found" }
  | { readonly ok: false; readonly reason: "trashed" }
  | {
      readonly ok: false;
      // `canceled`: its run was canceled, and a canceled run's reviews never pass.
      readonly reason: "answered" | "superseded" | "canceled";
      readonly value: ExternalReview;
    };

export type SettledReview = Pick<
  ExternalReview,
  "id" | "projectId" | "revisionId" | "workId" | "stage" | "itemKey"
>;
