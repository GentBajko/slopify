import { z } from "zod";
import { aiDisclosureSettings } from "../studio/disclosure.js";
import { ambientBedProblems } from "../video/ambient-bed.js";
import { channelAmbientBedSchema } from "../video/ambient-bed-schema.js";
import { paceSteps } from "../voices/model.js";
import { castKinds } from "./model.js";

const id = z.uuid();
const colour = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a colour like #FFD700.")
  .transform((value) => value.toUpperCase());
const optionalText = (max: number) => z.string().trim().max(max).optional();
const fontId = z
  .string()
  .max(160)
  .regex(/^[A-Za-z0-9_-]+$/, "Choose a font from the list.")
  .optional();

// A blank field is left out rather than kept as "", so it inherits instead of overriding.
export const brandKitSchema = z
  .object({
    captionFontId: fontId,
    captionColor: colour.optional(),
    captionOutlineColor: colour.optional(),
    titleFontId: fontId,
    titleColor: colour.optional(),
    intro: optionalText(200),
    outro: optionalText(200),
    endScreenText: optionalText(200),
    documentTheme: optionalText(200),
    // The built-in beds only; the ranges are `video/ambient-bed.ts`'s, said in its words.
    ambientBed: channelAmbientBedSchema
      .superRefine((bed, context) => {
        for (const problem of ambientBedProblems(bed))
          context.addIssue({
            code: "custom",
            path: [problem.field],
            message: `${problem.message} Change it under Brand kit → Ambient sound on the channel page.`,
          });
      })
      .optional(),
  })
  .strict()
  .transform((kit) =>
    Object.fromEntries(
      Object.entries(kit).filter(([, value]) => value !== undefined && value !== ""),
    ),
  );

const name = z
  .string()
  .trim()
  .min(1, "Enter a name.")
  .max(200, "Keep the name to 200 characters or fewer.");
export const channelCreateSchema = z.object({ id, name }).strict().readonly();
export const channelUpdateSchema = z
  .object({
    name,
    brand: brandKitSchema,
    seriesBrief: z.string().max(10000, "Keep the series brief to 10,000 characters or fewer."),
    baseVersion: z.number().int().positive(),
  })
  .strict()
  .readonly();

// Names and aliases are matched against titles and image briefs as whole words; one of at
// most 200 characters, and at most 20 aliases, keeps that cheap.
const term = z
  .string()
  .trim()
  .min(1, "Enter a name, and remove empty aliases.")
  .max(200, "Keep names and aliases to 200 characters or fewer.");
// A cast member's voice. The pace is one of the Speakers list's steps; the rest is checked
// when a run uses it, like every other voice choice.
export const castVoiceSchema = z
  .object({
    provider: z.string().trim().min(1, "Choose a voice provider.").max(100),
    model: z.string().trim().min(1, "Choose a voice model.").max(200),
    voice: z.string().trim().min(1, "Choose a voice.").max(200),
    pace: z
      .number()
      .refine(
        (value) => (paceSteps as readonly number[]).includes(value),
        "Pick a pace from the list.",
      )
      .optional(),
    pronunciations: z
      .string()
      .max(20_000, "Keep the pronunciations to 20,000 characters or fewer.")
      .optional(),
  })
  .strict();
export const castMemberInputSchema = z
  .object({
    kind: z.enum(castKinds),
    name: term,
    aliases: z.array(term).max(20, "Keep to 20 aliases or fewer.").default([]),
    description: z
      .string()
      .trim()
      .max(2000, "Keep the description to 2,000 characters or fewer.")
      .default(""),
    // Absent keeps the saved voice; null removes it.
    voice: castVoiceSchema.nullable().optional(),
  })
  .strict();
export const castMemberCreateSchema = castMemberInputSchema.extend({ id }).strict();
export const castMemberUpdateSchema = castMemberInputSchema
  .extend({ baseVersion: z.number().int().positive() })
  .strict();
export const castGenerateSchema = z
  .object({
    prompt: z
      .string()
      .trim()
      .min(1, "Describe the picture to make.")
      .max(4000, "Keep the picture's description to 4,000 characters or fewer."),
    provider: z.string().min(1).max(100),
    model: z.string().min(1).max(200),
  })
  .strict();
export const templateChannelSchema = z.object({ channelId: id }).strict();
// The channel's YouTube AI disclosure, saved on its own so it never races the Brand form.
export const channelAiDisclosureSchema = z
  .object({
    aiDisclosure: z.enum(aiDisclosureSettings, "Choose Automatic, Always Yes or Always No."),
  })
  .strict();

// A cast member as a run's config holds it (`CastSnapshot`).
export const castSnapshotSchema = z
  .array(
    z.object({
      name: z.string(),
      aliases: z.array(z.string()).readonly(),
      description: z.string(),
      images: z.array(z.string()).readonly(),
    }),
  )
  .readonly();
