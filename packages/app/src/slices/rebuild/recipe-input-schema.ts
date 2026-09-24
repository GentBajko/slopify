import { z } from "zod";
import { messageRoles, thinkingModes } from "../../kernel/ports/llm.js";
import { llmDocumentsSchema } from "../../kernel/ports/llm-documents.js";
import type { FingerprintValue } from "../../kernel/runner/work.js";
import { deferredOperations, localOperations, type RecipeInput } from "./recipe-model.js";

const value: z.ZodType<FingerprintValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number().finite(),
    z.string(),
    z.array(value),
    z.record(z.string(), value),
  ]),
);
const version = z.literal(1);
export const recipeInputSchema: z.ZodType<RecipeInput> = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("llm"),
      version,
      provider: z.string(),
      model: z.string(),
      thinking: z.enum(thinkingModes).nullable(),
      thinkingConfig: z
        .object({
          budget: z.number().finite().optional(),
          level: z.enum(["minimal", "low", "medium", "high"]).optional(),
          effort: z.enum(["none", "minimal", "low", "medium", "high", "xhigh"]).optional(),
        })
        .strict()
        .nullable(),
      messages: z.array(z.object({ role: z.enum(messageRoles), content: z.string() }).strict()),
      documents: llmDocumentsSchema.optional(),
      webSearch: z.boolean(),
      preparation: z
        .object({
          format: z.literal("inworld-tts-2"),
          version,
          source: z.string(),
          logicalKey: z.string(),
          segment: z.enum(["body", "intro", "outro"]),
        })
        .strict()
        .optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("tts"),
      version,
      provider: z.string(),
      model: z.string(),
      voice: z.string(),
      text: z.string(),
      spokenText: z.string().optional(),
      logicalKey: z.string(),
      logicalText: z.string(),
      segment: z.enum(["body", "intro", "outro"]),
      pronunciation: z.null(),
      wholeRequest: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("image"),
      version,
      provider: z.string(),
      model: z.string(),
      prompt: z.string(),
      aspect: z.enum(["16:9", "9:16"]),
    })
    .strict(),
  z
    .object({
      kind: z.literal("provided"),
      version,
      assetId: z.string().nullable(),
      semantic: value,
    })
    .strict(),
  z
    .object({
      kind: z.literal("local"),
      version,
      operation: z.enum(localOperations),
      values: value,
    })
    .strict(),
  z
    .object({
      kind: z.literal("deferred"),
      version,
      operation: z.enum(deferredOperations),
      template: value,
    })
    .strict(),
]);
