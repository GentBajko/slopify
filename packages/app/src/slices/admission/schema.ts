import { z } from "zod";
import { languageSchema } from "../../kernel/ports/languages.js";
import { thinkingModes } from "../../kernel/ports/llm.js";
import { castSnapshotSchema } from "../channels/schema.js";
import { checkpointStageSchema } from "../checkpoints/schema.js";
import { documentSettingsSchema } from "../document/theme-schema.js";
import { narrationAliasesSchema } from "../narration/aliases-schema.js";
import { chunkModes } from "../narration/chunk.js";
import { reviewModes, reviewStages } from "../reviews/model.js";
import { subtitleConfigSchema } from "../subtitles/model.js";
import { ambientBedSchema } from "../video/ambient-bed-schema.js";
import {
  animateModes,
  atmospheres,
  colorGrades,
  cutModes,
  lookLevels,
  transitionKinds,
} from "../video/edit-settings.js";
import { voicesSettingsSchema } from "../voices/model.js";
import {
  entryModes,
  formats,
  motionStyles,
  referenceSources,
  runModes,
  stageSources,
} from "./model.js";
import {
  defaultEdgeSilenceSeconds,
  defaultImageSeconds,
  defaultMotionStyle,
  defaultZoomPercent,
} from "./rules.js";

const hexColour = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
const providerChoice = z.object({
  provider: z.string(),
  model: z.string(),
  thinking: z.enum(thinkingModes).optional(),
});
const entryChoice = z.object({ name: z.string(), mode: z.enum(entryModes) });
export const videoEditSchema = z.object({
  cuts: z.enum(cutModes),
  transition: z.enum(transitionKinds),
  transitionSeconds: z.number(),
  vignette: z.enum(lookLevels),
  grain: z.enum(lookLevels),
  grade: z.enum(colorGrades),
  atmosphere: z.enum(atmospheres),
  chapterCards: z.boolean(),
  animate: z.enum(animateModes),
  animateEvery: z.number(),
  animateModel: z.string(),
});

// The shape Play posts and the shape `projects.config` holds, in one place: the second
// is the first plus the rendered prompt texts.
export const runDraftSchema = z.object({
  // Absent is the long video.
  mode: z.enum(runModes).optional(),
  checkpoints: z
    .array(checkpointStageSchema)
    .max(3)
    .refine((stages) => new Set(stages).size === stages.length)
    .readonly()
    .optional(),
  title: z.string(),
  format: z.enum(formats),
  // Spelled out rather than built from stageKinds, so the inferred type carries the
  // keys and this schema stays assignable to the domain type without a cast. Document is
  // optional: everything saved before it existed has no such key, and absent means Off.
  sources: z.object({
    research: z.enum(stageSources),
    article: z.enum(stageSources),
    audio: z.enum(stageSources),
    images: z.enum(stageSources),
    thumbnail: z.enum(stageSources),
    video: z.enum(stageSources),
    document: z.enum(stageSources).optional(),
  }),
  llm: providerChoice.optional(),
  audio: providerChoice
    .extend({
      voice: z.string(),
      usePronunciationGlossary: z.boolean().optional(),
      shareGlossary: z.boolean().optional(),
      useNarrationAliases: z.boolean().optional(),
      describeFigures: z.boolean().optional(),
      skipCode: z.boolean().optional(),
    })
    .optional(),
  narrationAliases: narrationAliasesSchema.optional(),
  sharedGlossary: z
    .array(
      z.object({
        term: z.string().min(1).max(200),
        ipa: z.array(z.string().min(1).max(200)).min(1).max(20).readonly(),
      }),
    )
    .max(20000)
    .readonly()
    .optional(),
  images: providerChoice.optional(),
  reference: z
    .object({
      source: z.enum(referenceSources),
      prompt: z.string().optional(),
      thumbnail: z.boolean().optional(),
    })
    .optional(),
  articlePrompt: z.string().optional(),
  narrationPrompt: z.string().optional(),
  imagePrompts: z.array(z.object({ name: z.string(), number: z.number() })),
  // The ranges are `slices/images/scale.ts`'s, checked by admission, not the schema's.
  imageScale: z.object({ perHour: z.number(), words: z.number() }).optional(),
  // Scenes from the article: each image drawn from its own scene (`images/scenes.ts`).
  imageScenes: z.boolean().optional(),
  thumbnailPrompt: z.string().optional(),
  thumbnailCount: z.union([z.literal(1), z.literal(3)]).optional(),
  intro: entryChoice.optional(),
  outro: entryChoice.optional(),
  values: z.record(z.string(), z.string()),
  provided: z.object({
    research: z.string().optional(),
    article: z.string().optional(),
    audio: z.string().optional(),
    images: z.array(z.string()).optional(),
    thumbnail: z.string().optional(),
    reference: z.string().optional(),
    // The staged file of the shorts' background music; used only while Shorts is on.
    shortsMusic: z.string().optional(),
    // The staged file of the ambient bed; used only while its source is "upload".
    ambientBed: z.string().optional(),
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
  // Defaulted rather than required, so a config, revision, draft review or backup saved
  // before these existed still parses. The range is `rules.ts`'s, not the schema's.
  imageSeconds: z.number().default(defaultImageSeconds),
  zoomPercent: z.number().default(defaultZoomPercent),
  motionStyle: z.enum(motionStyles).default(defaultMotionStyle),
  edgeSilenceSeconds: z.number().default(defaultEdgeSilenceSeconds),
  subtitles: subtitleConfigSchema.optional(),
  document: documentSettingsSchema.optional(),
  youtubeDescription: z.boolean().optional(),
  showFigures: z.boolean().optional(),
  descriptionPrompt: z.string().optional(),
  // The ranges are `slices/shorts/model.ts`'s, checked by admission, not the schema's.
  shorts: z
    .object({
      enabled: z.boolean(),
      count: z.number(),
      minSeconds: z.number(),
      maxSeconds: z.number(),
      prompt: z.string().optional(),
      imagePrompt: z.string().optional(),
      titleOnScreen: z.boolean().optional(),
      fullVideoLink: z.string().optional(),
      musicVolume: z.number().optional(),
      speed: z.number().optional(),
    })
    .optional(),
  // The ranges are `slices/video/edit-settings.ts`'s, checked by admission, not the schema's.
  videoEdit: videoEditSchema.optional(),
  channelId: z.string().optional(),
  useBrandKit: z.literal(false).optional(),
  cast: castSnapshotSchema.optional(),
  earlierEpisodes: z
    .array(z.object({ title: z.string(), summary: z.string() }))
    .readonly()
    .optional(),
  titleStyle: z
    .object({
      fontId: z
        .string()
        .max(160)
        .regex(/^[A-Za-z0-9_-]+$/)
        .optional(),
      color: hexColour.optional(),
    })
    .optional(),
  endScreen: z.object({ text: z.string().max(200) }).optional(),
  // The retry range is `slices/reviews/model.ts`'s, checked by admission, not the schema's.
  reviews: z
    .object({
      provider: z.string(),
      model: z.string(),
      thinking: z.enum(thinkingModes).optional(),
      retries: z.number().optional(),
      stages: z.partialRecord(
        z.enum(reviewStages),
        z.object({ mode: z.enum(reviewModes), prompt: z.string().optional() }),
      ),
    })
    .optional(),
  // The rules are `slices/voices/model.ts`'s, checked by admission, not the schema's.
  voices: voicesSettingsSchema.optional(),
  ambientBed: ambientBedSchema.optional(),
  // Level the volume (`loudness/model.ts`); the range is checked by admission.
  loudness: z.object({ videoLufs: z.number(), audioFilesLufs: z.number() }).strict().optional(),
  // Pauses between sentences and paragraphs (`narration/pauses-model.ts`); checked by admission.
  sentencePauseSeconds: z.number().optional(),
  paragraphPauseSeconds: z.number().optional(),
  // Absent is English (`kernel/ports/languages.ts`).
  language: languageSchema.optional(),
});

export const runConfigSchema = runDraftSchema.extend({
  rendered: z.record(z.string(), z.string()),
});
