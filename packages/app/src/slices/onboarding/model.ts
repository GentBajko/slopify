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

// What a 60-second short needs that nothing on this computer does yet, with what fixes it. The
// first-run checklist and the refusal of "Make a 60-second short" say the same gaps.
export const shortGapSchema = z.object({
  need: z.enum(["text", "voice", "images"]),
  // What is missing and what fixes it, in a sentence or two.
  message: z.string(),
  // A key for that part, or (the voice) a voice saved for the voice service that has a key.
  fix: z.enum(["key", "saved-voice"]),
  // The voice only: how to install the computer's own free voice from a terminal, where that
  // can be done.
  install: z.object({ text: z.string(), commands: z.array(z.string()) }).optional(),
});
export type ShortGap = z.infer<typeof shortGapSchema>;

// Who does one part of a first short, by name ("Claude Code CLI", "OpenAI", "eSpeak NG"), and
// how: with the person's own sign-in to a tool on this computer, a saved key, or (the voice)
// the computer's own speech. Null while nothing can.
const shortPartSchema = z.object({
  by: z.string().nullable(),
  how: z.enum(["sign-in", "key", "computer"]).nullable(),
});

export const firstRunViewSchema = z
  .object({
    show: z.boolean(),
    // A real project exists but the screen was never recorded as done: the client records it
    // with POST /dismiss, so deleting every project later does not bring the screen back.
    // Reading this view writes nothing.
    settle: z.boolean(),
    // The three things a short needs (the script, a voice and the images), each with who would
    // do it, and the gaps, as "Make a 60-second short" would refuse them.
    needs: z.object({
      text: shortPartSchema,
      voice: shortPartSchema,
      images: shortPartSchema,
      gaps: z.array(shortGapSchema),
    }),
    // The Library of Alexandria's project, as before the demos; `samples` has all three.
    sampleProjectId: z.string().nullable(),
    samples: sampleProjectsSchema,
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

// A finished short's "Make the full video on this topic": the draft id is the browser's, so a
// repeated press opens the same Play draft instead of making another.
export const fullVideoInputSchema = z
  .object({ projectId: z.string().min(1).max(64), draftId: z.uuid() })
  .strict();

// Make my own copy of one sample; without a project, the Library of Alexandria.
export const sampleCopyInputSchema = z
  .object({ projectId: z.string().max(60).optional() })
  .strict();
