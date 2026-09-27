import { z } from "zod";

export const workerInput = z.object({
  modelPath: z.string(),
  pcmPath: z.string(),
  text: z.string(),
  // Narration aliases the audio was read with; see speechWords.
  aliases: z
    .array(
      z.object({
        written: z.string(),
        spoken: z.string(),
        wholeWord: z.boolean(),
        caseSensitive: z.boolean(),
      }),
    )
    .optional(),
});
export type WorkerInput = z.infer<typeof workerInput>;
export const omissionSchema = z.object({
  start: z.number().finite().nonnegative(),
  text: z.string().min(1).max(10000),
});

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
  omissionSchema.extend({ type: z.literal("omission") }),
  z.object({
    type: z.literal("error"),
    message: z.string(),
    mismatch: z
      .object({
        at: z.number().finite().nonnegative(),
        expected: z.string().max(2000),
        heard: z.string().max(2000),
      })
      .optional(),
  }),
]);
