import { z } from "zod";
import { playDraftDocumentSchema } from "../play-drafts/schema.js";

export const templateCreateSchema = z
  .object({
    id: z.uuid(),
    name: z.string().trim().min(1).max(200),
    document: playDraftDocumentSchema,
  })
  .strict()
  .readonly();
export const templateUpdateSchema = templateCreateSchema
  .unwrap()
  .extend({
    baseVersion: z.number().int().positive(),
    mutationId: z.uuid(),
  })
  .strict()
  .readonly();
export const templateDeleteSchema = z
  .object({ id: z.uuid(), baseVersion: z.number().int().positive() })
  .strict()
  .readonly();
export const templateInstantiateSchema = z
  .object({ templateId: z.uuid(), id: z.uuid(), version: z.number().int().positive() })
  .strict()
  .readonly();
export const projectTemplateSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    version: z.number().int().positive(),
    createdAt: z.string(),
    updatedAt: z.string(),
    document: playDraftDocumentSchema,
  })
  .strict()
  .readonly();
