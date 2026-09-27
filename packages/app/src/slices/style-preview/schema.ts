import { z } from "zod";
import { formats } from "../../kernel/pipeline.js";
import { videoEditSchema } from "../admission/schema.js";
import { subtitleModes, subtitlePositions } from "../subtitles/model.js";

// "See it before you make it": a few seconds rendered by the real renderer with a project's
// caption and Look settings, on stills and silence Slopify makes itself. Browser-safe, so
// Play and Edit project read the same request and reply shapes the server checks.

// How long the preview runs: three stills of two seconds, so a transition and a chapter
// card both show.
export const stylePreviewSeconds = 6;
export const stylePreviewTextMax = 200;
export const defaultPreviewText = "Every story begins with a word.";

export const stylePreviewRequestSchema = z.object({
  format: z.enum(formats),
  subtitles: z.object({
    mode: z.enum(subtitleModes),
    fontId: z
      .string()
      .max(160)
      .regex(/^[A-Za-z0-9_-]+$/),
    fontSize: z.number().finite().min(16).max(120),
    position: z.enum(subtitlePositions),
  }),
  videoEdit: videoEditSchema.optional(),
  previewText: z.string().max(stylePreviewTextMax).optional(),
  // Render again even when this exact preview is already saved.
  force: z.boolean().optional(),
});
export type StylePreviewRequest = z.infer<typeof stylePreviewRequestSchema>;

export const stylePreviewReplySchema = z.object({
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  // GET it for the mp4; its query changes whenever the file is rendered again.
  url: z.string().min(1),
  cached: z.boolean(),
  seconds: z.number().positive(),
});
export type StylePreviewReply = z.infer<typeof stylePreviewReplySchema>;
