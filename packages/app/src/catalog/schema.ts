import { z } from "zod";
import { providers } from "../slices/settings/model.js";

const money = z.number().finite().nonnegative();
const base = z.object({
  provider: z.string().regex(/^[a-z0-9-]+$/),
  id: z.string().min(1).max(200),
  name: z.string().min(1).max(120),
  enabled: z.boolean().default(true),
  deprecated: z.boolean().default(false),
  source: z.url(),
  keywords: z.array(z.string().max(60)).default([]),
  pricing: z
    .object({
      inputPerMillionTokens: money.optional(),
      outputPerMillionTokens: money.optional(),
      perMillionCharacters: money.optional(),
      perImage: money.optional(),
      perMinute: money.optional(),
      note: z.string().max(1000).optional(),
    })
    .strict()
    .default({}),
});
export const llmModelSchema = base
  .extend({
    llm: z
      .object({
        contextTokens: z.number().int().positive().optional(),
        maxOutputTokens: z.number().int().positive().optional(),
        webSearch: z.boolean().default(false),
        thinking: z
          .partialRecord(
            z.enum(["off", "low", "medium", "high", "xhigh"]),
            z
              .object({
                budget: z.number().int().min(-1).optional(),
                level: z.enum(["minimal", "low", "medium", "high"]).optional(),
                effort: z.enum(["none", "minimal", "low", "medium", "high", "xhigh"]).optional(),
              })
              .strict(),
          )
          .optional(),
      })
      .strict(),
  })
  .strict();
export const imageModelSchema = base
  .extend({
    image: z
      .object({
        aspectRatios: z.array(z.enum(["16:9", "9:16"])).min(1),
        resolution: z.string().max(100).optional(),
      })
      .strict(),
  })
  .strict();
export const ttsModelSchema = base
  .extend({
    tts: z
      .object({
        maxCharacters: z.number().int().min(2).max(1000000),
        streaming: z.boolean(),
        asyncMaxCharacters: z.number().int().positive().optional(),
      })
      .strict(),
  })
  .strict();
export const catalogueSchema = z
  .object({
    schemaVersion: z.literal(1),
    updatedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    providers: z.record(
      z.string().regex(/^[a-z0-9-]+$/),
      z.object({ maxConcurrent: z.number().int().min(1).max(5) }).strict(),
    ),
    llm: z.array(llmModelSchema).max(300),
    image: z.array(imageModelSchema).max(200),
    tts: z.array(ttsModelSchema).max(100),
  })
  .strict()
  .superRefine((data, ctx) => {
    const seen = new Set<string>();
    for (const family of ["llm", "image", "tts"] as const)
      for (const model of data[family]) {
        if (!providers.some((p) => p.id === model.provider && p.family === family))
          ctx.addIssue({ code: "custom", message: `Unknown ${family} provider ${model.provider}` });
        const key = `${model.provider}:${model.id}`;
        if (seen.has(key)) ctx.addIssue({ code: "custom", message: `Duplicate model ${key}` });
        seen.add(key);
        if (!data.providers[model.provider])
          ctx.addIssue({
            code: "custom",
            message: `Missing provider limits for ${model.provider}`,
          });
      }
  });
export type Catalogue = z.infer<typeof catalogueSchema>;
export type CatalogueModel =
  | Catalogue["llm"][number]
  | Catalogue["image"][number]
  | Catalogue["tts"][number];
