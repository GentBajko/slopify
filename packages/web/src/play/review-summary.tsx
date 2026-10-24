import { sourceOf } from "@app/slices/admission/model.js";
import { motionStyleLabels } from "@app/slices/admission/rules.js";
import type { Field } from "@app/slices/admission/substitute.js";
import { documentThemeLabel } from "@app/slices/document/model.js";
import {
  defaultMusicVolume,
  defaultShortsPromptName,
  shortsExtrasOf,
} from "@app/slices/shorts/model.js";
import {
  cutModeLabels,
  legacyVideoEdit,
  type VideoEditSettings,
  videoEditOf,
  videoEditRows,
} from "@app/slices/video/edit-settings.js";
import { defaultDescriptionPromptName } from "@app/slices/youtube/model.js";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { modelsKey, type ProviderModels } from "@/lib/models";
import { entriesQuery, providersQuery, voicesQuery } from "@/queries";
import { type FontSummary, fontsKey } from "@/subtitles/api";
import { usePlaySession } from "./draft-context";
import { outputKindOf } from "./output-kind";
import { requiredProviders } from "./problems";
import { CheckpointReview } from "./run-review";
import { rowLabel, type SetupRowId } from "./setup-rows";
import { type ShortsForm, shortsOn, sourceLabels } from "./state";

// The Look in one line: only what differs from plain cuts, and the animated images with their
// model and that they are paid.
function lookSummary(form: { readonly videoEdit?: VideoEditSettings | undefined }): string {
  const rows = videoEditRows(videoEditOf(form));
  const plain = new Map(videoEditRows(legacyVideoEdit));
  const changed = rows
    .filter(([label, value]) => label !== "Cuts" && plain.get(label) !== value)
    .map(([label, value]) =>
      label === "Animate images"
        ? `Animated images: ${value} (paid)`
        : label === "Chapter cards"
          ? "Chapter cards"
          : label === "Transition"
            ? value
            : `${label}: ${value}`,
    );
  return changed.length === 0 ? "Plain cuts, no effects" : changed.join(" · ");
}

function SummaryGroup({
  name,
  change,
  onChange,
  children,
}: {
  readonly name: string;
  // "Change narration": opens the row that holds these settings, closing the summary.
  readonly change: string;
  readonly onChange: () => void;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <section aria-label={`${name} summary`} className="min-w-0 border-t border-line pt-3">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h3 className="m-0 font-semibold">{name}</h3>
        <Button variant="quiet" size="small" onClick={onChange}>
          {change}
        </Button>
      </div>
      {children}
    </section>
  );
}

// Everything the run will do, grouped by the same rows as the form, in words. Each group has
// one Change that opens its row; the settings themselves are read here, not edited.
export function ReviewSummary({
  fields,
  topicField,
  onReveal,
  children,
}: {
  readonly fields: readonly Field[];
  // The field at the top of Create that holds the topic: "title", or "values.Topic".
  readonly topicField: string;
  readonly onReveal: (field: string) => void;
  readonly children: ReactNode;
}): ReactElement {
  const { document, review } = usePlaySession();
  const { form } = document;
  const { api } = useApp();
  // Disabled observers would block the summary's explicit catalogue refresh.
  const cache = useQueryClient();
  const providers = cache.getQueryData(providersQuery(api).queryKey);
  const entries = cache.getQueryData(entriesQuery(api).queryKey);
  const voices = cache.getQueryData(voicesQuery(api).queryKey);
  const fonts = cache.getQueryData<{ readonly fonts: readonly FontSummary[] }>(fontsKey);
  const textModels = cache.getQueryData<ProviderModels>(modelsKey(form.llm.provider));
  const audioModels = cache.getQueryData<ProviderModels>(modelsKey(form.audio.provider));
  const imageModels = cache.getQueryData<ProviderModels>(modelsKey(form.images.provider));
  const kind = outputKindOf(form);
  const required = new Set(
    requiredProviders(form, entries?.entries ?? []).map((choice) => choice.family),
  );
  const generatedAudio = form.sources.audio === "generate";
  const generatedThumbnail = ["from_prompt", "prompt_by_llm"].includes(form.sources.thumbnail);
  const providerName = (id: string) =>
    providers?.providers.find((provider) => provider.id === id)?.displayName ?? id;
  const row = (label: string, value: ReactNode) => (
    <div
      key={label}
      className="grid min-w-0 grid-cols-[110px_minmax(0,1fr)] items-start gap-x-3 sm:grid-cols-[150px_minmax(0,1fr)]"
    >
      <dt className="break-words py-1 text-ink-2">{label}</dt>
      <dd className="m-0 min-w-0 whitespace-pre-wrap break-words py-1">
        {value || "Not picked yet"}
      </dd>
    </div>
  );
  const group = (id: SetupRowId, field: string, body: ReactNode) => {
    const name = rowLabel(id, kind);
    return (
      <SummaryGroup
        name={name}
        change={`Change ${name.toLowerCase()}`}
        onChange={() => onReveal(field)}
      >
        <dl className="m-0 text-body">{body}</dl>
      </SummaryGroup>
    );
  };
  const chunkCount =
    form.chunking.mode === "words" || form.chunking.mode === "characters"
      ? form.chunking.mode
      : null;
  return (
    <>
      <SummaryGroup name="Topic" change="Change the topic" onChange={() => onReveal(topicField)}>
        <dl className="m-0 text-body">
          {row("Title", form.title || "Untitled")}
          {fields.map(({ name }) => row(name, form.values[name] ?? ""))}
        </dl>
        {children}
      </SummaryGroup>
      {group(
        "article",
        "sources.article",
        <>
          {row("Article", sourceLabels[form.sources.article])}
          {form.sources.article === "generate"
            ? row("Article prompt", form.articlePrompt)
            : form.sources.article === "provide"
              ? row("Article text", "Your own text")
              : null}
          {form.sources.article === "generate"
            ? row("Research", sourceLabels[form.sources.research])
            : null}
          {form.sources.research === "provide" && form.sources.article === "generate"
            ? row("Research notes", form.provided.research)
            : null}
          {required.has("llm") ? (
            <>
              {row("Written by", providerName(form.llm.provider))}
              {row(
                "Model",
                textModels?.models.find((model) => model.id === form.llm.model)?.name ??
                  form.llm.model,
              )}
              {form.llm.thinking ||
              textModels?.models.find((model) => model.id === form.llm.model)?.thinkingModes?.length
                ? row("Thinking", form.llm.thinking ?? "Model default")
                : null}
            </>
          ) : null}
        </>,
      )}
      {group(
        "narration",
        "sources.audio",
        <>
          {row("Narration", sourceLabels[form.sources.audio])}
          {generatedAudio ? (
            <>
              {row("Voice service", providerName(form.audio.provider))}
              {row(
                "Voice model",
                audioModels?.models.find((model) => model.id === form.audio.model)?.name ??
                  form.audio.model,
              )}
              {row(
                "Voice",
                voices?.voices.find(
                  (voice) =>
                    voice.provider === form.audio.provider && voice.voiceId === form.audio.voice,
                )?.name ?? form.audio.voice,
              )}
              {row(
                "Split the narration",
                chunkCount
                  ? `Every ${form.chunking[chunkCount] || "(not entered)"} ${chunkCount}`
                  : form.chunking.mode === "whole"
                    ? "Read as one piece"
                    : "By paragraph",
              )}
              {row("Intro", form.intro || "None")}
              {row(
                "Prepared for speech",
                form.narrationPrompt
                  ? `${form.narrationPrompt} · one AI call per narration piece and entry`
                  : "No",
              )}
              {row("Outro", form.outro || "None")}
            </>
          ) : null}
          {form.sources.audio === "provide"
            ? row("Narration file", form.provided.audio?.name)
            : null}
        </>,
      )}
      {group(
        "images",
        "sources.images",
        <>
          {row("Images", sourceLabels[form.sources.images])}
          {required.has("image") ? (
            <>
              {row("Image service", providerName(form.images.provider))}
              {row(
                "Image model",
                imageModels?.models.find((model) => model.id === form.images.model)?.name ??
                  form.images.model,
              )}
              {form.images.thinking === undefined
                ? null
                : row("Image effort", form.images.thinking)}
            </>
          ) : null}
          {form.sources.images === "generate" &&
          form.reference !== undefined &&
          form.reference.source !== "off"
            ? row(
                "Establishing image",
                `${
                  form.reference.source === "prompt"
                    ? form.reference.prompt || "(no prompt picked)"
                    : (form.provided.reference?.name ?? "(no file attached)")
                }${form.reference.thumbnail ? " · thumbnail too" : ""}`,
              )
            : null}
          {form.sources.images === "generate"
            ? form.imagePrompts.length
              ? form.imagePrompts.map((prompt) =>
                  row(prompt.name, `${prompt.number || "(not entered)"} images`),
                )
              : row("Image prompts", "None ticked")
            : null}
          {form.sources.images === "provide"
            ? row(
                "Image files",
                form.provided.images.length ? (
                  <ol className="m-0 list-inside list-decimal p-0">
                    {form.provided.images.map((file) => (
                      <li key={file.attachmentId}>{file.name}</li>
                    ))}
                  </ol>
                ) : (
                  "No files attached"
                ),
              )
            : null}
        </>,
      )}
      {group(
        "video",
        "format",
        <>
          {row("Shape", form.format)}
          {kind === "video" ? row("Video", sourceLabels[form.sources.video]) : null}
          {form.sources.video === "generate"
            ? row("Seconds per image", form.imageSeconds || "(not entered)")
            : null}
          {form.sources.video === "generate"
            ? row("Zoom", form.zoomPercent ? `${form.zoomPercent}%` : "(not entered)")
            : null}
          {form.sources.video === "generate"
            ? row("Motion", motionStyleLabels[form.motionStyle])
            : null}
          {form.sources.video === "generate"
            ? row("Cuts", cutModeLabels[videoEditOf(form).cuts])
            : null}
          {form.sources.video === "generate" ? row("Look", lookSummary(form)) : null}
          {form.sources.audio !== "off"
            ? row(
                "Silence at start and end",
                form.edgeSilenceSeconds ? `${form.edgeSilenceSeconds} s` : "(not entered)",
              )
            : null}
          {form.sources.audio !== "off"
            ? row("Captions", captionWords[form.subtitles.mode] ?? form.subtitles.mode)
            : row("Captions", "None: there is no narration")}
          {form.sources.audio !== "off" && form.subtitles.mode !== "off" ? (
            <>
              {row(
                "Caption font",
                fonts?.fonts.find((font) => font.id === form.subtitles.fontId)?.name ??
                  form.subtitles.fontId,
              )}
              {row("Caption size", `${form.subtitles.fontSize || "(not entered)"} px`)}
              {row("Caption position", form.subtitles.position)}
            </>
          ) : null}
        </>,
      )}
      {group(
        "outputs",
        "sources.thumbnail",
        <>
          {row("Thumbnail", sourceLabels[form.sources.thumbnail])}
          {generatedThumbnail ? row("Thumbnail prompt", form.thumbnailPrompt) : null}
          {form.sources.thumbnail === "provide"
            ? row("Thumbnail file", form.provided.thumbnail?.name)
            : null}
          {form.sources.audio !== "off"
            ? row(
                "YouTube description",
                form.youtubeDescription === true
                  ? `${form.descriptionPrompt || defaultDescriptionPromptName} prompt · one AI call after the captions are timed`
                  : "No",
              )
            : null}
          {form.sources.audio !== "off"
            ? row(
                "Shorts",
                shortsOn(form) && form.shorts !== undefined
                  ? [
                      `${form.shorts.count} shorts of ${form.shorts.minSeconds}-${form.shorts.maxSeconds} s`,
                      `${form.shorts.prompt || defaultShortsPromptName} prompt`,
                      `${form.shorts.imagePrompt || defaultShortsPromptName} image prompt`,
                      ...shortsExtrasSummary(form.shorts, form.provided.shortsMusic?.name),
                      "Portrait images, made after the captions are timed",
                    ].join(" · ")
                  : "No",
              )
            : null}
          {row(
            "PDF",
            sourceOf(form.sources, "document") === "generate"
              ? `${documentThemeLabel(form.document)} look`
              : "No",
          )}
        </>,
      )}
      <SummaryGroup
        name="Pauses and checks"
        change="Change pauses and checks"
        onChange={() => onReveal("checkpoints")}
      >
        <CheckpointReview
          selected={form.checkpoints}
          reviewed={review.valid ? review.receipt?.checkpointSet : undefined}
        />
      </SummaryGroup>
    </>
  );
}

const captionWords: Readonly<Record<string, string>> = {
  off: "None",
  files: "Caption files only (.srt + .vtt)",
  "burn-in": "Shown in the video",
};

// The later Shorts settings the review names, each only when it differs from the default.
function shortsExtrasSummary(shorts: ShortsForm, music: string | undefined): readonly string[] {
  const settings = shortsExtrasOf(shorts);
  const speed = settings.speed;
  const volume = settings.musicVolume;
  return [
    ...(settings.titleOnScreen === true ? ["Title on screen"] : []),
    ...(speed !== undefined && speed !== 1 ? [`${speed.toFixed(2)}× speed`] : []),
    ...(music === undefined
      ? volume !== undefined && volume !== defaultMusicVolume
        ? [`Music at ${String(volume)}% once added in Edit project`]
        : []
      : [`Music: ${music} at ${String(volume ?? defaultMusicVolume)}%`]),
    ...(settings.fullVideoLink === undefined ? [] : [`Links ${settings.fullVideoLink}`]),
  ];
}
