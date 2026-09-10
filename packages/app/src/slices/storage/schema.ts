import { z } from "zod";
import { outputRoles, stagedFileStates, stageKinds } from "./model.js";

export const metaSchema = z.object({
  subtitleOmissions: z
    .array(z.object({ start: z.number().finite().nonnegative(), text: z.string() }))
    .optional(),
  subtitlesMode: z.enum(["off", "files", "burn-in"]).optional(),
  promptName: z.string().optional(),
  prompt: z.string().optional(),
  index: z.number().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
  voice: z.string().optional(),
});

export const outputSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  stageKind: z.enum(stageKinds),
  role: z.enum(outputRoles),
  path: z.string(),
  originalFilename: z.string().nullable(),
  bytes: z.number().nonnegative(),
  durationMs: z.number().nonnegative().nullable(),
  meta: metaSchema,
  createdAt: z.string(),
});

export const stagedFileSchema = z.object({
  id: z.string(),
  stageKind: z.enum(stageKinds),
  path: z.string(),
  originalFilename: z.string(),
  bytes: z.number().nonnegative(),
  state: z.enum(stagedFileStates),
  createdAt: z.string(),
});
