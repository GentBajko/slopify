import { z } from "zod";
import { documentSettingsSchema } from "../document/theme-schema.js";
import {
  blockRoles,
  blocksMax,
  blockTextMax,
  castPerDesignMax,
  daysBeforeMax,
  designFormats,
  layoutPresets,
  promptMax,
  scrims,
} from "./model.js";

// A designed piece's settings, the same for a one-off design and a design template. Pure and
// browser-safe, so the web page validates with the server's own schema. Text may hold fields
// ({{Event}}), filled from the design's values when it is drawn.

const fontId = z.string().regex(/^(?:default|(?:system|uploaded)-[a-f0-9]{64})$/);
const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
const unit = z.number().min(0).max(1);

export const designPictureSchema = z
  .object({
    // "generate": the AI draws the artwork from `prompt`. "picture": the design's own picture
    // (an upload or an edit's result) is the artwork as it is.
    source: z.enum(["generate", "picture"]),
    prompt: z.string().max(promptMax),
    // A template's fixed picture, kept in image_blobs.
    sha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    castMemberIds: z.array(z.string().min(1).max(64)).max(castPerDesignMax),
    provider: z.string().min(1).max(64),
    model: z.string().min(1).max(200),
    // The AI draws the text into the artwork itself; Slopify's text layer is then off.
    aiText: z.boolean(),
  })
  .strict();

export const textBlockSchema = z
  .object({
    id: z.string().min(1).max(64),
    role: z.enum(blockRoles),
    text: z.string().max(blockTextMax),
    fontId,
    color: hexColor,
  })
  .strict();

export const designTextSchema = z
  .object({
    preset: z.enum(layoutPresets),
    scrim: z.enum(scrims),
    blocks: z.array(textBlockSchema).max(blocksMax),
  })
  .strict()
  .refine((text) => new Set(text.blocks.map((block) => block.id)).size === text.blocks.length, {
    message: "Two text blocks share an id.",
  });

export const designFormatSchema = z
  .object({ format: z.enum(designFormats), focus: z.object({ x: unit, y: unit }).strict() })
  .strict();

export const brochureSchema = z
  .object({
    settings: documentSettingsSchema,
    title: z.string().min(1).max(200),
    // The inner pages, as markdown with fields. Written by the person, not the AI, in v1.
    body: z.string().min(1).max(100_000),
  })
  .strict();

export const designScheduleSchema = z
  .object({
    // The field holding each row's date, typed YYYY-MM-DD.
    dateField: z.string().min(1).max(100),
    daysBefore: z.number().int().min(0).max(daysBeforeMax),
    time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  })
  .strict();

export const designDocumentSchema = z
  .object({
    version: z.literal(1),
    picture: designPictureSchema,
    text: designTextSchema,
    formats: z
      .array(designFormatSchema)
      .min(1)
      .max(designFormats.length)
      .refine((formats) => new Set(formats.map((one) => one.format)).size === formats.length, {
        message: "A format is listed twice.",
      }),
    brochure: brochureSchema.optional(),
    schedule: designScheduleSchema.optional(),
    // Example values the template editor's sample is drawn with.
    samples: z.record(z.string().min(1).max(100), z.string().max(2000)),
  })
  .strict()
  .refine(
    (doc) => doc.formats.some((one) => one.format === "brochure") === (doc.brochure !== undefined),
    {
      message:
        "A brochure needs its pages: add the brochure's title and text under Formats, or untick Brochure.",
      path: ["brochure"],
    },
  );

export type DesignDocument = z.infer<typeof designDocumentSchema>;
export type DesignPicture = z.infer<typeof designPictureSchema>;
export type DesignText = z.infer<typeof designTextSchema>;
export type TextBlock = z.infer<typeof textBlockSchema>;
export type DesignFormatEntry = z.infer<typeof designFormatSchema>;
export type DesignSchedule = z.infer<typeof designScheduleSchema>;
