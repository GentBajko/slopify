import { readinessIsUsable } from "@app/kernel/ports/model.js";
import { sourceOf } from "@app/slices/admission/model.js";
import { motionStyleLabels, usesYoutubeDescription } from "@app/slices/admission/rules.js";
import type { Field } from "@app/slices/admission/substitute.js";
import { documentThemeLabel } from "@app/slices/document/model.js";
import type { Entry } from "@app/slices/library/model.js";
import type { PlayDraftDocument } from "@app/slices/play-drafts/model.js";
import type { ProviderFamily, ProviderStatus, Voice } from "@app/slices/settings/model.js";
import { defaultDescriptionPromptName } from "@app/slices/youtube/model.js";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/ui/button";
import { modelsKey, type ProviderModels } from "@/lib/models";
import { entriesQuery, providersQuery, voicesQuery } from "@/queries";
import { type FontSummary, fontsKey } from "@/subtitles/api";
import { usePlaySession } from "./draft-context";
import { CheckpointReview } from "./run-review";
import { sourceLabels } from "./state";

interface RequiredProvider {
  readonly field: string;
  readonly family: ProviderFamily;
  readonly label: string;
  readonly provider: string;
  readonly model: string;
  readonly voice?: string;
}

function readiness(provider: ProviderStatus | undefined): {
  readonly ok: boolean;
  readonly text: string;
} {
  if (provider === undefined) return { ok: false, text: "Provider status unavailable" };
  if (provider.readiness.kind === "cli")
    return readinessIsUsable(provider.readiness)
      ? {
          ok: true,
          text:
            provider.readiness.version === undefined
              ? "CLI ready"
              : `CLI ready · ${provider.readiness.version}`,
        }
      : { ok: false, text: provider.readiness.issue ?? "CLI not found" };
  return provider.readiness.hasKey
    ? { ok: true, text: "API key saved" }
    : { ok: false, text: "API key missing" };
}

function requiredProviders(
  form: PlayDraftDocument["form"],
  entries: readonly Entry[],
): readonly RequiredProvider[] {
  const generatedAudio = form.sources.audio === "generate";
  const generatedThumbnail = ["from_prompt", "prompt_by_llm"].includes(form.sources.thumbnail);
  const generatedText =
    form.sources.article === "generate" ||
    form.sources.thumbnail === "prompt_by_llm" ||
    usesYoutubeDescription(form) ||
    (generatedAudio &&
      (["intro", "outro"] as const).some((kind) =>
        entries.some(
          (entry) => entry.category === kind && entry.name === form[kind] && entry.mode === "llm",
        ),
      ));
  return [
    ...(generatedText && form.llm
      ? [
          {
            field: "llm.provider",
            family: "llm" as const,
            label: "Text generation",
            provider: form.llm.provider,
            model: form.llm.model,
          },
        ]
      : []),
    ...(generatedAudio && form.audio
      ? [
          {
            field: "audio.provider",
            family: "tts" as const,
            label: "Narration",
            provider: form.audio.provider,
            model: form.audio.model,
            voice: form.audio.voice,
          },
        ]
      : []),
    ...((form.sources.images === "generate" || generatedThumbnail) && form.images
      ? [
          {
            field: "images.provider",
            family: "image" as const,
            label: "Images",
            provider: form.images.provider,
            model: form.images.model,
          },
        ]
      : []),
  ];
}

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

function PreflightSummary({
  form,
  entries,
  providers,
  voices,
  textModels,
  audioModels,
  imageModels,
  onReveal,
}: {
  readonly form: PlayDraftDocument["form"];
  readonly entries: readonly Entry[];
  readonly providers: readonly ProviderStatus[] | undefined;
  readonly voices: readonly Voice[] | undefined;
  readonly textModels: ProviderModels | undefined;
  readonly audioModels: ProviderModels | undefined;
  readonly imageModels: ProviderModels | undefined;
  readonly onReveal: (field: string) => void;
}): ReactElement {
  const required = requiredProviders(form, entries);
  if (!required.length)
    return (
      <SummaryGroup name="Run readiness">
        <p className="text-body text-ink2">
          No generated providers required. Supplied content is ready for processing.
        </p>
      </SummaryGroup>
    );
  const modelLists: Readonly<Record<ProviderFamily, ProviderModels | undefined>> = {
    llm: textModels,
    tts: audioModels,
    image: imageModels,
  };
  return (
    <SummaryGroup name="Run readiness">
      <p className="mb-3 text-small text-ink2">
        These checks are refreshed with Review and checked again when you start.
      </p>
      <ul className="divide-y divide-line" aria-label="Run readiness checks">
        {required.map((choice) => {
          const provider = providers?.find(
            (candidate) => candidate.id === choice.provider && candidate.family === choice.family,
          );
          const providerCheck = readiness(provider);
          const models = modelLists[choice.family];
          const model = models?.models.find((candidate) => candidate.id === choice.model);
          const modelCheck =
            models === undefined
              ? { ok: true, text: "Model checked at Start" }
              : model !== undefined || models.allowsCustom
                ? { ok: true, text: "Model available" }
                : { ok: false, text: "Model unavailable" };
          const voiceCheck =
            choice.voice === undefined
              ? undefined
              : voices === undefined
                ? { ok: false, text: "Voice list unavailable" }
                : voices.some(
                      (voice) =>
                        voice.provider === choice.provider && voice.voiceId === choice.voice,
                    )
                  ? { ok: true, text: "Voice saved" }
                  : { ok: false, text: "Voice missing" };
          const checks = [providerCheck, modelCheck, ...(voiceCheck ? [voiceCheck] : [])];
          const ready = checks.every((check) => check.ok);
          return (
            <li
              key={`${choice.family}:${choice.provider}`}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <span className="font-medium">{choice.label}</span>
              <span className={ready ? "text-lime" : "text-red"}>
                {ready
                  ? "Ready"
                  : checks
                      .filter((check) => !check.ok)
                      .map((check) => check.text)
                      .join(" · ")}
              </span>
              {!ready ? (
                <Button variant="ghost" onClick={() => onReveal(choice.field)}>
                  Edit ↗
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </SummaryGroup>
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
  const { document, review } = usePlaySession();
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
    usesYoutubeDescription(form) ||
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
      <PreflightSummary
        form={form}
        entries={entries?.entries ?? []}
        providers={providers?.providers}
        voices={voices?.voices}
        textModels={textModels}
        audioModels={audioModels}
        imageModels={imageModels}
        onReveal={onReveal}
      />
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
              {row(
                "Narration Preparation",
                "narrationPrompt",
                form.narrationPrompt
                  ? `${form.narrationPrompt} · One LLM call per narration chunk and entry`
                  : "Off",
              )}
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
          {form.sources.video === "generate"
            ? row("Seconds per image", "imageSeconds", form.imageSeconds || "(not entered)")
            : null}
          {form.sources.video === "generate"
            ? row(
                "Zoom",
                "zoomPercent",
                form.zoomPercent ? `${form.zoomPercent}%` : "(not entered)",
              )
            : null}
          {form.sources.video === "generate"
            ? row("Motion", "motionStyle", motionStyleLabels[form.motionStyle])
            : null}
          {form.sources.audio !== "off"
            ? row(
                "Silence at start and end",
                "edgeSilenceSeconds",
                form.edgeSilenceSeconds ? `${form.edgeSilenceSeconds} s` : "(not entered)",
              )
            : null}
          {form.sources.audio !== "off"
            ? row(
                "YouTube description",
                "youtubeDescription",
                form.youtubeDescription === true
                  ? `${form.descriptionPrompt || defaultDescriptionPromptName} prompt · One LLM call after subtitle timing`
                  : "Off",
              )
            : null}
          {row(
            "Document",
            "sources.document",
            sourceOf(form.sources, "document") === "generate"
              ? `PDF · ${documentThemeLabel(form.document)} theme`
              : sourceLabels.off,
          )}
        </dl>
      </SummaryGroup>
      <SummaryGroup name="Checkpoints">
        <CheckpointReview
          selected={form.checkpoints}
          reviewed={review.valid ? review.receipt?.checkpointSet : undefined}
        />
        <Button
          variant="ghost"
          aria-label="Edit checkpoints"
          onClick={() => onReveal("checkpoints")}
        >
          Edit checkpoints ↗
        </Button>
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
