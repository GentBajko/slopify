import { z } from "zod";

export const subtitleModes = ["off", "files", "burn-in"] as const;
export const subtitleConfigSchema = z.object({
  mode: z.enum(subtitleModes),
  language: z.literal("en").default("en"),
  fontId: z
    .string()
    .max(160)
    .regex(/^[A-Za-z0-9_-]+$/)
    .default("default"),
  fontSize: z.number().int().min(16).max(120).default(48),
});
export type SubtitleConfig = z.infer<typeof subtitleConfigSchema>;
export const defaultSubtitles: Readonly<SubtitleConfig> = {
  mode: "off",
  language: "en",
  fontId: "default",
  fontSize: 48,
};

export type { AlignmentRequest, SubtitleAligner, TimedWord } from "../../kernel/ports/subtitles.js";
