import { z } from "zod";
import { runConfigSchema } from "../admission/schema.js";
import { costEstimateSchema } from "../rebuild/model.js";
import { revisionViewSchema } from "../revisions/schema.js";
import { addableOutputs } from "./add.js";

// The add-another-output requests and replies, shared by the route and the project page.

const revisionId = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[0-9A-Za-z_-]+$/);

export const addOutputPreviewRequestSchema = z
  .object({ baseRevisionId: revisionId, kind: z.enum(addableOutputs) })
  .strict();

export const addOutputRequestSchema = addOutputPreviewRequestSchema
  .extend({ idempotencyKey: z.uuid(), adapt: z.boolean().optional() })
  .strict();

const fieldSchema = z.object({ field: z.string(), message: z.string() });

export const addedOutputPreviewSchema = z.object({
  kind: z.enum(addableOutputs),
  label: z.string(),
  reused: z.array(z.string()),
  created: z.array(z.string()),
  textUse: z.string(),
  adapts: z.boolean(),
  estimate: costEstimateSchema,
  problems: z.array(fieldSchema),
  // The settings with the output switched on, for Settings to open with when a choice is missing.
  config: runConfigSchema,
});

export const addedOutputSchema = z.object({
  ok: z.literal(true),
  view: revisionViewSchema,
  workKeys: z.array(z.string()),
  duplicate: z.boolean(),
});
