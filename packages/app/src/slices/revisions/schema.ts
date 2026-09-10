import { z } from "zod";
import { stageKinds } from "../../kernel/pipeline.js";
import { pieceKinds, pieceStates } from "../../kernel/runner/piece-repo.js";
import { runConfigSchema } from "../admission/schema.js";
import { outputSchema } from "../storage/schema.js";

const id = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[0-9A-Za-z_-]+$/);
const workKey = z.string().min(1).max(256);
const tokens = z.record(workKey, id);
const cue = z
  .object({
    id,
    text: z.string().trim().min(1).max(10000),
    start: z.number().finite().nonnegative(),
    end: z.number().finite().positive(),
  })
  .strict()
  .refine((value) => value.end > value.start, {
    path: ["end"],
    message: "End must be after start.",
  });
export const revisionContentSchema = z
  .object({
    articleMarkdown: z.string().max(500000).optional(),
    articleEdited: z.boolean().default(false),
    provided: z
      .object({
        research: id.optional(),
        article: id.optional(),
        audio: id.optional(),
        thumbnail: id.optional(),
      })
      .strict(),
    imageOrder: z.array(id).max(60),
    imageDefinitions: z.record(
      id,
      z
        .object({
          source: z.enum(["generate", "provide"]),
          assetId: id.nullable(),
          prompt: z.string().max(500000).nullable(),
          templateKey: z.string().min(1).max(256).nullable().optional(),
        })
        .strict(),
    ),
    narrationOverrides: z.record(
      workKey,
      z.discriminatedUnion("kind", [
        z.object({ kind: z.literal("asset"), assetId: id }).strict(),
        z.object({ kind: z.literal("text"), text: z.string().trim().min(1).max(500000) }).strict(),
      ]),
    ),
    subtitleCues: z
      .object({
        audioFingerprint: z.string().min(1),
        cues: z.array(cue),
      })
      .strict()
      .optional(),
    regenerationTokens: tokens,
    promptTemplates: z.record(z.string().min(1), z.string().max(500000).nullable()),
  })
  .strict();
export const revisionEditSchema = z
  .object({
    config: runConfigSchema.strict(),
    content: revisionContentSchema,
    regenerate: z.array(workKey).optional(),
    uploads: z
      .array(
        z
          .object({
            stagedFileId: id,
            destination: z.discriminatedUnion("kind", [
              z
                .object({ kind: z.literal("provided"), stage: z.enum(["audio", "thumbnail"]) })
                .strict(),
              z.object({ kind: z.literal("image"), imageKey: id }).strict(),
              z.object({ kind: z.literal("narration"), key: workKey }).strict(),
            ]),
          })
          .strict(),
      )
      .max(10000)
      .optional(),
  })
  .strict();
export const saveRevisionSchema = z
  .object({
    baseRevisionId: id,
    idempotencyKey: id,
    edit: revisionEditSchema,
  })
  .strict();
export const restoreRevisionSchema = z
  .object({
    baseRevisionId: id,
    idempotencyKey: id,
    targetRevisionId: id,
  })
  .strict();

export const projectRevisionSchema = z.object({
  id,
  projectId: id,
  parentId: id.nullable(),
  restoredFromId: id.nullable(),
  config: runConfigSchema,
  content: revisionContentSchema,
  fingerprints: z.record(workKey, z.string()),
  createdAt: z.string(),
});
export const stagePieceSchema = z.object({
  id,
  stageId: id,
  kind: z.enum(pieceKinds),
  idx: z.number().int(),
  state: z.enum(pieceStates),
  payload: z.string().nullable(),
});
const manifestOutputSchema = z.object({
  slot: z.string(),
  workKey,
  assetId: id,
  output: outputSchema,
  fingerprint: z.string(),
  state: z.enum(["ready", "outdated", "review"]),
});
const manifestPieceSchema = z.object({
  key: workKey,
  stageKind: z.enum(stageKinds),
  piece: stagePieceSchema,
  assetId: id.nullable(),
  fingerprint: z.string(),
});
const viewFields = {
  recordId: id,
  publicationId: id.nullable(),
  selected: z.boolean(),
  available: z.boolean(),
};
export const revisionViewSchema = z.object({
  articleMarkdown: z.string().nullable(),
  revision: projectRevisionSchema,
  outputs: z.array(manifestOutputSchema.extend(viewFields)),
  pieces: z.array(manifestPieceSchema.extend(viewFields)),
  current: z.boolean(),
});
export const revisionSummarySchema = z.object({
  id,
  parentId: id.nullable(),
  restoredFromId: id.nullable(),
  title: z.string(),
  createdAt: z.string(),
  current: z.boolean(),
});
export const revisionMutationSuccessSchema = z.object({
  ok: z.literal(true),
  view: revisionViewSchema,
  duplicate: z.boolean(),
});
export const baselineSuccessSchema = z.object({
  ok: z.literal(true),
  view: revisionViewSchema,
  created: z.boolean(),
});
