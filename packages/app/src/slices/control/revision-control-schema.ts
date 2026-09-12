import { z } from "zod";

export const revisionControlSchema = z
  .object({
    baseRevisionId: z.string().min(1).max(64),
    idempotencyKey: z.uuid(),
  })
  .strict();
export type RevisionControlInput = z.infer<typeof revisionControlSchema>;
