import { z } from "zod";
import { thinkingModes } from "../kernel/ports/llm.js";
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
      // Input read from the provider's prompt cache. Absent, cached input is priced as input.
      cachedInputPerMillionTokens: money.optional(),
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
            z.enum(thinkingModes),
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
        aspectRatios: z.array(z.enum(["16:9", "9:16", "1:1"])).min(1),
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

// Image-to-video models live in the image list, under the image providers that run them,
// marked by the `video` keyword; their perImage is the price of one clip. A catalogue that
// older Slopify versions read keeps its shape, and the image pickers leave these out.
export function isVideoModel(model: Pick<CatalogueModel, "keywords">): boolean {
  return model.keywords.includes("video");
}

// An image model that also takes an input image - so it can draw with the project's
// establishing image as its visual reference - carries the `reference` keyword, the same way
// and for the same reason the image-to-video models carry `video`.
export function takesReferenceImage(model: Pick<CatalogueModel, "keywords">): boolean {
  return model.keywords.includes("reference");
}
// What the run says when the chosen image model cannot take the establishing image.
export const referenceRefusal =
  "The chosen image model can't use an establishing image as a reference, so the images can't be drawn to match it. Choose an image model that can (Codex CLI, OpenAI, Google, or a fal.ai model listed with reference) under Images → Model on Play or in Edit project → Providers, or set Establishing image to Off in the Images section.";

// The image-to-video models a provider offers, as Animate images lists them.
export function videoModelsOf(
  catalogue: Catalogue,
  provider: string,
): readonly Catalogue["image"][number][] {
  return catalogue.image.filter(
    (m) => m.provider === provider && m.enabled && !m.deprecated && isVideoModel(m),
  );
}
export type CatalogueModel =
  | Catalogue["llm"][number]
  | Catalogue["image"][number]
  | Catalogue["tts"][number];
