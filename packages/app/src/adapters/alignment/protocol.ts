import { z } from "zod";

export const workerInput = z.object({
  modelPath: z.string(),
  pcmPath: z.string(),
  text: z.string(),
});
export type WorkerInput = z.infer<typeof workerInput>;
export const workerMessage = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("progress"),
    current: z.number().finite().nonnegative(),
    total: z.number().finite().positive(),
  }),
  z.object({
    type: z.literal("done"),
    words: z.array(
      z.object({
        text: z.string(),
        start: z.number().finite().nonnegative(),
        end: z.number().finite().nonnegative(),
        confidence: z.number().finite().min(0).max(1).optional(),
      }),
    ),
  }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);
