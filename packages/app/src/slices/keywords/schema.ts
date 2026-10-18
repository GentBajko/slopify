import { z } from "zod";

// `values.ts`'s KeywordFacts, as a saved config holds it. Edit project sends it back with the
// rest of the config, so it is bounded like any other part of a draft.
const text = z.string().max(10_000);
export const keywordFactsSchema = z.object({
  channel: text.optional(),
  series: text.optional(),
  links: z
    .array(z.object({ name: text, url: text }))
    .max(200)
    .readonly()
    .optional(),
  previousVideo: z.object({ title: text, url: text.optional() }).optional(),
  nextVideo: z.object({ title: text }).optional(),
  cast: z
    .array(z.object({ name: text, description: text }))
    .max(500)
    .readonly()
    .optional(),
  coveredBefore: z.array(text).max(500).readonly().optional(),
  episode: z.number().int().min(1).optional(),
  brand: z
    .object({
      colours: z.array(text).max(10).readonly(),
      fonts: z.array(text).max(10).readonly(),
    })
    .optional(),
});
