import { z } from "zod";
import { languageInfo } from "../../kernel/ports/languages.js";

export const subtitleModes = ["off", "files", "burn-in"] as const;
export const subtitlePositions = [
  "top",
  "upper-middle",
  "center",
  "lower-middle",
  "bottom",
] as const;
export const subtitleConfigSchema = z.object({
  mode: z.enum(subtitleModes),
  language: z.literal("en").default("en"),
  fontId: z
    .string()
    .max(160)
    .regex(/^[A-Za-z0-9_-]+$/)
    .default("default"),
  position: z.enum(subtitlePositions).default("bottom"),
  fontSize: z.number().int().min(16).max(120).default(48),
  // #RRGGBB, from the channel's brand kit. Absent is white text with a dark outline, as
  // every caption before them.
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  outlineColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
});
export type SubtitleConfig = z.infer<typeof subtitleConfigSchema>;
export const defaultSubtitles: Readonly<SubtitleConfig> = {
  mode: "off",
  language: "en",
  fontId: "default",
  fontSize: 48,
  position: "bottom",
};

// The word-timing operation of a project language, which is part of the timing's fingerprint:
// English keeps the operation it always had, so no English project is re-timed; the other
// languages each name the model (or the sentence fallback) that times them.
export const timingOperations = {
  english: "wav2vec2-en-a19f851-v2-omissions",
  multilingual: "wav2vec2-xlsr56-2d48b01-v1",
  sentences: "sentence-timing-v1",
} as const;
export function timingOperation(
  language: string,
): (typeof timingOperations)[keyof typeof timingOperations] {
  return timingOperations[languageInfo(language).timing];
}

export type { AlignmentRequest, SubtitleAligner, TimedWord } from "../../kernel/ports/subtitles.js";
