import { z } from "zod";
import { formats } from "../../kernel/pipeline.js";
import { videoEditSchema } from "../admission/schema.js";
import { subtitleModes, subtitlePositions } from "../subtitles/model.js";

// "See it before you make it": a few seconds rendered by the real renderer with a project's
// caption and Look settings, on the bundled sample's images and narration. Browser-safe, so
// Play and Edit project read the same request and reply shapes the server checks.

// How long the preview runs: three images of two seconds, so a transition and a chapter
// card both show, under six seconds of the sample narration.
export const stylePreviewSeconds = 6;
export const stylePreviewTextMax = 200;
// The sample text Play starts with. It, or no text, captions the sample narration with its own
// words; any other text is spread over the stretches the narration speaks.
export const defaultPreviewText = "Every story begins with a word.";
export const shortTitlePreviewMax = 100;

// A picture the preview is drawn on instead of the sample stills: the establishing image a
// draft uploaded (its staged file), one a project already has (its output), or a channel cast
// member's picture (by content hash). One the server can no longer find falls back to the
// stills rather than failing the preview.
export const stylePreviewImageSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("upload"), stagedFileId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) }),
  z.object({ kind: z.literal("output"), outputId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) }),
  z.object({ kind: z.literal("picture"), sha256: z.string().regex(/^[a-f0-9]{64}$/) }),
]);
export type StylePreviewImage = z.infer<typeof stylePreviewImageSchema>;

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
  image: stylePreviewImageSchema.optional(),
  // The Shorts layout instead of the video's: 9:16 through the Shorts renderer, with its
  // big word-by-word captions in the caption font, the title as a headline when it is on,
  // and the clips' speed. The caption size, position and the Look don't apply to a short.
  shorts: z
    .object({
      titleOnScreen: z.boolean(),
      speed: z.number().finite().min(1).max(1.25).optional(),
      // The headline; absent or blank shows the sample's title.
      title: z.string().max(shortTitlePreviewMax).optional(),
    })
    .optional(),
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
