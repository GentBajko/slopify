import { z } from "zod";
import type { EntryChoice, RunDraft } from "../admission/model.js";
import {
  defaultEdgeSilenceSeconds,
  defaultImageSeconds,
  defaultZoomPercent,
  edgeSilenceSecondsProblem,
  type FieldError,
  imageSecondsProblem,
  numberPerPromptMax,
  zoomPercentProblem,
} from "../admission/rules.js";
import { runDraftSchema } from "../admission/schema.js";
import { draftDocumentThemeOf } from "../document/model.js";
import {
  defaultExpectedWords,
  everyMinutesMax,
  everyMinutesMin,
  expectedWordsMax,
  type ImageScale,
  imagesPerHourMax,
  imagesPerHourMin,
  perHourFromMinutes,
  wordCount,
} from "../images/scale.js";
import type { Entry } from "../library/model.js";
import {
  defaultLoudness,
  type LoudnessDefault,
  type LoudnessSettings,
  loudnessOfForm,
} from "../loudness/model.js";
import { pausesOfForm } from "../narration/pauses-model.js";
import { reviewSettingsFromForm } from "../reviews/model.js";
import { stageMakesItems } from "../reviews/rules.js";
import {
  defaultShorts,
  type ShortsSettings,
  shortsExtrasOf,
  shortsSettingsProblems,
} from "../shorts/model.js";
import { defaultSubtitles } from "../subtitles/model.js";
import { ambientBedOfForm, ambientBedProblems } from "../video/ambient-bed.js";
import type { DraftAttachment, PlayDraftDocument } from "./model.js";

// Said where the control is, since the music sits in a closed disclosure on the Export rail.
const musicMessages = {
  uploading:
    "The shorts' background music is still uploading, so the run can't start yet. Wait for it to finish, or remove it under Outputs → Export → More shorts options → Background music.",
  missing:
    "The shorts' background music file is no longer available (it was not uploaded again after the draft was copied, or the upload failed). Choose the file again under Outputs → Export → More shorts options → Background music, or remove it.",
} as const;
function pickMusic(id: string | undefined): { readonly shortsMusic?: string } {
  return id === undefined ? {} : { shortsMusic: id };
}
const bedWhere = "under Outputs → Export → Ambient sound";
const bedMessages = {
  uploading: `The ambient sound's audio file is still uploading, so the run can't start yet. Wait for it to finish ${bedWhere}.`,
  missing: `The ambient sound's audio file is missing (it was never chosen, was not uploaded again after the draft was copied, or the upload failed). Choose the file ${bedWhere}, or pick Rain, Fireplace or Wind instead.`,
} as const;
function pickBed(id: string | undefined): { readonly ambientBed?: string } {
  return id === undefined ? {} : { ambientBed: id };
}

export function toAdmissionDraft(input: {
  readonly document: PlayDraftDocument;
  readonly attachments: readonly DraftAttachment[];
  readonly entries: readonly Entry[];
  readonly silenceGapSeconds: number;
  // Settings → General's Level the volume, for a draft that did not change it.
  readonly loudness?: LoudnessDefault | undefined;
}):
  | { readonly ok: true; readonly draft: RunDraft }
  | { readonly ok: false; readonly fields: readonly FieldError[] } {
  const { form } = input.document;
  const fields: FieldError[] = [];
  const sources = {
    ...form.sources,
    ...(form.sources.article === "provide" ? { research: "off" as const } : {}),
    ...(form.sources.images === "off" ? { video: "off" as const } : {}),
  };
  const number = (raw: string, field: string, max: number, min = 1) => {
    const parsed = z
      .number()
      .int()
      .min(min)
      .max(max)
      .safeParse(raw.trim() === "" ? Number.NaN : Number(raw));
    if (parsed.success) return parsed.data;
    fields.push({ field, message: `Enter a whole number between ${min} and ${max}.` });
    return min;
  };
  // A value the run uses is refused in the rule's words; one it ignores (the control is
  // hidden) falls back to the default rather than holding up the run.
  const measure = (
    field: "imageSeconds" | "edgeSilenceSeconds" | "zoomPercent",
    used: boolean,
    fallback: number,
    problem: (value: number) => string | undefined,
  ): number => {
    const raw = form[field].trim();
    const value = raw === "" ? Number.NaN : Number(raw);
    const refused = problem(value);
    if (refused === undefined) return value;
    if (used) fields.push({ field, message: refused });
    return fallback;
  };
  const entry = (category: "intro" | "outro"): EntryChoice | undefined => {
    const name = form[category];
    if (sources.audio !== "generate" || name === "") return undefined;
    const saved = input.entries.find(
      (candidate) =>
        candidate.category === category && candidate.name.toLowerCase() === name.toLowerCase(),
    );
    if (saved) return { name: saved.name, mode: saved.mode };
    fields.push({
      field: category,
      message: `That ${category} entry was deleted. Choose another.`,
    });
    return undefined;
  };
  const file = (
    ref: { readonly attachmentId: string; readonly name: string } | null,
    kind: DraftAttachment["kind"],
    field: string,
    messages: { readonly uploading: string; readonly missing: string } = {
      uploading: "This file is still uploading. Wait for it to finish.",
      missing: "That upload is no longer available. Choose the file again.",
    },
  ): string | undefined => {
    const attachment = input.attachments.find(
      (item) => item.id === ref?.attachmentId && item.kind === kind && item.name === ref.name,
    );
    if (attachment?.state === "ready" && attachment.stagedFileId !== null)
      return attachment.stagedFileId;
    fields.push({
      field,
      message:
        attachment?.state === "copying" || attachment?.state === "pending"
          ? messages.uploading
          : messages.missing,
    });
    return undefined;
  };
  const mode =
    sources.audio === "off"
      ? "off"
      : sources.video === "off" && form.subtitles.mode === "burn-in"
        ? "files"
        : form.subtitles.mode;
  const chunkMode = sources.audio === "generate" ? form.chunking.mode : "whole";
  const shortsOn = sources.audio !== "off" && form.shorts?.enabled === true;
  // Refused in admission's words, so Play and the run say the same sentence.
  const shortsOf = (raw: NonNullable<typeof form.shorts>): ShortsSettings => {
    const whole = (value: string): number => (value.trim() === "" ? Number.NaN : Number(value));
    const settings = {
      enabled: true,
      count: whole(raw.count),
      minSeconds: whole(raw.minSeconds),
      maxSeconds: whole(raw.maxSeconds),
      ...(raw.prompt.trim() ? { prompt: raw.prompt } : {}),
      ...(raw.imagePrompt.trim() ? { imagePrompt: raw.imagePrompt } : {}),
      ...shortsExtrasOf(raw),
    };
    for (const problem of shortsSettingsProblems(settings))
      fields.push({ field: `shorts.${problem.field}`, message: problem.message });
    const { musicVolume, speed, ...rest } = settings;
    return {
      ...rest,
      // A number already refused above is left out rather than saved as NaN.
      ...(musicVolume !== undefined && Number.isFinite(musicVolume) ? { musicVolume } : {}),
      ...(speed !== undefined && Number.isFinite(speed) ? { speed } : {}),
      count: Number.isFinite(settings.count) ? settings.count : defaultShorts.count,
      minSeconds: Number.isFinite(settings.minSeconds)
        ? settings.minSeconds
        : defaultShorts.minSeconds,
      maxSeconds: Number.isFinite(settings.maxSeconds)
        ? settings.maxSeconds
        : defaultShorts.maxSeconds,
    };
  };
  // Only the reviews of stages that make something; none left is no reviews at all, which is
  // what every draft saved before them was.
  const reviewed =
    form.reviews === undefined
      ? undefined
      : reviewSettingsFromForm(form.reviews, (stage) =>
          stageMakesItems({ sources, shorts: shortsOn ? { enabled: true } : undefined }, stage),
        );
  if (reviewed?.retriesProblem !== undefined)
    fields.push({ field: "reviews.retries", message: reviewed.retriesProblem });
  const reviews = reviewed?.settings;
  // The ambient bed lies under the long video's narration, so a bed left set with either Off
  // asks for nothing. Refused in the rule's words, so Play and the run say the same sentence.
  const bed =
    sources.video === "generate" && sources.audio !== "off"
      ? ambientBedOfForm(form.ambientBed)
      : undefined;
  const bedProblems = bed === undefined ? [] : ambientBedProblems(bed);
  for (const problem of bedProblems)
    fields.push({
      field: `ambientBed.${problem.field}`,
      message: `${problem.message} Change it ${bedWhere}.`,
    });
  const bedRefused = bedProblems.length;
  const draft: RunDraft = {
    ...(reviews === undefined ? {} : { reviews }),
    ...(form.checkpoints === undefined ? {} : { checkpoints: form.checkpoints }),
    title: form.title,
    format: form.format,
    sources,
    ...(sources.document === "generate"
      ? {
          document: {
            theme: draftDocumentThemeOf(form.document),
            ...(form.document?.custom === undefined ? {} : { custom: form.document.custom }),
          },
        }
      : {}),
    llm: form.llm,
    audio:
      sources.audio === "generate" || form.audio.usePronunciationGlossary !== undefined
        ? // With the glossary on, sharing it is on unless the draft turned it off, as Play
          // shows it for a draft saved before the switch existed.
          form.audio.usePronunciationGlossary === true && form.audio.shareGlossary === undefined
          ? { ...form.audio, shareGlossary: true }
          : form.audio
        : undefined,
    images: form.images,
    // The establishing image belongs to generated images; Off, or images not generated,
    // leaves it out, which is what every draft saved before it was.
    ...(sources.images === "generate" &&
    form.reference !== undefined &&
    form.reference.source !== "off"
      ? {
          reference: {
            source: form.reference.source,
            ...(form.reference.source === "prompt" ? { prompt: form.reference.prompt } : {}),
            thumbnail: form.reference.thumbnail,
          },
        }
      : {}),
    // Three only for a thumbnail the image provider draws; one leaves it out, which is what
    // every draft saved before it was.
    ...(form.thumbnailCount === 3 &&
    (sources.thumbnail === "from_prompt" || sources.thumbnail === "prompt_by_llm")
      ? { thumbnailCount: 3 as const }
      : {}),
    articlePrompt: sources.article === "generate" ? form.articlePrompt : undefined,
    ...(sources.audio === "generate" && form.narrationPrompt?.trim()
      ? { narrationPrompt: form.narrationPrompt }
      : {}),
    // English is never stored on the run, so an English project is the run it always was.
    ...(form.language === undefined || form.language === "en" ? {} : { language: form.language }),
    // Timed from the narration, so a switch left on with narration Off asks for nothing.
    ...(sources.audio !== "off" && form.youtubeDescription === true
      ? {
          youtubeDescription: true,
          ...(form.descriptionPrompt?.trim() ? { descriptionPrompt: form.descriptionPrompt } : {}),
        }
      : {}),
    // Cut from the narration too, so the same rule: a switch left on with narration Off asks
    // for nothing.
    ...(shortsOn && form.shorts !== undefined ? { shorts: shortsOf(form.shorts) } : {}),
    imagePrompts:
      sources.images === "generate"
        ? form.imagePrompts.map((prompt, index) => ({
            name: prompt.name,
            number: number(prompt.number, `imagePrompts.${index}.number`, numberPerPromptMax),
          }))
        : [],
    ...(sources.images === "generate" && form.imageScale !== undefined
      ? { imageScale: imageScaleOf(input.document, fields) }
      : {}),
    thumbnailPrompt: ["from_prompt", "prompt_by_llm"].includes(sources.thumbnail)
      ? form.thumbnailPrompt
      : undefined,
    intro: entry("intro"),
    outro: entry("outro"),
    values: form.values,
    provided: {
      research: sources.research === "provide" ? form.provided.research : undefined,
      article: sources.article === "provide" ? form.provided.article : undefined,
      audio:
        sources.audio === "provide"
          ? file(form.provided.audio, "audio", "provided.audio")
          : undefined,
      thumbnail:
        sources.thumbnail === "provide"
          ? file(form.provided.thumbnail, "thumbnail", "provided.thumbnail")
          : undefined,
      reference:
        sources.images === "generate" && form.reference?.source === "provide"
          ? file(form.provided.reference ?? null, "reference", "provided.reference")
          : undefined,
      images:
        sources.images === "provide"
          ? form.provided.images.flatMap((ref, index) => {
              const id = file(ref, "images", `provided.images.${index}`);
              return id === undefined ? [] : [id];
            })
          : [],
      // Optional, so only a file that was attached is checked; with Shorts off it is kept on
      // the draft for when Shorts is turned back on, and never reaches the run.
      ...(shortsOn && form.provided.shortsMusic
        ? pickMusic(file(form.provided.shortsMusic, "audio", "shorts.music", musicMessages))
        : {}),
      // Only while the bed plays the user's own file; kept on the draft otherwise.
      ...(bed?.source === "upload"
        ? pickBed(file(form.provided.ambientBed ?? null, "audio", "ambientBed.file", bedMessages))
        : {}),
    },
    chunking: {
      mode: chunkMode,
      ...(chunkMode === "words"
        ? { words: number(form.chunking.words, "chunking.words", 10000) }
        : {}),
      ...(chunkMode === "characters"
        ? { characters: number(form.chunking.characters, "chunking.characters", 1000000) }
        : {}),
    },
    subtitles:
      mode === "off"
        ? defaultSubtitles
        : {
            ...form.subtitles,
            mode,
            fontSize: number(form.subtitles.fontSize, "subtitles.fontSize", 120, 16),
          },
    // This run's own gap when one was typed, else the one Settings has. Text that is not a
    // number is NaN, which admission refuses at silenceGapSeconds.
    silenceGapSeconds:
      form.silenceGapSeconds === undefined || form.silenceGapSeconds.trim() === ""
        ? input.silenceGapSeconds
        : Number(form.silenceGapSeconds),
    imageSeconds: measure(
      "imageSeconds",
      sources.video === "generate" || shortsOn,
      defaultImageSeconds,
      imageSecondsProblem,
    ),
    zoomPercent: measure(
      "zoomPercent",
      sources.video === "generate",
      defaultZoomPercent,
      zoomPercentProblem,
    ),
    // A choice from a list, so there is nothing to refuse; a run without a video keeps it
    // for when the video is turned back on.
    motionStyle: form.motionStyle,
    // Kept the same way; admission checks it only while the video renders.
    ...(form.videoEdit === undefined ? {} : { videoEdit: form.videoEdit }),
    // Spoken by the speakers only while narration is generated.
    ...(form.voices !== undefined && sources.audio === "generate" ? { voices: form.voices } : {}),
    // Under the long video's narration only; a number already refused above leaves it out
    // rather than saved as NaN.
    ...(bed !== undefined && bedRefused === 0 ? { ambientBed: bed } : {}),
    // Only while on, and only with a narration to level, so the run is otherwise the one it was.
    ...pickLoudness(
      sources.audio,
      loudnessOfForm(form.loudness, input.loudness ?? defaultLoudness),
    ),
    // Pauses between sentences: the default for a new run, with a narration to pace.
    ...(sources.audio === "generate" ? pausesOfForm(form) : {}),
    edgeSilenceSeconds: measure(
      "edgeSilenceSeconds",
      sources.audio !== "off",
      defaultEdgeSilenceSeconds,
      edgeSilenceSecondsProblem,
    ),
  };
  const parsed = runDraftSchema.safeParse(draft);
  if (!parsed.success)
    fields.push(
      ...parsed.error.issues.map((issue) => ({
        field: issue.path.join("."),
        // The schema carries no sentences of its own; its defaults read like code.
        message: "This setting is not valid. Reload the page and choose it again.",
      })),
    );
  return fields.length || !parsed.success
    ? { ok: false, fields }
    : { ok: true, draft: parsed.data };
}

function pickLoudness(
  audio: string,
  loudness: LoudnessSettings | undefined,
): { readonly loudness?: LoudnessSettings } {
  return audio === "off" || loudness === undefined ? {} : { loudness };
}

// More images for long videos, from what Play's control holds: the rate as images per hour,
// and the narration length it is planned for, which is the provided article's own words or
// else Review's expected words (`images/scale.ts`).
function imageScaleOf(document: PlayDraftDocument, fields: FieldError[]): ImageScale {
  const { form } = document;
  const typed = form.imageScale?.value.trim() ?? "";
  const value = typed === "" ? Number.NaN : Number(typed);
  const minutes = form.imageScale?.every !== "hour";
  const inRange = minutes
    ? value >= everyMinutesMin && value <= everyMinutesMax
    : value >= imagesPerHourMin && value <= imagesPerHourMax;
  if (!inRange)
    fields.push({
      field: "imageScale.value",
      message: minutes
        ? `Enter a number of minutes between ${String(everyMinutesMin)} and ${String(everyMinutesMax)} under Images → More images for long videos.`
        : `Enter a number of images per hour between ${String(imagesPerHourMin)} and ${String(imagesPerHourMax)} under Images → More images for long videos.`,
    });
  const perHour = !inRange
    ? imagesPerHourMin
    : minutes
      ? perHourFromMinutes(value)
      : Math.round(value * 10000) / 10000;
  if (form.sources.article === "provide")
    return { perHour, words: Math.max(1, wordCount(form.provided.article)) };
  // Review checks the expected words on its own (`review-inputs.ts`); a draft whose figure is
  // not a whole number yet plans for Play's starting one.
  const expected = Number(document.expectedWords.trim());
  return {
    perHour,
    words:
      Number.isInteger(expected) && expected >= 1 && expected <= expectedWordsMax
        ? expected
        : defaultExpectedWords,
  };
}
