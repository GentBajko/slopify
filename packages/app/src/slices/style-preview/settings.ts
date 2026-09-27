import { createHash } from "node:crypto";
import type { Format } from "../../kernel/pipeline.js";
import { type CaptionCue, captionCues } from "../subtitles/captions.js";
import type { SubtitleConfig, TimedWord } from "../subtitles/model.js";
import type { Look, TransitionStyle } from "../video/edit-list.js";
import { transitionSecondsMax, transitionSecondsMin, videoEditOf } from "../video/edit-settings.js";
import { defaultPreviewText, type StylePreviewRequest, stylePreviewSeconds } from "./schema.js";

// Only what changes the preview's pixels, so two requests that would render the same frames
// share one file: the caption style counts only when captions are burned in, the card font
// only when chapter cards are on, and the sample text only when there are captions to show it.
export interface StylePreviewSettings {
  // Bump when the preview's recipe changes, so old saved previews are not served.
  readonly version: 1;
  readonly format: Format;
  readonly captions: {
    readonly fontId: string;
    readonly fontSize: number;
    readonly position: SubtitleConfig["position"];
    readonly text: string;
  } | null;
  readonly look: Look;
  readonly transition: { readonly kind: TransitionStyle; readonly seconds: number } | null;
  readonly chapterCard: { readonly fontId: string } | null;
  // The content hash of the picture drawn instead of the sample stills; absent draws the
  // stills, so previews saved before pictures keep their hash.
  readonly image?: string | undefined;
}

export function normalizeStylePreview(
  request: StylePreviewRequest,
  // The sha256 of the picture the server found for request.image, if it found one.
  image?: string,
): StylePreviewSettings {
  const edit = videoEditOf(request);
  const { subtitles } = request;
  const text = (request.previewText ?? "").replace(/\s+/g, " ").trim();
  return {
    version: 1,
    format: request.format,
    captions:
      subtitles.mode === "burn-in"
        ? {
            fontId: subtitles.fontId,
            fontSize: Math.round(subtitles.fontSize),
            position: subtitles.position,
            text: text === "" ? defaultPreviewText : text,
          }
        : null,
    look: {
      vignette: edit.vignette,
      grain: edit.grain,
      grade: edit.grade,
      atmosphere: edit.atmosphere,
    },
    transition:
      edit.transition === "cut"
        ? null
        : {
            kind: edit.transition,
            // Tenths, within the range the project editor offers.
            seconds:
              Math.round(
                Math.min(
                  transitionSecondsMax,
                  Math.max(
                    transitionSecondsMin,
                    Number.isFinite(edit.transitionSeconds) ? edit.transitionSeconds : 0.6,
                  ),
                ) * 10,
              ) / 10,
          },
    chapterCard: edit.chapterCards ? { fontId: subtitles.fontId } : null,
    ...(image === undefined ? {} : { image }),
  };
}

// JSON with every object's keys in order, so equal settings always hash alike.
export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, one]) => one !== undefined)
      .toSorted(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, one]) => `${JSON.stringify(key)}:${stableJson(one)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}

export function stylePreviewHash(settings: StylePreviewSettings): string {
  return createHash("sha256").update(stableJson(settings)).digest("hex");
}

// ceiling: three cues read comfortably in six seconds; a short text gets one per word.
const cueCount = 3;
// Longer than the 0.7 s pause `captionCues` starts a new cue at.
const cueGap = 0.8;
const lead = 0.4;

// The sample text as timed words: split into up to three groups spread over the preview with
// a pause between them, the words of each evenly spaced. `captionCues` then groups and wraps
// them exactly as it does real narration.
export function sampleWords(text: string, seconds = stylePreviewSeconds): readonly TimedWord[] {
  const words = text.split(/\s+/).filter((word) => word !== "");
  if (words.length === 0) return [];
  const groups = Math.min(cueCount, words.length);
  const per = Math.ceil(words.length / groups);
  const chunks = Array.from({ length: groups }, (_value, at) =>
    words.slice(at * per, (at + 1) * per),
  ).filter((chunk) => chunk.length > 0);
  const span = (seconds - 2 * lead - cueGap * (chunks.length - 1)) / chunks.length;
  const timed: TimedWord[] = [];
  chunks.forEach((chunk, at) => {
    const start = lead + at * (span + cueGap);
    const each = span / chunk.length;
    chunk.forEach((word, index) => {
      timed.push({
        text: word,
        start: round(start + index * each),
        end: round(start + (index + 1) * each),
      });
    });
  });
  return timed;
}

export function sampleCues(text: string, seconds = stylePreviewSeconds): readonly CaptionCue[] {
  return captionCues(sampleWords(text, seconds));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
