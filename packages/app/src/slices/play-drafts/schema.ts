import { z } from "zod";
import { formats } from "../../kernel/pipeline.js";
import { thinkingModes } from "../../kernel/ports/llm.js";
import { stageSources } from "../admission/model.js";
import { runDraftSchema } from "../admission/schema.js";
import { checkpointRowSchema, checkpointStageSchema } from "../checkpoints/schema.js";
import { chunkModes } from "../narration/chunk.js";
import { subtitleModes, subtitlePositions } from "../subtitles/model.js";

const id = z.uuid();
const text = z.string();
const values = z.record(text, text).readonly();
const provider = z
  .object({ provider: text, model: text, thinking: z.enum(thinkingModes).optional() })
  .strict();
const file = z.object({ attachmentId: id, name: text }).strict().readonly();
export const playDraftFormSchema = z
  .object({
    title: text,
    checkpoints: runDraftSchema.shape.checkpoints,
    format: z.enum(formats),
    sources: z
      .object({
        research: z.enum(stageSources),
        article: z.enum(stageSources),
        audio: z.enum(stageSources),
        images: z.enum(stageSources),
        thumbnail: z.enum(stageSources),
        video: z.enum(stageSources),
      })
      .strict()
      .readonly(),
    llm: provider.readonly(),
    audio: provider.extend({ voice: text }).readonly(),
    images: provider.readonly(),
    articlePrompt: text,
    imagePrompts: z.array(z.object({ name: text, number: text }).strict().readonly()).readonly(),
    thumbnailPrompt: text,
    intro: text,
    outro: text,
    chunking: z
      .object({ mode: z.enum(chunkModes), words: text, characters: text })
      .strict()
      .readonly(),
    subtitles: z
      .object({
        mode: z.enum(subtitleModes),
        language: z.literal("en"),
        fontId: text,
        fontSize: text,
        position: z.enum(subtitlePositions),
      })
      .strict()
      .readonly(),
    values,
    provided: z
      .object({
        research: text,
        article: text,
        audio: file.nullable(),
        thumbnail: file.nullable(),
        images: z.array(file).readonly(),
      })
      .strict()
      .readonly(),
  })
  .strict()
  .readonly();
export const playDraftDocumentSchema = z
  .object({
    schemaVersion: z.literal(1),
    form: playDraftFormSchema,
    section: z.enum(["content", "outputs", "style", "review"]),
    variants: z.array(z.object({ id, title: text, values }).strict().readonly()).readonly(),
    expectedWords: text,
    previewText: text,
    fontUpload: z.object({ operationId: id, name: text }).strict().readonly().nullable(),
  })
  .strict()
  .readonly();
export type PlayDraftForm = z.infer<typeof playDraftFormSchema>;
export type PlayDraftDocument = z.infer<typeof playDraftDocumentSchema>;
export const createDraftInputSchema = z
  .object({ id, document: playDraftDocumentSchema })
  .strict()
  .readonly();
export const saveDraftInputSchema = createDraftInputSchema
  .unwrap()
  .extend({ baseVersion: z.number().int().positive(), mutationId: id })
  .strict()
  .readonly();
export const forkDraftInputSchema = createDraftInputSchema
  .unwrap()
  .extend({ sourceId: id })
  .strict()
  .readonly();
export const discardDraftInputSchema = z
  .object({ id, baseVersion: z.number().int().positive() })
  .strict()
  .readonly();

export const draftAttachmentSchema = z
  .object({
    id,
    kind: z.enum(["audio", "images", "thumbnail"]),
    name: text,
    state: z.enum(["pending", "copying", "ready", "reattach"]),
    stagedFileId: text.nullable(),
    bytes: z.number().nonnegative(),
    error: text.nullable(),
  })
  .strict()
  .readonly();
export const playDraftSchema = z
  .object({
    id,
    version: z.number().int().positive(),
    createdAt: text,
    updatedAt: text,
    document: playDraftDocumentSchema,
  })
  .strict()
  .readonly();
export const playStartResultSchema = z
  .object({
    checkpointSet: z
      .array(checkpointRowSchema.unwrap().extend({ reviewedFingerprint: text }).strict().readonly())
      .readonly()
      .optional(),
    requestId: id,
    projectIds: z.array(text).readonly(),
    queue: z
      .array(
        z
          .object({
            projectId: text,
            batchId: text,
            position: z.number(),
            state: z.enum(["queued", "active", "finished"]),
          })
          .strict()
          .readonly(),
      )
      .readonly(),
    replayed: z.boolean(),
  })
  .strict()
  .readonly();
const costEstimateSchema = z
  .object({
    currency: z.literal("USD"),
    rows: z
      .array(
        z
          .object({
            stage: text,
            low: z.number().nullable(),
            high: z.number().nullable(),
            detail: text,
          })
          .strict()
          .readonly(),
      )
      .readonly(),
    low: z.number(),
    high: z.number(),
    unknown: z.number(),
    expectedWords: z.number(),
    catalogueDate: text.nullable(),
    assumptions: z.array(text).readonly(),
  })
  .strict()
  .readonly();
export const playReviewSchema = z
  .object({
    checkpointSet: z
      .array(
        z
          .object({
            runIndex: z.number().int().nonnegative(),
            checkpointId: text,
            stage: checkpointStageSchema,
            fingerprint: text,
            workKeys: z.array(text).readonly(),
            dependents: z
              .array(z.enum(["research", "article", "audio", "images", "thumbnail", "video"]))
              .readonly(),
          })
          .strict()
          .readonly(),
      )
      .readonly()
      .optional(),
    id,
    draftId: id,
    draftVersion: z.number().int().positive(),
    fingerprint: text,
    runs: z
      .array(
        z
          .object({ draft: runDraftSchema, rendered: values, templates: values })
          .strict()
          .readonly(),
      )
      .readonly(),
    estimates: z.array(costEstimateSchema).readonly(),
  })
  .strict()
  .readonly();
export const draftViewSchema = z
  .object({
    draft: playDraftSchema,
    attachments: z.array(draftAttachmentSchema).readonly(),
    review: playReviewSchema.nullable(),
    pendingStart: z
      .object({ reviewId: id, draftVersion: z.number().int().positive() })
      .strict()
      .readonly()
      .nullable(),
    start: playStartResultSchema.nullable(),
  })
  .strict()
  .readonly();
