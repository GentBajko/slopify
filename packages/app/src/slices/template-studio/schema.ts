import { z } from "zod";
import { projectTemplateSchema } from "../project-templates/schema.js";
import { freeCheckIds } from "./checks.js";
import { gateStates, sampleVersionStates, sectionStates, templateSections } from "./model.js";

// What GET /api/template-studio/:id answers, browser-safe so the studio page parses the same
// shape the server writes.
export const checkSchema = z
  .object({
    id: z.enum(freeCheckIds),
    ok: z.boolean(),
    sentence: z.string(),
    fix: z.object({ label: z.string(), href: z.string() }).strict().readonly().optional(),
  })
  .strict()
  .readonly();

export const sectionStatusSchema = z
  .object({
    id: z.enum(templateSections),
    label: z.string(),
    state: z.enum(sectionStates),
    sentence: z.string(),
  })
  .strict()
  .readonly();

const freeSampleSchema = z
  .object({
    state: z.enum(["current", "making", "waiting", "needs-fix", "stale", "off"]),
    sentence: z.string(),
    url: z.string().nullable(),
  })
  .strict()
  .readonly();

export const freeSamplesSchema = z
  .object({
    video: freeSampleSchema,
    loudness: freeSampleSchema
      .unwrap()
      .extend({
        beforeUrl: z.string().nullable(),
        beforeLufs: z.number().nullable(),
        afterLufs: z.number().nullable(),
        targetLufs: z.number().nullable(),
        ceiling: z.number().nullable(),
      })
      .strict()
      .readonly(),
    document: freeSampleSchema,
  })
  .strict()
  .readonly();

export const scheduleSampleSchema = z
  .object({
    runs: z
      .array(
        z
          .object({
            at: z.string(),
            scheduleId: z.string(),
            scheduleName: z.string(),
            title: z.string(),
            topic: z.boolean(),
          })
          .strict()
          .readonly(),
      )
      .readonly(),
    cost: z
      .object({
        runs: z.number(),
        high: z.number(),
        unknown: z.number(),
        problem: z.string().nullable(),
      })
      .strict()
      .readonly()
      .nullable(),
  })
  .strict()
  .readonly();

export const pathStepSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    kind: z.enum(["checkpoint", "review"]),
    by: z.enum(["you", "model", "agent"]),
    detail: z.string(),
  })
  .strict()
  .readonly();

// The paid sample: its project's files now, each in its section, and each version's state.
export const paidViewSchema = z
  .object({
    projectId: z.string().nullable(),
    revisionId: z.string().nullable(),
    state: z.enum(sampleVersionStates).nullable(),
    sentence: z.string().nullable(),
    quotedHigh: z.number().nullable(),
    article: z.string().nullable(),
    outputs: z
      .array(
        z
          .object({
            section: z.enum(templateSections),
            role: z.string(),
            url: z.string(),
            name: z.string(),
          })
          .strict()
          .readonly(),
      )
      .readonly(),
    versions: z
      .array(
        z
          .object({
            version: z.number().int().positive(),
            state: z.enum(sampleVersionStates),
            updatedAt: z.string(),
          })
          .strict()
          .readonly(),
      )
      .readonly(),
  })
  .strict()
  .readonly();

export const studioViewSchema = z
  .object({
    template: projectTemplateSchema,
    gate: z.enum([...gateStates, "unchecked"]),
    // The version schedules run; null when no version was ever checked.
    runnableVersion: z.number().int().positive().nullable(),
    sample: z
      .object({
        topic: z.string(),
        topicSource: z.enum(["fixed", "queued"]),
        fullScript: z.boolean(),
      })
      .strict()
      .readonly(),
    sections: z.array(sectionStatusSchema).readonly(),
    free: freeSamplesSchema,
    schedule: scheduleSampleSchema,
    reviews: z.array(pathStepSchema).readonly(),
    paid: paidViewSchema,
  })
  .strict()
  .readonly();
export type StudioView = z.infer<typeof studioViewSchema>;

// GET /api/template-studio/:id/checks: read apart from the studio, since the providers'
// readiness they need takes seconds to look up.
export const studioChecksSchema = z
  .object({ version: z.number().int().positive(), checks: z.array(checkSchema).readonly() })
  .strict()
  .readonly();
export type StudioChecks = z.infer<typeof studioChecksSchema>;

const quoteRowSchema = z
  .object({
    stage: z.string(),
    low: z.number().nullable(),
    high: z.number().nullable(),
    detail: z.string(),
    onPlan: z.boolean().optional(),
    apiLow: z.number().nullable().optional(),
    apiHigh: z.number().nullable().optional(),
  })
  .strict()
  .readonly();

// POST /api/template-studio/:id/quote: what a Save's sample costs, before anything is spent.
export const sampleQuoteSchema = z
  .object({
    version: z.number().int().positive(),
    first: z.boolean(),
    sections: z.array(z.enum(templateSections)).readonly(),
    rows: z.array(quoteRowSchema).readonly(),
    low: z.number(),
    high: z.number(),
    unknown: z.number().int().nonnegative(),
    onPlan: z.boolean(),
    usesPlan: z.boolean(),
    budget: z
      .object({ budget: z.number(), spent: z.number(), left: z.number(), plans: z.boolean() })
      .strict()
      .readonly(),
    fits: z.boolean(),
    problem: z.string().nullable(),
  })
  .strict()
  .readonly();
export type SampleQuoteView = z.infer<typeof sampleQuoteSchema>;

// GET /api/template-studio/:id/anatomy: a section's prompt cut into who wrote each part.
export const anatomyViewSchema = z
  .object({
    section: z.enum(templateSections),
    items: z.array(z.object({ key: z.string(), label: z.string() }).strict().readonly()).readonly(),
    item: z.string().nullable(),
    segments: z
      .array(
        z
          .object({
            origin: z.enum(["yours", "keyword", "slopify", "setting"]),
            text: z.string(),
            name: z.string().optional(),
            unfilled: z.literal(true).optional(),
          })
          .strict()
          .readonly(),
      )
      .readonly(),
    fromSample: z.boolean(),
    problem: z.string().nullable(),
  })
  .strict()
  .readonly();
export type AnatomyViewData = z.infer<typeof anatomyViewSchema>;
