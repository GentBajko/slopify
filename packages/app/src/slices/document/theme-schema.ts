import { z } from "zod";
import { documentThemeNameMax, documentThemeNames } from "./model.js";
import { type DocumentTheme, fontFamilies, fontStyles } from "./theme.js";

// Every value of a document theme with the range the renderer draws sensibly within, so a
// saved theme, a project config and the editor's preview all refuse the same values.
// Browser-safe: the Library editor reads the limits from here too.

const mm = (min: number, max: number) => {
  const range = { error: `Use a value from ${String(min)} to ${String(max)}.` };
  return z.number({ error: "Enter a number." }).finite(range).min(min, range).max(max, range);
};
const color = z.string().regex(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i, "Use a colour like #8c1e14.");
const line = z.string().max(300, { error: "Keep this under 300 characters." });
const nullableLine = line.nullable();
const url = z.string().max(500, { error: "Keep this under 500 characters." }).nullable();

const face = z
  .object({
    family: z.enum(fontFamilies),
    style: z.enum(fontStyles),
    letterSpacing: mm(-0.5, 2),
  })
  .strict();

export const documentThemeSchema = z
  .object({
    page: z
      .object({
        format: z.enum(["a4", "letter"]),
        margin: mm(5, 60),
        contentTop: mm(5, 80),
      })
      .strict(),
    background: z.object({ image: z.enum(["parchment"]).nullable(), color }).strict(),
    colors: z.object({ heading: color, text: color, muted: color, faint: color }).strict(),
    fonts: z
      .object({
        body: face,
        strong: face,
        emphasis: face,
        heading: face,
        dramatic: face,
        decorative: face,
        dropCap: face,
        footer: face,
      })
      .strict(),
    sizes: z
      .object({
        brand: mm(6, 72),
        title: mm(6, 72),
        section: mm(6, 72),
        heading: mm(6, 72),
        subheading: mm(6, 72),
        body: mm(6, 24),
        footer: mm(5, 24),
        meta: mm(5, 24),
      })
      .strict(),
    spacing: z
      .object({
        bodyLine: mm(3, 20),
        headingLine: mm(3, 30),
        subheadingLine: mm(3, 30),
        paragraphGap: mm(0, 3),
        headingGap: mm(0, 5),
        itemGap: mm(0, 3),
        listIndent: mm(0, 30),
        quoteIndent: mm(0, 40),
        ruleWidth: mm(0, 150),
      })
      .strict(),
    dropCap: z
      .object({
        enabled: z.boolean(),
        lines: z.union([z.literal(2), z.literal(3), z.literal(4)]),
        scale: mm(1, 5),
        gap: mm(0, 20),
        minLength: z
          .number({ error: "Enter a number." })
          .int({ error: "Use a whole number." })
          .min(0, { error: "Use a value from 0 to 2000." })
          .max(2000, { error: "Use a value from 0 to 2000." }),
        minRoom: mm(0, 1),
      })
      .strict(),
    titlePage: z
      .object({
        brandY: mm(10, 200),
        taglineOffset: mm(0, 60),
        titleY: mm(10, 250),
        titleLine: mm(3, 40),
        metaOffset: mm(0, 100),
        metaLine: mm(3, 30),
        showDate: z.boolean(),
        showWordCount: z.boolean(),
        cover: z.object({ enabled: z.boolean(), gap: mm(0, 40), maxHeight: mm(20, 200) }).strict(),
      })
      .strict(),
    contents: z
      .object({
        enabled: z.boolean(),
        title: line,
        depth: z.union([z.literal(1), z.literal(2), z.literal(3)]),
        titleOffset: mm(0, 100),
        firstEntryOffset: mm(0, 150),
        line: mm(3, 30),
        indent: mm(0, 30),
      })
      .strict(),
    header: z
      .object({
        enabled: z.boolean(),
        top: mm(3, 60),
        maxTitleCharacters: z
          .number({ error: "Enter a number." })
          .int({ error: "Use a whole number." })
          .min(5, { error: "Use a value from 5 to 200." })
          .max(200, { error: "Use a value from 5 to 200." }),
      })
      .strict(),
    footer: z
      .object({
        enabled: z.boolean(),
        bottom: mm(3, 60),
        reserve: mm(0, 60),
        text: line,
      })
      .strict(),
    brand: z
      .object({
        name: nullableLine,
        url,
        tagline: nullableLine,
        linkLabel: nullableLine,
      })
      .strict(),
    metadata: z
      .object({ author: line, subject: line, keywords: z.string().max(1000), creator: line })
      .strict(),
    sources: z
      .object({
        enabled: z.boolean(),
        title: line,
        titleOffset: mm(0, 100),
        bodyOffset: mm(0, 150),
        line: mm(3, 30),
        gap: mm(0, 20),
      })
      .strict(),
    endPage: z
      .object({
        enabled: z.boolean(),
        title: line,
        titleOffset: mm(0, 100),
        bodyOffset: mm(0, 150),
        lines: z.array(line).max(60).readonly(),
        showDocumentDetails: z.boolean(),
        link: z.object({ text: line, url }).strict().nullable(),
        closing: nullableLine,
      })
      .strict(),
  })
  .strict() satisfies z.ZodType<DocumentTheme>;

export const customDocumentThemeSchema = z
  .object({
    id: z.string().min(1).max(64),
    name: z.string().min(1).max(documentThemeNameMax),
    values: documentThemeSchema,
  })
  .strict();

// A project's, a draft's and a template's document settings. The retired "dicemaster" still
// parses, so a project or draft saved with it keeps opening.
export const documentSettingsSchema = z
  .object({ theme: z.enum(documentThemeNames), custom: customDocumentThemeSchema.optional() })
  .strict();
