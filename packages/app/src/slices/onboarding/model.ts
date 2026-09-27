import { z } from "zod";

// The first five minutes' wire shapes. Browser-safe: the first-run screen, the Library's
// packs and the sample's page read these too.

// The bundled samples: "The Library of Alexandria" (narrated video, shorts, article, PDF) and
// two multi-voice demos, an audiobook and a podcast.
export const sampleIds = ["library", "audiobook", "podcast"] as const;
export type SampleId = (typeof sampleIds)[number];

// Each sample's project, or null while it is not in Projects.
export const sampleProjectsSchema = z.object({
  library: z.string().nullable(),
  audiobook: z.string().nullable(),
  podcast: z.string().nullable(),
});
export type SampleProjects = z.infer<typeof sampleProjectsSchema>;

export const firstRunViewSchema = z
  .object({
    show: z.boolean(),
    // A real project exists but the screen was never recorded as done: the client records it
    // with POST /dismiss, so deleting every project later does not bring the screen back.
    // Reading this view writes nothing.
    settle: z.boolean(),
    // Who narrates a first short: a voice provider with a saved key, else the computer's own.
    voice: z.object({
      // The keyed voice provider that would be used, by name ("OpenAI"), or null.
      keyed: z.string().nullable(),
      system: z.object({
        available: z.boolean(),
        // The speech program found ("eSpeak NG", "macOS voices").
        engine: z.string().nullable(),
        // Why none can be used, with the fix.
        issue: z.string().nullable(),
      }),
    }),
    // The Library of Alexandria's project, as before the demos; `samples` has all three.
    sampleProjectId: z.string().nullable(),
    samples: sampleProjectsSchema,
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

// A finished short's "Make the full video on this topic": the draft id is the browser's, so a
// repeated press opens the same Play draft instead of making another.
export const fullVideoInputSchema = z
  .object({ projectId: z.string().min(1).max(64), draftId: z.uuid() })
  .strict();

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
export const sampleStateSchema = z.object({
  projectId: z.string().nullable(),
  samples: sampleProjectsSchema,
});
// Make my own copy of one sample; without a project, the Library of Alexandria.
export const sampleCopyInputSchema = z
  .object({ projectId: z.string().max(60).optional() })
  .strict();
