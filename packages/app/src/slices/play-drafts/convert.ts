import { z } from "zod";
import type { EntryChoice, RunDraft } from "../admission/model.js";
import { type FieldError, numberPerPromptMax } from "../admission/rules.js";
import { runDraftSchema } from "../admission/schema.js";
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
      message: `That ${category} entry no longer exists; pick another.`,
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
          ? "This upload is still copying."
          : "That upload is no longer available; pick the file again.",
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
  };
  const parsed = runDraftSchema.safeParse(draft);
  if (!parsed.success)
    fields.push(
      ...parsed.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    );
  return fields.length || !parsed.success
    ? { ok: false, fields }
    : { ok: true, draft: parsed.data };
}
