import type { Actor } from "../agents/model.js";
import type { ReviewStage, ReviewVerdict } from "./model.js";
import type { ReviewMaterial } from "./verdict.js";

// ceiling: the owner's number. An hourly agent routine answers well inside two hours; a run
// with no agent at all still finishes the same evening.
export const externalReviewWaitMs = 2 * 60 * 60 * 1000;

// `canceled`: Cancel closed it while it waited; taken up again, its step asks it once more.
export const externalReviewStates = [
  "waiting",
  "answered",
  "auto-passed",
  "superseded",
  "canceled",
] as const;
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

// Where a review stands (`reviewStanding`): waiting for a verdict, or why it takes none.
// `superseded` when the review that replaced it waits; `replaced-pending` when none does yet
// (its item is still being made again, or the edit that replaced it is saved but not continued).
export type ReviewStanding = ExternalReviewState | "trashed" | "canceled" | "replaced-pending";

// Why a review takes no verdict, one sentence per standing: what get_external_review explains,
// and what a refused verdict says after "The verdict wasn't saved."
export const closedReviewSentences: Readonly<Record<Exclude<ReviewStanding, "waiting">, string>> = {
  answered:
    "This review was already answered, so it takes no other verdict. Call needs_attention to see what is waiting now.",
  "auto-passed":
    "This review passed at its 2-hour deadline with no verdict, so it takes none now. Call needs_attention to see what is waiting now.",
  superseded:
    "This review was replaced: its item was made again or edited, and the new one waits for its own verdict. Call needs_attention to see it.",
  "replaced-pending":
    "This review was replaced: its item was made again or edited, so it takes no verdict, and no new review waits for it yet. One opens once the new item is made; an edit saved but not continued makes none until the run is continued. There is nothing to answer here: call needs_attention to see what is waiting now.",
  canceled:
    "This review's run was canceled, so nothing waits on it and it takes no verdict: a canceled run's reviews never pass. Call needs_attention to see what is waiting now.",
  trashed:
    "This review's project is in the Trash, so nothing waits on it and it takes no verdict. Restore the project in Settings → Backup & storage → Trash; the review then waits for its verdict again.",
};

export type ExternalAnswerResult =
  | { readonly ok: true; readonly value: ExternalReview }
  | { readonly ok: false; readonly reason: "not-found" }
  | { readonly ok: false; readonly reason: "trashed" }
  | {
      readonly ok: false;
      // `canceled`: its run was canceled, and a canceled run's reviews never pass.
      readonly reason: Exclude<ReviewStanding, "waiting" | "trashed">;
      readonly value: ExternalReview;
    };

export type SettledReview = Pick<
  ExternalReview,
  "id" | "projectId" | "revisionId" | "workId" | "stage" | "itemKey"
>;
