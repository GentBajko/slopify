import { z } from "zod";
import { thinkingModes } from "../../kernel/ports/llm.js";
import { chunkModes } from "../narration/chunk.js";
import { subtitleConfigSchema } from "../subtitles/model.js";
import { entryModes, formats, stageSources } from "./model.js";

const providerChoice = z.object({
  provider: z.string(),
  model: z.string(),
  thinking: z.enum(thinkingModes).optional(),
});
const entryChoice = z.object({ name: z.string(), mode: z.enum(entryModes) });

// The shape Play posts and the shape `projects.config` holds, in one place: the second
// is the first plus the rendered prompt texts.
export const runDraftSchema = z.object({
  title: z.string(),
  format: z.enum(formats),
  // Spelled out rather than built from stageKinds, so the inferred type carries the six
  // keys and this schema stays assignable to the domain type without a cast.
  sources: z.object({
    research: z.enum(stageSources),
    article: z.enum(stageSources),
    audio: z.enum(stageSources),
    images: z.enum(stageSources),
    thumbnail: z.enum(stageSources),
    video: z.enum(stageSources),
  }),
  llm: providerChoice.optional(),
  audio: providerChoice.extend({ voice: z.string() }).optional(),
  images: providerChoice.optional(),
  articlePrompt: z.string().optional(),
  imagePrompts: z.array(z.object({ name: z.string(), number: z.number() })),
  thumbnailPrompt: z.string().optional(),
  intro: entryChoice.optional(),
  outro: entryChoice.optional(),
  values: z.record(z.string(), z.string()),
  provided: z.object({
    research: z.string().optional(),
    article: z.string().optional(),
    audio: z.string().optional(),
    images: z.array(z.string()).optional(),
    thumbnail: z.string().optional(),
  }),
  // Optional until Play carries the control; unknown keys are stripped by this schema, so
  // a mode not listed here would never reach the audio stage.
  chunking: z
    .object({
      mode: z.enum(chunkModes),
      words: z.number().optional(),
      characters: z.number().int().min(1).max(1000000).optional(),
    })
    .optional(),
  silenceGapSeconds: z.number(),
  subtitles: subtitleConfigSchema.optional(),
});

export const runConfigSchema = runDraftSchema.extend({
  rendered: z.record(z.string(), z.string()),
});
