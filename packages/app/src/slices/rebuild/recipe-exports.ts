import { projectLanguage } from "../../kernel/ports/languages.js";
import type { FingerprintValue } from "../../kernel/runner/work.js";
import { usesShorts, usesYoutubeDescription } from "../admission/rules.js";
import { usesShortMode } from "../admission/short-mode.js";
import { reviewsNarration } from "../reviews/rules.js";
import { timingOperation } from "../subtitles/model.js";
import { audioExportArgs } from "../video/audio-export-args.js";
import { editNeedsTiming } from "../video/edit-settings.js";
import { usesVoices, type VoicesSettings } from "../voices/model.js";
import { portraitValues } from "../voices/portraits.js";
import type { AudioRecipes } from "./recipe-audio.js";
import {
  type RecipeContext,
  type ResolvedWorkRecipe,
  recipe,
  resourceIdentity,
} from "./recipe-model.js";

export function exportRecipes(
  context: RecipeContext,
  audio: AudioRecipes,
): readonly ResolvedWorkRecipe[] {
  const { config, content } = context;
  if (audio.mediaFingerprint === null) return [];
  const recipes: ResolvedWorkRecipe[] = [];
  if (config.sources.video === "off")
    recipes.push(
      recipe(
        context,
        "export:wav",
        "video",
        {
          kind: "local",
          version: 1,
          operation: "export-wav",
          values: [
            audio.mediaFingerprint,
            audioExportArgs([{ kind: "body", path: "$body", seconds: 0 }], "$output"),
          ],
        },
        audio.keys,
      ),
    );
  const captions = config.subtitles !== undefined && config.subtitles.mode !== "off";
  // The YouTube description's chapters, the shorts' clips and captions, a short's own
  // captions, and the video's cuts, chapter cards and chapter openers use the same word timing,
  // so it runs for them even with captions off; only the caption files below wait for captions.
  const voices = usesVoices(config) ? config.voices : undefined;
  if (
    !captions &&
    !usesYoutubeDescription(config) &&
    !usesShorts(config) &&
    !usesShortMode(config) &&
    !editNeedsTiming(config) &&
    !reviewsNarration(config) &&
    voices?.audioFiles !== true
  )
    return recipes;
  const timing = recipe(
    context,
    "subtitles:timing",
    "video",
    {
      kind: "local",
      version: 1,
      operation: timingOperation(projectLanguage(config)),
      // The lead-in moves every word, so the edge silence is part of the timing.
      values: [
        audio.timeline,
        config.silenceGapSeconds,
        // The project language; an English project reads "en" here as it always did.
        config.language ?? config.subtitles?.language ?? "en",
        config.edgeSilenceSeconds,
        // Each word learns its speaker and turn on a multi-voice run.
        ...(voices === undefined ? [] : ["voice-words-v1"]),
      ],
    },
    audio.keys,
  );
  recipes.push(timing);
  if (voices?.audioFiles === true)
    recipes.push(
      recipe(
        context,
        "voices:files",
        "video",
        {
          kind: "local",
          version: 1,
          operation: "audio-files-v1",
          values: [
            audio.mediaFingerprint,
            resourceIdentity(context, timing),
            (audio.sections ?? []).map((section) => [section.title, section.firstTurn]),
            config.title,
          ],
        },
        [...audio.keys, timing.key],
        { unresolved: audio.sections === undefined },
      ),
    );
  if (config.subtitles === undefined || config.subtitles.mode === "off") return recipes;
  const cues = content.subtitleCues;
  const cueRecipe =
    cues === undefined
      ? recipe(
          context,
          "subtitles:cues",
          "video",
          {
            kind: "local",
            version: 1,
            operation: "automatic-cues-v1",
            values: resourceIdentity(context, timing),
          },
          [timing.key],
        )
      : recipe(
          context,
          "subtitles:cues",
          "video",
          {
            kind: "local",
            version: 1,
            operation: "manual-cues-v1",
            // A cue's speaker only when it has one, so captions edited before speakers were
            // kept (and every one-voice run's) keep their fingerprint.
            values: [
              cues.audioFingerprint,
              cues.cues.map(({ speaker, ...cue }) =>
                speaker === undefined ? { ...cue } : { ...cue, speaker },
              ),
            ],
          },
          audio.keys,
        );
  recipes.push(cueRecipe);
  recipes.push(
    recipe(
      context,
      "subtitles:files",
      "video",
      {
        kind: "local",
        version: 1,
        operation: "subtitle-files-v1",
        values: [
          resourceIdentity(context, cueRecipe),
          config.format,
          config.subtitles.fontId,
          config.subtitles.fontSize,
          config.subtitles.position,
          // Only when the brand kit set them, so captions made before keep their fingerprint.
          ...(config.subtitles.color === undefined && config.subtitles.outlineColor === undefined
            ? []
            : [["colours", config.subtitles.color ?? null, config.subtitles.outlineColor ?? null]]),
          ...(voices === undefined ? [] : [captionSpeakerValues(voices, audio.mediaFingerprint)]),
        ],
      },
      [cueRecipe.key],
    ),
  );
  return recipes;
}
export function manualCuesNeedReview(
  context: RecipeContext,
  recipes: readonly ResolvedWorkRecipe[],
): boolean {
  const cues = context.content.subtitleCues;
  if (cues === undefined) return false;
  const timing = recipes.find((value) => value.key === "subtitles:timing");
  return (
    timing !== undefined &&
    cues.audioFingerprint !== timing.logicalFingerprint &&
    cues.audioFingerprint !==
      context.manifest.outputs.find(
        (value) => value.workKey === timing.key && value.state === "ready",
      )?.fingerprint
  );
}

// How the captions show the speakers: names, colours by place, name tags and, for a podcast or
// interview, the speaker panel, which runs to the end of the narration. The panel's portraits
// only when a speaker has one; the render reads the caption file's fingerprint, so it follows.
function captionSpeakerValues(voices: VoicesSettings, media: string | null): FingerprintValue {
  const portraits = portraitValues(voices);
  return [
    "voice-captions-v1",
    voices.format,
    voices.nameTags,
    voices.speakers.map((speaker) => [speaker.id, speaker.name.trim()]),
    media,
    ...(portraits === undefined ? [] : [["portraits", [...portraits]]]),
  ];
}
