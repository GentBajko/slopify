import { z } from "zod";
import { playDraftDocumentSchema } from "../play-drafts/schema.js";

// The longest template name, in characters. Play's Save as template and Library → Templates
// (save and rename) cap their name fields at it, and a new template is refused past it.
export const templateNameMax = 120;
// A template named before the cap (Play once allowed 200) can still be saved under its name.
const templateNameStoredMax = 200;

export const templateCreateSchema = z
  .object({
    id: z.uuid(),
    name: z.string().trim().min(1).max(templateNameMax),
    document: playDraftDocumentSchema,
  })
  .strict()
  .readonly();
export const templateUpdateSchema = templateCreateSchema
  .unwrap()
  .extend({
    name: z.string().trim().min(1).max(templateNameStoredMax),
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
