import { z } from "zod";
import { projectTemplateSchema } from "../project-templates/schema.js";
import { freeCheckIds } from "./checks.js";
import { gateStates, sectionStates, templateSections } from "./model.js";

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
    checks: z.array(checkSchema).readonly(),
  })
  .strict()
  .readonly();
export type StudioView = z.infer<typeof studioViewSchema>;
