import { z } from "zod";

const id = z.string().min(1);
const fingerprint = z.string().regex(/^[a-f0-9]{64}$/);
export const checkpointStageSchema = z.enum(["audio", "images", "video"]);
export const checkpointStateSchema = z.enum([
  "configured",
  "pending-review",
  "held",
  "released",
  "satisfied",
  "invalidated",
  "canceled",
]);
export const checkpointRowSchema = z
  .object({
    projectId: id,
    revisionId: id,
    checkpointId: id,
    stage: checkpointStageSchema,
    workId: id,
    fingerprint,
    state: checkpointStateSchema,
    createdAt: z.iso.datetime(),
    approvedAt: z.iso.datetime().nullable(),
  })
  .strict()
  .readonly();
export const checkpointSetSchema = z
  .object({
    projectId: id,
    revisionId: id,
    checkpoints: z
      .array(
        z
          .object({
            checkpointId: id,
            stage: checkpointStageSchema,
            workId: id,
            fingerprint,
            state: z.enum(["configured", "pending-review", "held"]),
          })
          .strict()
          .readonly(),
      )
      .max(3)
      .readonly(),
    createdAt: z.iso.datetime(),
  })
  .strict()
  .readonly();
export const checkpointApprovalSchema = z
  .object({
    projectId: id,
    revisionId: id,
    checkpointId: id,
    fingerprint,
    idempotencyKey: z.uuid(),
    approvedAt: z.iso.datetime(),
  })
  .strict()
  .readonly();
