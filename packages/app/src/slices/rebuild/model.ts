import { z } from "zod";
import { type StageKind, stageKinds } from "../../kernel/pipeline.js";
import type { FieldError } from "../admission/rules.js";
import type { CostEstimate } from "../estimate/index.js";

export type RebuildSelection =
  | { readonly kind: "allAffected" }
  | { readonly kind: "selected"; readonly workKeys: readonly string[] };

export interface RebuildWork {
  readonly key: string;
  readonly stage: StageKind;
  readonly kind: "provider" | "local" | "provided";
  readonly disposition: "reuse" | "generate" | "local" | "review" | "blocked";
  readonly requestFingerprint: string;
  readonly fingerprint: string;
  readonly dependsOn: readonly string[];
  readonly reason: string;
  readonly inflight: boolean;
  readonly pieceIds: readonly string[];
}

export interface RebuildPreview {
  readonly id: string;
  readonly projectId: string;
  readonly baseRevisionId: string;
  readonly planFingerprint: string;
  readonly selection: RebuildSelection;
  readonly changedInputs: readonly {
    readonly path: string;
    readonly before: string | null;
    readonly after: string | null;
  }[];
  readonly work: readonly RebuildWork[];
  readonly retained: readonly {
    readonly slot: string;
    readonly outputId: string;
    readonly assetId: string;
    readonly state: "ready" | "outdated" | "review";
  }[];
  readonly providedReuseRequired: readonly string[];
  readonly costs: CostEstimate;
  readonly wholeRequestNotice: string | null;
  readonly warnings: readonly string[];
}

export interface RebuildAdmission {
  readonly revisionId: string;
  readonly admissionId: string;
  readonly workIds: readonly string[];
  readonly replayed: boolean;
}

export type RebuildResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly reason:
        | "no-project"
        | "conflict"
        | "stale-preview"
        | "invalid-selection"
        | "review-required"
        | "cost-ack-required"
        | "readiness";
      readonly fields?: readonly FieldError[] | undefined;
    };

export const rebuildSelectionSchema: z.ZodType<RebuildSelection> = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("allAffected") }).strict(),
  z
    .object({
      kind: z.literal("selected"),
      workKeys: z.array(z.string().min(1).max(200)).min(1).max(10000),
    })
    .strict(),
]);

const revisionId = z.string().min(1).max(64);

export const previewRebuildSchema = z
  .object({
    baseRevisionId: revisionId,
    request: rebuildSelectionSchema,
  })
  .strict();

export const startRebuildSchema = z
  .object({
    baseRevisionId: revisionId,
    idempotencyKey: z.uuid(),
    previewId: z.string().min(1).max(64),
    acknowledgeUnknownCosts: z.boolean(),
    confirmedProvidedWorkKeys: z.array(z.string().min(1).max(200)).max(10000),
  })
  .strict();

const costRowSchema = z.object({
  stage: z.string(),
  low: z.number().finite().nonnegative().nullable(),
  high: z.number().finite().nonnegative().nullable(),
  detail: z.string(),
});

const costEstimateSchema: z.ZodType<CostEstimate> = z.object({
  currency: z.literal("USD"),
  rows: z.array(costRowSchema),
  low: z.number().finite().nonnegative(),
  high: z.number().finite().nonnegative(),
  unknown: z.number().int().nonnegative(),
  expectedWords: z.number().finite().nonnegative(),
  catalogueDate: z.string().nullable(),
  assumptions: z.array(z.string()),
});

export const rebuildAdmissionSchema: z.ZodType<RebuildAdmission> = z.object({
  revisionId,
  admissionId: z.string().min(1).max(64),
  workIds: z.array(z.string().min(1).max(64)),
  replayed: z.boolean(),
});

export const rebuildPreviewSchema: z.ZodType<RebuildPreview> = z.object({
  id: z.string().min(1).max(64),
  projectId: z.string().min(1).max(64),
  baseRevisionId: revisionId,
  planFingerprint: z.string().min(1),
  selection: rebuildSelectionSchema,
  changedInputs: z.array(
    z.object({ path: z.string(), before: z.string().nullable(), after: z.string().nullable() }),
  ),
  work: z.array(
    z.object({
      key: z.string(),
      stage: z.enum(stageKinds),
      kind: z.enum(["provider", "local", "provided"]),
      disposition: z.enum(["reuse", "generate", "local", "review", "blocked"]),
      requestFingerprint: z.string(),
      fingerprint: z.string(),
      dependsOn: z.array(z.string()),
      reason: z.string(),
      inflight: z.boolean(),
      pieceIds: z.array(z.string()),
    }),
  ),
  retained: z.array(
    z.object({
      slot: z.string(),
      outputId: z.string(),
      assetId: z.string(),
      state: z.enum(["ready", "outdated", "review"]),
    }),
  ),
  providedReuseRequired: z.array(z.string()),
  costs: costEstimateSchema,
  wholeRequestNotice: z.string().nullable(),
  warnings: z.array(z.string()),
});
