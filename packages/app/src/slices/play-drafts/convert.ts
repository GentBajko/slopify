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
import { documentThemeOf } from "../document/model.js";
import type { Entry } from "../library/model.js";
import { defaultSubtitles } from "../subtitles/model.js";
import type { DraftAttachment, PlayDraftDocument } from "./model.js";

export function toAdmissionDraft(input: {
  readonly document: PlayDraftDocument;
  readonly attachments: readonly DraftAttachment[];
  readonly entries: readonly Entry[];
  readonly silenceGapSeconds: number;
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
          ? "This file is still uploading. Wait for it to finish."
          : "That upload is no longer available. Choose the file again.",
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
  const draft: RunDraft = {
    ...(form.checkpoints === undefined ? {} : { checkpoints: form.checkpoints }),
    title: form.title,
    format: form.format,
    sources,
    ...(sources.document === "generate"
      ? { document: { theme: documentThemeOf(form.document) } }
      : {}),
    llm: form.llm,
    audio:
      sources.audio === "generate" || form.audio.usePronunciationGlossary !== undefined
        ? form.audio
        : undefined,
    images: form.images,
    articlePrompt: sources.article === "generate" ? form.articlePrompt : undefined,
    ...(sources.audio === "generate" && form.narrationPrompt?.trim()
      ? { narrationPrompt: form.narrationPrompt }
      : {}),
    // Timed from the narration, so a switch left on with narration Off asks for nothing.
    ...(sources.audio !== "off" && form.youtubeDescription === true
      ? {
          youtubeDescription: true,
          ...(form.descriptionPrompt?.trim() ? { descriptionPrompt: form.descriptionPrompt } : {}),
        }
      : {}),
    imagePrompts:
      sources.images === "generate"
        ? form.imagePrompts.map((prompt, index) => ({
            name: prompt.name,
            number: number(prompt.number, `imagePrompts.${index}.number`, numberPerPromptMax),
          }))
        : [],
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
      images:
        sources.images === "provide"
          ? form.provided.images.flatMap((ref, index) => {
              const id = file(ref, "images", `provided.images.${index}`);
              return id === undefined ? [] : [id];
            })
          : [],
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
    silenceGapSeconds: input.silenceGapSeconds,
    imageSeconds: measure(
      "imageSeconds",
      sources.video === "generate",
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
