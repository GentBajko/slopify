import { z } from "zod";
import { castPerDesignMax, designKinds, designNameMax, instructionMax } from "./model.js";
import { designDocumentSchema } from "./schema.js";

// What the design routes and tools take. Browser-safe, like schema.ts.

// Letters, digits, dashes and underscores: a design id names its folder of drawn files.
const id = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/);
const mutationId = z.string().min(8).max(128);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
export const designValuesSchema = z
  .record(z.string().min(1).max(100), z.string().max(2000))
  .refine((values) => Object.keys(values).length <= 100, {
    message: "A design has at most 100 keywords.",
  });

export const createDesignSchema = z
  .object({
    id,
    mutationId,
    kind: z.enum(designKinds),
    name: z.string().trim().min(1).max(designNameMax),
    channelId: id.optional(),
    projectId: id.optional(),
    // The picture to start from: an upload, or a version another design already has.
    stagedFileId: id.optional(),
    fromStepSha: sha256.optional(),
    document: designDocumentSchema.optional(),
    values: designValuesSchema.optional(),
  })
  .strict()
  .refine((input) => input.stagedFileId === undefined || input.fromStepSha === undefined, {
    message: "Start from an upload or from an earlier version, not both.",
  });
export type CreateDesignInput = z.infer<typeof createDesignSchema>;

export const updateDesignSchema = z
  .object({
    baseUpdatedAt: z.string().min(1).max(64),
    name: z.string().trim().min(1).max(designNameMax).optional(),
    projectId: id.nullable().optional(),
    document: designDocumentSchema.optional(),
    values: designValuesSchema.optional(),
  })
  .strict();
export type UpdateDesignInput = z.infer<typeof updateDesignSchema>;

export const quoteEditSchema = z
  .object({
    provider: z.string().min(1).max(64),
    model: z.string().min(1).max(200),
    castMemberIds: z.array(id).max(castPerDesignMax).optional(),
  })
  .strict();

export const editPictureSchema = z
  .object({
    mutationId,
    fromStepId: id,
    instruction: z.string().trim().min(1).max(instructionMax),
    provider: z.string().min(1).max(64),
    model: z.string().min(1).max(200),
    castMemberIds: z.array(id).max(castPerDesignMax).optional(),
    // The highest cost the person saw on the button, in dollars; 0 for plan usage.
    acknowledgedHigh: z.number().min(0).max(1000),
    // That the button said the price is unknown, and the person pressed it anyway.
    acknowledgedUnknown: z.boolean().optional(),
  })
  .strict();
export type EditPictureInput = z.infer<typeof editPictureSchema>;

export const makeArtworkSchema = z
  .object({
    mutationId,
    acknowledgedHigh: z.number().min(0).max(1000),
    acknowledgedUnknown: z.boolean().optional(),
  })
  .strict();

// Try again asks the provider again, which is paid again: at the price the button showed.
export const retryStepSchema = z
  .object({
    acknowledgedHigh: z.number().min(0).max(1000),
    acknowledgedUnknown: z.boolean().optional(),
  })
  .strict();
export type MakeArtworkInput = z.infer<typeof makeArtworkSchema>;

export const setHeadSchema = z.object({ stepId: id }).strict();
