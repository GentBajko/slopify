import type { RunDraft } from "../admission/model.js";
import type { FieldError } from "../admission/rules.js";
import type { QueueEntry } from "../batch/index.js";
import type { CostEstimate } from "../estimate/index.js";
import type { StorageDeps } from "../storage/staging.js";
import type { PlayDraftDocument } from "./schema.js";

export type { PlayDraftDocument, PlayDraftForm } from "./schema.js";
export type DraftDeps = Pick<StorageDeps, "db" | "paths" | "ids" | "clock" | "log"> & {
  readonly uuid: () => string;
};
export interface DraftSummary {
  readonly id: string;
  readonly title: string;
  readonly version: number;
  readonly updatedAt: string;
  readonly readable: boolean;
}
export interface PlayDraft {
  readonly id: string;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly document: PlayDraftDocument;
}
export interface DraftAttachment {
  readonly id: string;
  readonly kind: "audio" | "images" | "thumbnail";
  readonly name: string;
  readonly state: "pending" | "copying" | "ready" | "reattach";
  readonly stagedFileId: string | null;
  readonly bytes: number;
  readonly error: string | null;
}
export interface ResolvedPlayRun {
  readonly draft: RunDraft;
  readonly rendered: Readonly<Record<string, string>>;
  readonly templates: Readonly<Record<string, string>>;
}
export interface PlayReview {
  readonly id: string;
  readonly draftId: string;
  readonly draftVersion: number;
  readonly fingerprint: string;
  readonly runs: readonly ResolvedPlayRun[];
  readonly estimates: readonly CostEstimate[];
}
export interface PlayStartResult {
  readonly requestId: string;
  readonly projectIds: readonly string[];
  readonly queue: readonly QueueEntry[];
  readonly replayed: boolean;
}
export interface DraftView {
  readonly draft: PlayDraft;
  readonly attachments: readonly DraftAttachment[];
  readonly review: PlayReview | null;
  readonly pendingStart: { readonly reviewId: string; readonly draftVersion: number } | null;
  readonly start: PlayStartResult | null;
}
export interface DraftSaveInput {
  readonly id: string;
  readonly baseVersion: number;
  readonly mutationId: string;
  readonly document: PlayDraftDocument;
}
export interface PlayStartInput {
  readonly draftId: string;
  readonly baseVersion: number;
  readonly reviewId: string;
}
export type DraftResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly reason:
        | "not-found"
        | "invalid-draft"
        | "conflict"
        | "invalid-edit"
        | "pending-start"
        | "already-started"
        | "stale-review"
        | "readiness";
      readonly currentVersion: number | null;
      readonly fields: readonly FieldError[];
      readonly reviewId?: string;
    };
