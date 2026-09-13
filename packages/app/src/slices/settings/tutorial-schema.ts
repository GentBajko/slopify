import { z } from "zod";

export const tutorialSessionSchema = z
  .object({
    schemaVersion: z.literal(1),
    active: z.boolean(),
    stepId: z.enum([
      "text-key",
      "audio-key",
      "image-key",
      "voice",
      "article-name",
      "article-body",
      "article-keywords",
      "article-save",
      "image-prompt",
      "image-save",
      "play-options",
      "play-article",
      "play-keywords",
      "play-audio",
      "play-images",
      "play-video",
      "play-subtitles",
      "play-start",
      "project",
      "download",
    ]),
    articleId: z.string().optional(),
    imageId: z.string().optional(),
    projectId: z.string().optional(),
  })
  .strict();
export const tutorialWriteSchema = z
  .object({
    baseVersion: z.number().int().nonnegative(),
    mutationId: z.uuid(),
    session: tutorialSessionSchema,
  })
  .strict();
export type TutorialSession = Readonly<z.infer<typeof tutorialSessionSchema>>;
export type TutorialWrite = Readonly<z.infer<typeof tutorialWriteSchema>>;
export type TutorialView = {
  readonly version: number;
  readonly session: TutorialSession;
  readonly readable: boolean;
};
