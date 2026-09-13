export type CheckpointId = string;
export type CheckpointStage = "audio" | "images" | "video";
export type CheckpointState =
  | "configured"
  | "pending-review"
  | "held"
  | "released"
  | "satisfied"
  | "invalidated"
  | "canceled";

export interface CheckpointRow {
  readonly projectId: string;
  readonly revisionId: string;
  readonly checkpointId: CheckpointId;
  readonly stage: CheckpointStage;
  readonly workId: string;
  readonly fingerprint: string;
  readonly state: CheckpointState;
  readonly createdAt: string;
  readonly approvedAt: string | null;
}
export interface CheckpointSetInput {
  readonly projectId: string;
  readonly revisionId: string;
  readonly checkpoints: readonly {
    readonly checkpointId: CheckpointId;
    readonly stage: CheckpointStage;
    readonly workId: string;
    readonly fingerprint: string;
    readonly state: "configured" | "pending-review" | "held";
  }[];
  readonly createdAt: string;
}
export interface CheckpointApprovalInput {
  readonly projectId: string;
  readonly revisionId: string;
  readonly checkpointId: CheckpointId;
  readonly fingerprint: string;
  readonly idempotencyKey: string;
  readonly approvedAt: string;
}
export type CheckpointRefusal = "duplicate" | "not-found" | "conflict" | "invalid-input";
export type CheckpointResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: CheckpointRefusal; readonly value?: T };
export type CheckpointDecision =
  | { readonly kind: "held"; readonly checkpointIds: readonly CheckpointId[] }
  | { readonly kind: "eligible" }
  | { readonly kind: "refused"; readonly reason: CheckpointRefusal };
