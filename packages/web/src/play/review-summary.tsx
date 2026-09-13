import type { Field } from "@app/slices/admission/substitute.js";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/ui/button";
import { modelsKey, type ProviderModels } from "@/lib/models";
import { entriesQuery, providersQuery, voicesQuery } from "@/queries";
import { type FontSummary, fontsKey } from "@/subtitles/api";
import { usePlaySession } from "./draft-context";
import { sourceLabels } from "./state";

function SummaryGroup({
  name,
  children,
}: {
  readonly name: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <section aria-label={`${name} summary`} className="min-w-0 border-t border-line pt-5">
      <h3 className="mb-4 font-semibold">{name}</h3>
      {children}
    </section>
  );
}

export function ReviewSummary({
  fields,
  onReveal,
  children,
}: {
  readonly fields: readonly Field[];
  readonly onReveal: (field: string) => void;
  readonly children: ReactNode;
}): ReactElement {
  const { document } = usePlaySession();
  const { form } = document;
  const { api } = useApp();
  // Disabled observers would block Review's explicit catalogue refresh.
  const cache = useQueryClient();
  const providers = cache.getQueryData(providersQuery(api).queryKey);
  const entries = cache.getQueryData(entriesQuery(api).queryKey);
  const voices = cache.getQueryData(voicesQuery(api).queryKey);
  const fonts = cache.getQueryData<{ readonly fonts: readonly FontSummary[] }>(fontsKey);
  const textModels = cache.getQueryData<ProviderModels>(modelsKey(form.llm.provider));
  const audioModels = cache.getQueryData<ProviderModels>(modelsKey(form.audio.provider));
  const imageModels = cache.getQueryData<ProviderModels>(modelsKey(form.images.provider));
  const generatedAudio = form.sources.audio === "generate";
  const generatedThumbnail = ["from_prompt", "prompt_by_llm"].includes(form.sources.thumbnail);
  const generatedText =
    form.sources.article === "generate" ||
    form.sources.thumbnail === "prompt_by_llm" ||
    (generatedAudio &&
      (["intro", "outro"] as const).some((kind) =>
        entries?.entries.some(
          (entry) => entry.category === kind && entry.name === form[kind] && entry.mode === "llm",
        ),
      ));
  const providerName = (id: string) =>
    providers?.providers.find((provider) => provider.id === id)?.displayName ?? id;
  const row = (label: string, field: string | null, value: ReactNode) => (
    <div
      key={field ?? label}
      className="grid min-w-0 grid-cols-[90px_minmax(0,1fr)_auto] items-start gap-x-3 py-1 sm:grid-cols-[145px_minmax(0,1fr)_auto]"
    >
      <dt className="break-words py-2 text-ink2">{label}</dt>
      <dd className="min-w-0 whitespace-pre-wrap break-words py-2">{value || "Not selected"}</dd>
      {field ? (
        <dd>
          <Button variant="ghost" aria-label={`Edit ${label}`} onClick={() => onReveal(field)}>
            Edit ↗
          </Button>
        </dd>
      ) : null}
    </div>
  );
  const chunkCount =
    form.chunking.mode === "words" || form.chunking.mode === "characters"
      ? form.chunking.mode
      : null;
  return (
    <>
      <SummaryGroup name="Content">
        <dl className="text-body">
          {row("Project", "title", form.title || "Untitled run")}
          {row("Article", "sources.article", sourceLabels[form.sources.article])}
          {form.sources.article === "generate"
            ? row("Article prompt", "articlePrompt", form.articlePrompt)
            : row("Article text", "provided.article", "Your article")}
          {form.sources.article === "generate"
            ? row("Research", "sources.research", sourceLabels[form.sources.research])
            : row("Research", null, "Off · Article is provided")}
          {form.sources.research === "provide" && form.sources.article === "generate"
            ? row("Research text", "provided.research", form.provided.research)
            : null}
          {generatedText ? (
            <>
              {row("Text provider", "llm.provider", providerName(form.llm.provider))}
              {row(
                "Text model",
                "llm.model",
                textModels?.models.find((model) => model.id === form.llm.model)?.name ??
                  form.llm.model,
              )}
              {form.llm.thinking ||
              textModels?.models.find((model) => model.id === form.llm.model)?.thinkingModes?.length
                ? row("Thinking", "llm.thinking", form.llm.thinking ?? "Model default")
                : null}
            </>
          ) : null}
          {fields.map(({ name }) => row(name, `values.${name}`, form.values[name] ?? ""))}
        </dl>
        {children}
      </SummaryGroup>
      <SummaryGroup name="Outputs">
        <dl className="text-body">
          {row("Narration", "sources.audio", sourceLabels[form.sources.audio])}
          {generatedAudio ? (
            <>
              {row("Audio provider", "audio.provider", providerName(form.audio.provider))}
              {row(
                "Audio model",
                "audio.model",
                audioModels?.models.find((model) => model.id === form.audio.model)?.name ??
                  form.audio.model,
              )}
              {row(
                "Voice",
                "audio.voice",
                voices?.voices.find(
                  (voice) =>
                    voice.provider === form.audio.provider && voice.voiceId === form.audio.voice,
                )?.name ?? form.audio.voice,
              )}
              {row(
                "Chunking",
                chunkCount ? `chunking.${chunkCount}` : "chunking.mode",
                chunkCount
                  ? `Every ${form.chunking[chunkCount] || "(not entered)"} ${chunkCount}`
                  : form.chunking.mode === "whole"
                    ? "Whole text"
                    : "Paragraph",
              )}
              {row("Intro", "intro", form.intro || "Off")}
              {row("Outro", "outro", form.outro || "Off")}
            </>
          ) : null}
          {form.sources.audio === "provide"
            ? row("Narration file", "provided.audio", form.provided.audio?.name)
            : null}
          {row("Images", "sources.images", sourceLabels[form.sources.images])}
          {form.sources.images === "generate" || generatedThumbnail ? (
            <>
              {row("Image provider", "images.provider", providerName(form.images.provider))}
              {row(
                "Image model",
                "images.model",
                imageModels?.models.find((model) => model.id === form.images.model)?.name ??
                  form.images.model,
              )}
            </>
          ) : null}
          {form.sources.images === "generate"
            ? form.imagePrompts.length
              ? form.imagePrompts.map((prompt, index) =>
                  row(
                    prompt.name,
                    `imagePrompts.${index}.number`,
                    `${prompt.name} · ${prompt.number || "(not entered)"} images`,
                  ),
                )
              : row("Image prompts", "imagePrompts", "None selected")
            : null}
          {form.sources.images === "provide"
            ? row(
                "Image files",
                "provided.images",
                form.provided.images.length ? (
                  <ol className="list-inside list-decimal">
                    {form.provided.images.map((file) => (
                      <li key={file.attachmentId}>{file.name}</li>
                    ))}
                  </ol>
                ) : (
                  "No files selected"
                ),
              )
            : null}
          {row("Thumbnail", "sources.thumbnail", sourceLabels[form.sources.thumbnail])}
          {generatedThumbnail
            ? row("Thumbnail prompt", "thumbnailPrompt", form.thumbnailPrompt)
            : null}
          {form.sources.thumbnail === "provide"
            ? row("Thumbnail file", "provided.thumbnail", form.provided.thumbnail?.name)
            : null}
          {row("Video", "sources.video", sourceLabels[form.sources.video])}
        </dl>
      </SummaryGroup>
      <SummaryGroup name="Style">
        <dl className="text-body">
          {row("Frame", "format", form.format)}
          {form.sources.audio !== "off"
            ? row("Subtitles", "subtitles.mode", form.subtitles.mode)
            : row("Subtitles", null, "Off · Audio is Off")}
          {form.sources.audio !== "off" && form.subtitles.mode !== "off" ? (
            <>
              {row(
                "Subtitle font",
                "subtitles.fontId",
                fonts?.fonts.find((font) => font.id === form.subtitles.fontId)?.name ??
                  form.subtitles.fontId,
              )}
              {row(
                "Subtitle size",
                "subtitles.fontSize",
                `${form.subtitles.fontSize || "(not entered)"} px`,
              )}
              {row("Subtitle position", "subtitles.position", form.subtitles.position)}
            </>
          ) : null}
        </dl>
        {form.sources.audio !== "off" && form.subtitles.mode === "files" ? (
          <p className="mt-3 text-small text-ink2">
            Font, size and position apply to burned captions. SRT/VTT players choose their own
            styling.
          </p>
        ) : null}
      </SummaryGroup>
    </>
  );
}
