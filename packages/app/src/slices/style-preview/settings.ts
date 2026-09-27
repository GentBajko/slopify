import { createHash } from "node:crypto";
import type { Format } from "../../kernel/pipeline.js";
import { type CaptionCue, captionCues } from "../subtitles/captions.js";
import type { SubtitleConfig, TimedWord } from "../subtitles/model.js";
import type { Look, TransitionStyle } from "../video/edit-list.js";
import {
  legacyVideoEdit,
  transitionSecondsMax,
  transitionSecondsMin,
  videoEditOf,
} from "../video/edit-settings.js";
import { sampleNarrationText, sampleNarrationWords, sampleShortTitle } from "./narration.js";
import { defaultPreviewText, type StylePreviewRequest, stylePreviewSeconds } from "./schema.js";

// Only what changes the preview's pixels, so two requests that would render the same frames
// share one file: the caption style counts only when captions are burned in, the card font
// only when chapter cards are on, and the sample text only when there are captions to show it.
export interface StylePreviewSettings {
  // Bump when the preview's recipe changes, so old saved previews are not served. 2: the
  // sample's images and narration instead of drawn stills and silence, and the Shorts layout.
  readonly version: 2;
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
  // The Shorts layout: 9:16 through the Shorts renderer, whose captions are always burned in
  // at its own size and place (so `captions` is null); the Look, transitions and chapter
  // cards are left out, as a short has none.
  readonly short?:
    | {
        readonly fontId: string;
        readonly text: string;
        readonly title: string | null;
        readonly speed: number;
      }
    | undefined;
}

export function normalizeStylePreview(
  request: StylePreviewRequest,
  // The sha256 of the picture the server found for request.image, if it found one.
  image?: string,
): StylePreviewSettings {
  const edit = videoEditOf(request);
  const { subtitles } = request;
  const typed = (request.previewText ?? "").replace(/\s+/g, " ").trim();
  const text = typed === "" || typed === defaultPreviewText ? sampleNarrationText : typed;
  const shorts = request.shorts;
  if (shorts !== undefined) {
    const title = shorts.title?.replace(/\s+/g, " ").trim() ?? "";
    const none = videoEditOf({ videoEdit: legacyVideoEdit });
    return {
      version: 2,
      format: "9:16",
      captions: null,
      look: {
        vignette: none.vignette,
        grain: none.grain,
        grade: none.grade,
        atmosphere: none.atmosphere,
      },
      transition: null,
      chapterCard: null,
      short: {
        fontId: subtitles.fontId,
        text,
        title: shorts.titleOnScreen ? (title === "" ? sampleShortTitle : title) : null,
        speed: Math.round(Math.min(1.25, Math.max(1, shorts.speed ?? 1)) * 100) / 100,
      },
      ...(image === undefined ? {} : { image }),
    };
  }
  return {
    version: 2,
    format: request.format,
    captions:
      subtitles.mode === "burn-in"
        ? {
            fontId: subtitles.fontId,
            fontSize: Math.round(subtitles.fontSize),
            position: subtitles.position,
            text,
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

// How long the rendered preview runs: a Shorts preview at a higher speed is shorter.
export function previewSeconds(settings: StylePreviewSettings): number {
  return settings.short === undefined
    ? stylePreviewSeconds
    : round(stylePreviewSeconds / settings.short.speed);
}

// ceiling: a pause this long between two words of the sample narration starts a new phrase,
// the same pause `captionCues` starts a new cue at.
const phraseGap = 0.7;

// The caption text as timed words. The sample narration's own text is its word timing as it
// was aligned; any other text is spread over the stretches the narration speaks, each phrase
// taking a share of the words by its length, the words of each evenly spaced. `captionCues`
// and the Shorts captions then group and wrap them exactly as they do real narration.
export function previewWords(
  text: string,
  narration: readonly TimedWord[] = sampleNarrationWords,
): readonly TimedWord[] {
  const words = text.split(/\s+/).filter((word) => word !== "");
  if (words.length === 0) return [];
  if (words.join(" ") === narration.map((word) => word.text).join(" ")) return narration;
  const phrases: { start: number; end: number }[] = [];
  for (const word of narration) {
    const last = phrases.at(-1);
    if (last !== undefined && word.start - last.end < phraseGap) last.end = word.end;
    else phrases.push({ start: word.start, end: word.end });
  }
  if (phrases.length === 0) phrases.push({ start: 0.4, end: stylePreviewSeconds - 0.4 });
  const spoken = phrases.reduce((sum, phrase) => sum + (phrase.end - phrase.start), 0);
  const timed: TimedWord[] = [];
  let used = 0;
  let before = 0;
  for (const [at, phrase] of phrases.entries()) {
    before += phrase.end - phrase.start;
    // The words up to the end of this phrase, by its share of the speech; the last takes
    // what is left, and none is left empty while words remain.
    const upTo =
      at === phrases.length - 1
        ? words.length
        : Math.min(
            words.length - (phrases.length - 1 - at),
            Math.max(used + 1, Math.round((words.length * before) / spoken)),
          );
    const chunk = words.slice(used, Math.max(used, upTo));
    used += chunk.length;
    const each = (phrase.end - phrase.start) / Math.max(1, chunk.length);
    chunk.forEach((word, index) => {
      timed.push({
        text: word,
        start: round(phrase.start + index * each),
        end: round(phrase.start + (index + 1) * each),
      });
    });
  }
  return timed;
}

export function previewCues(text: string): readonly CaptionCue[] {
  return captionCues(previewWords(text));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
