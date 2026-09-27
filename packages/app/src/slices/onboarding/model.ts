import { z } from "zod";

// The first five minutes' wire shapes. Browser-safe: the first-run screen, the Library's
// packs and the sample's page read these too.

export const firstRunViewSchema = z
  .object({
    show: z.boolean(),
    sampleProjectId: z.string().nullable(),
    clis: z.array(
      z.object({
        id: z.enum(["claude-code", "codex", "gemini"]),
        name: z.string(),
        installed: z.boolean(),
        ready: z.boolean(),
        version: z.string().nullable(),
        issue: z.string().nullable(),
        // Codex draws the images too.
        draws: z.boolean(),
      }),
    ),
    packs: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        summary: z.string(),
        installed: z.boolean(),
        templateId: z.string().nullable(),
      }),
    ),
  })
  .readonly();
export type FirstRunView = z.infer<typeof firstRunViewSchema>;

export const quickShortInputSchema = z
  .object({
    topic: z.string().trim().min(1).max(200),
    packId: z.string().max(40).optional(),
    requestId: z.uuid(),
  })
  .strict();
export type QuickShortInput = z.infer<typeof quickShortInputSchema>;

export const quickShortResultSchema = z.object({
  projectId: z.string(),
  replayed: z.boolean(),
});

export const installedPackSchema = z.object({
  packId: z.string(),
  added: z.boolean(),
  prompts: z.record(z.string(), z.string()),
  templateId: z.string().nullable(),
  voice: z.string().nullable(),
});

export const sampleCopySchema = z.object({ projectId: z.string() });
export const sampleStateSchema = z.object({ projectId: z.string().nullable() });
