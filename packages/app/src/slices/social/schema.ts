import { z } from "zod";
import {
  postTextSources,
  redditPostKinds,
  reportedStates,
  socialPlatforms,
  xTiers,
} from "./model.js";

export const promptNameMax = 200;
export const customTextMax = 5000;
export const postTextMax = 50_000;
export const hashtagsMax = 30;
export const picturesMax = 35;
export const designsMax = 10;

const designId = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/);

export const postMediaSchema = z
  .object({
    video: z.enum(["long", "short"]).optional(),
    short: z.number().int().min(1).max(99).optional(),
    thumbnail: z.boolean().optional(),
    pictures: z.number().int().min(0).max(picturesMax).optional(),
    designs: z.array(designId).max(designsMax).optional(),
  })
  .strict();

export const postChoiceSchema = z
  .object({
    text: z.enum(postTextSources),
    prompt: z.string().max(promptNameMax).optional(),
    custom: z.string().max(customTextMax).optional(),
    media: postMediaSchema,
    hashtags: z.number().int().min(0).max(hashtagsMax),
    link: z.boolean(),
  })
  .strict();

// `config.social` (and Play's `form.social`): absent is no posting.
export const socialSettingsSchema = z.partialRecord(z.enum(socialPlatforms), postChoiceSchema);

export const projectPostChoiceSchema = z.union([
  postChoiceSchema,
  z.object({ off: z.literal(true) }).strict(),
]);

export const subredditMax = 21;
export const redditFieldsSchema = z
  .object({
    subreddit: z
      .string()
      .max(subredditMax + 2)
      .transform((name) => name.trim().replace(/^\/?r\//u, "")),
    title: z.string().max(300),
    flair: z.string().max(64),
    kind: z.enum(redditPostKinds),
  })
  .strict();

export const platformSchema = z.enum(socialPlatforms);
export const xTierSchema = z.enum(xTiers);

// The page's bodies (`edge/http/social.ts`).
export const choiceBody = z.object({ choice: projectPostChoiceSchema.nullable() }).strict();
export const textBody = z
  .object({ text: z.string().max(postTextMax), base: z.string().max(postTextMax) })
  .strict();
export const redditBody = z.object({ reddit: redditFieldsSchema }).strict();
export const linkBody = z.object({ url: z.string().max(500).nullable() }).strict();

// The extension's report after a fill. Unknown keys are dropped, so a newer extension's
// report still reaches an older Slopify.
export const resultBody = z.object({
  projectId: z.string().min(1).max(64),
  platform: platformSchema,
  item: z.number().int().min(0).max(99).optional(),
  state: z.enum(reportedStates),
  url: z.string().max(500).optional(),
  message: z.string().max(2000).optional(),
  at: z.iso.datetime().optional(),
});
