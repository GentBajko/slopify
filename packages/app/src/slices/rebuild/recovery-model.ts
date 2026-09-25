import { z } from "zod";
import { stageKinds } from "../../kernel/pipeline.js";
import { revisionControlSchema } from "../control/revision-control-schema.js";
import { rebuildAdmissionSchema } from "./model.js";

export const recoveryActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("resume") }).strict(),
  z.object({ kind: z.literal("retry"), stage: z.enum(stageKinds) }).strict(),
  z.object({ kind: z.literal("rerun"), stage: z.enum(stageKinds) }).strict(),
]);
export const recoveryRequestSchema = revisionControlSchema
  .extend({
    action: recoveryActionSchema,
  })
  .strict();
export type RecoveryRequest = z.infer<typeof recoveryRequestSchema>;
export const recoveryResultSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    value: rebuildAdmissionSchema.and(z.object({ warnings: z.array(z.string()).readonly() })),
  }),
  z.object({
    ok: z.literal(false),
    reason: z.enum([
      "no-project",
      "no-revision",
      "conflict",
      "idempotency-conflict",
      "invalid-edit",
      "stale-preview",
      "invalid-selection",
      "review-required",
      "cost-ack-required",
      "readiness",
      "running",
      "accepted-job",
      "control-changed",
    ]),
    fields: z
      .array(z.object({ field: z.string(), message: z.string() }))
      .readonly()
      .optional(),
    intentRevisionId: z.string().optional(),
    currentRevisionId: z.string().nullable().optional(),
  }),
]);
export type RecoveryResult = z.infer<typeof recoveryResultSchema>;
