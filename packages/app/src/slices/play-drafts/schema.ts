import { z } from "zod";
import { formats, stageKinds } from "../../kernel/pipeline.js";
import { thinkingModes } from "../../kernel/ports/llm.js";
import { motionStyles, referenceSources, stageSources } from "../admission/model.js";
import {
  defaultEdgeSilenceSeconds,
  defaultImageSeconds,
  defaultMotionStyle,
  defaultZoomPercent,
} from "../admission/rules.js";
import { runDraftSchema, videoEditSchema } from "../admission/schema.js";
import { checkpointRowSchema, checkpointStageSchema } from "../checkpoints/schema.js";
import { documentSettingsSchema } from "../document/theme-schema.js";
import { librarySnapshotSchema } from "../library/snapshot.js";
import { chunkModes } from "../narration/chunk.js";
import { subtitleModes, subtitlePositions } from "../subtitles/model.js";

const id = z.uuid();
const text = z.string();
const values = z.record(text, text).readonly();
const provider = z
  .object({ provider: text, model: text, thinking: z.enum(thinkingModes).optional() })
  .strict();
// What a draft's uploads are for: a stage's files, or the Images stage's establishing image.
export const draftAttachmentKinds = ["audio", "images", "thumbnail", "reference"] as const;
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
        // Absent on drafts and templates saved before the Document stage: Off.
        document: z.enum(stageSources).optional(),
      })
      .strict()
      .readonly(),
    // Absent until the theme is first chosen: the default theme.
    document: documentSettingsSchema.readonly().optional(),
    llm: provider.readonly(),
    audio: provider
      .extend({
        voice: text,
        usePronunciationGlossary: z.boolean().optional(),
        shareGlossary: z.boolean().optional(),
      })
      .readonly(),
    images: provider.readonly(),
    // Absent on drafts and templates saved before the establishing image: Off. The prompt is
    // an image prompt's name, "" when none is picked.
    reference: z
      .object({
        source: z.enum(["off", ...referenceSources]),
        prompt: text,
        thumbnail: z.boolean(),
      })
      .strict()
      .readonly()
      .optional(),
    articlePrompt: text,
    narrationPrompt: text.optional(),
    // Absent on drafts and templates saved before three thumbnails: one.
    thumbnailCount: z.union([z.literal(1), z.literal(3)]).optional(),
    // Absent on drafts and templates saved before the YouTube description: off, built-in prompt.
    youtubeDescription: z.boolean().optional(),
    descriptionPrompt: text.optional(),
    // Absent on drafts and templates saved before Shorts: off. The numbers are raw text, like
    // every other number on Play; the prompts are names, "" being the built-in ones.
    shorts: z
      .object({
        enabled: z.boolean(),
        count: text,
        minSeconds: text,
        maxSeconds: text,
        prompt: text,
        imagePrompt: text,
        // Absent on drafts saved before these: the title off, no link, the music at its
        // default level, normal speed. The two numbers are raw text too.
        titleOnScreen: z.boolean().optional(),
        fullVideoLink: text.optional(),
        musicVolume: text.optional(),
        speed: text.optional(),
      })
      .strict()
      .readonly()
      .optional(),
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
    // Raw text, like every other number on Play, so what was typed survives a reload.
    // Defaulted for drafts and templates saved before these controls existed.
    imageSeconds: text.default(String(defaultImageSeconds)),
    edgeSilenceSeconds: text.default(String(defaultEdgeSilenceSeconds)),
    zoomPercent: text.default(String(defaultZoomPercent)),
    motionStyle: z.enum(motionStyles).default(defaultMotionStyle),
    // Absent on drafts and templates saved before the edit settings: today's slideshow. Every
    // field is a pick from a list, so it is kept as the settings themselves.
    videoEdit: videoEditSchema.strict().readonly().optional(),
    // Whether the channel's brand kit fills what this setup leaves at its default
    // (`slices/channels/runs.ts`). Absent is on.
    useBrandKit: z.boolean().optional(),
    values,
    provided: z
      .object({
        research: text,
        article: text,
        audio: file.nullable(),
        thumbnail: file.nullable(),
        images: z.array(file).readonly(),
        // The uploaded establishing image; absent on drafts saved before it.
        reference: file.nullable().optional(),
        // The Shorts step's background music, uploaded as an audio attachment. Absent on
        // drafts and templates saved before Play offered it: no music.
        shortsMusic: file.nullable().optional(),
      })
      .strict()
      .readonly(),
  })
  .strict()
  .readonly();
export const playDraftDocumentSchema = z
  .object({
    schemaVersion: z.literal(1),
    librarySnapshot: librarySnapshotSchema.optional(),
    templateSource: z
      .object({ id, version: z.number().int().positive() })
      .strict()
      .readonly()
      .optional(),
    // The channel picked on Play. Absent runs in the template's channel, or the default one.
    channelId: id.optional(),
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
    kind: z.enum(draftAttachmentKinds),
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
            onPlan: z.boolean().optional(),
            apiLow: z.number().nullable().optional(),
            apiHigh: z.number().nullable().optional(),
          })
          .strict()
          .readonly(),
      )
      .readonly(),
    low: z.number(),
    high: z.number(),
    unknown: z.number(),
    apiLow: z.number().optional(),
    apiHigh: z.number().optional(),
    apiUnknown: z.number().optional(),
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
            dependents: z.array(z.enum(stageKinds)).readonly(),
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
