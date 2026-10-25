import { usesPronunciationGlossary } from "@app/slices/admission/rules.js";
import { systemVoiceProvider } from "@app/slices/settings/model.js";
import { type ComponentProps, type ReactNode, useEffect } from "react";
import type { CastMember } from "@/channels/api";
import { Fold } from "@/components/kit/fold";
import { ChunkingControl, chunkingWords } from "@/play/chunking";
import { ImagePrompts } from "@/play/image-prompts";
import { FilePick } from "@/play/provided";
import type { RailProps } from "@/play/rail-frame";
import { SourceSwitch, StageRail } from "@/play/rail-frame";
import { SpeakersEditor, voiceFormatLabel } from "@/voices/speakers-editor";
import { DescribeFiguresToggle } from "./describe-figures.js";
import { NarrationAliasesToggle } from "./narration-aliases.js";
import { NarrationPreparation } from "./narration-preparation";
import { PronunciationGlossary } from "./pronunciation-glossary";
import { ReferenceImage, referenceOff } from "./reference-image";
import { ServiceGroup } from "./service-group";
import { SpeechInstall } from "./speech-install";
import { ThinkingPicker } from "./thinking";
import { VoicePicker } from "./voice-picker";
import { VoiceSample } from "./voice-sample";

// The two rails that carry a provider, and with it everything a provider decides: the
// voice and the chunking of the narration, and the model and the ticked
// prompts of the images. Both fall back to a file pick when their stage is
// set to Provide.

export function AudioRail({
  form,
  prompts,
  providers,
  voices,
  problem,
  update,
  onPickFiles,
  onRemoveFile,
  onReattachFile,
  rawCounts,
  advanced,
  cast,
  language,
  titled,
}: RailProps & {
  // The project language the voice list is filtered by; absent lists every voice.
  readonly language?: string | undefined;
  // The draft channel's cast, which speakers can be picked from.
  readonly cast?: readonly CastMember[] | undefined;
  readonly rawCounts?: ComponentProps<typeof ChunkingControl>["rawCounts"];
  // Intro, outro and the links that go with them, drawn inside the Advanced disclosure.
  readonly advanced?: ReactNode;
}) {
  // With several speakers each one has its own voice, and the voice here only reads the intro
  // and outro. Without either, it reads nothing: it is kept as the first speaker's voice (the
  // run still records one) and not shown, so it can't pass for the book's narrator.
  const lead = form.voices?.speakers.find(
    (speaker) => speaker.voice.provider && speaker.voice.model && speaker.voice.voice,
  )?.voice;
  const framed = form.intro !== "" || form.outro !== "";
  const hidden = form.voices !== undefined && !framed && lead !== undefined;
  useEffect(() => {
    if (!hidden || lead === undefined) return;
    const now = form.audio;
    if (now.provider === lead.provider && now.model === lead.model && now.voice === lead.voice)
      return;
    update({
      audio: { ...now, provider: lead.provider, model: lead.model, voice: lead.voice },
    });
  }, [hidden, lead, form.audio, update]);
  const framing = form.voices !== undefined;
  // The computer's own voice picked while no speech program answers: how to install one.
  const speechMissing = providers.some(
    (provider) =>
      provider.id === systemVoiceProvider &&
      provider.id === form.audio.provider &&
      provider.readiness.kind === "local" &&
      !provider.readiness.available,
  );
  // The glossary only reaches voices that read IPA; for the others the switch is greyed and the
  // fold's line leaves it out.
  const glossaryReads = usesPronunciationGlossary({
    sources: form.sources,
    audio: { ...form.audio, usePronunciationGlossary: true },
  });
  // The fold's own line says what is not at its default, in words, so a closed fold still
  // tells the reader what it holds.
  const moreState = [
    chunkingWords(form.chunking),
    form.intro ? `intro: ${form.intro}` : undefined,
    form.outro ? `outro: ${form.outro}` : undefined,
    form.narrationPrompt ? "narration preparation on" : undefined,
    form.audio.usePronunciationGlossary && glossaryReads ? "pronunciation glossary on" : undefined,
    form.audio.describeFigures ? "tables and figures described" : undefined,
  ]
    .filter((part) => part !== undefined)
    .join(", ")
    .replace(/^./, (first) => first.toUpperCase());
  // Tables and figures can also be shown on screen, while there is a video to show them in.
  const onScreen =
    form.sources.video === "generate" && form.sources.images !== "off"
      ? {
          value: form.showFigures,
          onChange: (showFigures: boolean) => update({ showFigures }),
        }
      : undefined;

  return (
    <StageRail
      kind="audio"
      name="Narration"
      dim={form.sources.audio === "off"}
      titled={titled}
      source={<SourceSwitch kind="audio" form={form} update={update} />}
    >
      {form.sources.audio === "generate" ? (
        <>
          {hidden ? null : (
            <ServiceGroup
              family="tts"
              label={framing ? "Intro and outro read by" : "Read by"}
              providers={providers}
              provider={form.audio.provider}
              model={form.audio.model}
              serviceField="audio.provider"
              modelField="audio.model"
              serviceProblem={problem("audio")}
              modelProblem={problem("audio.model")}
              leaveOut={{
                label: "Set Narration to Off",
                onLeave: () => update({ sources: { ...form.sources, audio: "off" } }),
              }}
              onService={(provider) =>
                update({ audio: { ...form.audio, provider, model: "", voice: "" } })
              }
              onModel={(model) => update({ audio: { ...form.audio, model } })}
            >
              <VoicePicker
                field="audio.voice"
                label={framing ? "Intro and outro voice" : "Voice"}
                provider={form.audio.provider}
                providers={providers}
                voices={voices}
                language={language}
                value={form.audio.voice}
                problem={problem("audio.voice")}
                onPick={(voice) => update({ audio: { ...form.audio, voice } })}
              />
              {framing ? (
                <p className="sl-fields__wide m-0 text-small text-ink-2">
                  This voice reads only the intro and outro. Each speaker's voice is set under
                  Speakers.
                </p>
              ) : null}
              {speechMissing ? <SpeechInstall /> : null}
            </ServiceGroup>
          )}
          {hidden || framing ? null : <VoiceSample form={form} />}
          <Fold
            remember="play.speakers"
            summary="Speakers"
            state={
              form.voices === undefined
                ? "One voice"
                : `${voiceFormatLabel(form.voices.format)}, ${String(form.voices.speakers.length)} ${form.voices.speakers.length === 1 ? "speaker" : "speakers"}`
            }
          >
            <div className="pt-2 pb-3">
              <SpeakersEditor
                value={form.voices}
                providers={providers}
                voices={voices}
                script={form.sources.article === "provide" ? form.provided.article : undefined}
                problem={problem}
                cast={cast}
                language={language}
                onChange={(next) => update({ voices: next })}
              />
            </div>
          </Fold>
          <Fold remember="play.audio-more" summary="More narration settings" state={moreState}>
            <div className="sl-fields pt-2 pb-3">
              <div className="col-span-full">
                <ChunkingControl
                  {...(rawCounts ? { rawCounts } : {})}
                  value={form.chunking}
                  onPick={(chunking) => {
                    update({ chunking });
                  }}
                />
              </div>
              {advanced}
              <NarrationPreparation
                value={form.narrationPrompt ?? ""}
                prompts={prompts}
                supported={
                  form.audio.provider === "inworld" && form.audio.model === "inworld-tts-2"
                }
                error={problem("narrationPrompt")}
                onChange={(narrationPrompt) => update({ narrationPrompt })}
              />
              <PronunciationGlossary
                value={form.audio.usePronunciationGlossary}
                supported={glossaryReads}
                onChange={(usePronunciationGlossary) =>
                  update({ audio: { ...form.audio, usePronunciationGlossary } })
                }
                shared={{
                  value: form.audio.shareGlossary ?? true,
                  onChange: (shareGlossary) => update({ audio: { ...form.audio, shareGlossary } }),
                }}
              />
              <NarrationAliasesToggle
                value={form.audio.useNarrationAliases}
                onChange={(useNarrationAliases) =>
                  update({ audio: { ...form.audio, useNarrationAliases } })
                }
              />
              <DescribeFiguresToggle
                value={form.audio.describeFigures}
                skipCode={form.audio.skipCode}
                onScreen={onScreen}
                onChange={(next) => update({ audio: { ...form.audio, ...next } })}
              />
            </div>
          </Fold>
        </>
      ) : null}
      {form.sources.audio === "provide" ? (
        <div className="min-w-0">
          <FilePick
            field="provided.audio"
            label="Narration file"
            accept="audio/*"
            uploads={form.provided.audio === undefined ? [] : [form.provided.audio]}
            problem={problem("provided.audio")}
            onPick={(files) => {
              onPickFiles("audio", files);
            }}
            onReattach={
              onReattachFile ? (key, file) => onReattachFile("audio", key, file) : undefined
            }
            onRemove={(key) => {
              onRemoveFile("audio", key);
            }}
          />
          <p className="mt-2 text-small text-ink-2">
            Your file is used as it is; include any intro and outro in it.
          </p>
        </div>
      ) : null}
    </StageRail>
  );
}

export function ImagesRail({
  form,
  providers,
  prompts,
  problem,
  update,
  onPickFiles,
  onRemoveFile,
  onReattachFile,
  rawNumbers,
  startAt,
  more,
  titled,
}: RailProps & {
  readonly rawNumbers?: ComponentProps<typeof ImagePrompts>["rawNumbers"];
  // How many images a newly ticked image prompt starts on.
  readonly startAt?: number;
  // Controls shown under the prompts while images are generated: more images for long videos.
  readonly more?: ReactNode;
}) {
  return (
    <StageRail
      kind="images"
      name="Images"
      dim={form.sources.images === "off"}
      titled={titled}
      source={<SourceSwitch kind="images" form={form} update={update} />}
    >
      {form.sources.images === "generate" ? (
        <>
          <ImageProviderControls
            form={form}
            providers={providers}
            problem={problem}
            update={update}
          />
          <ImagePrompts
            prompts={prompts.filter((prompt) => prompt.kind === "image")}
            {...(rawNumbers ? { rawNumbers } : {})}
            {...(startAt === undefined ? {} : { startAt })}
            picked={form.imagePrompts}
            problem={problem}
            onPick={(imagePrompts) => {
              update({ imagePrompts });
            }}
          />
          <ReferenceRow
            form={form}
            prompts={prompts}
            problem={problem}
            update={update}
            onPickFiles={onPickFiles}
            onRemoveFile={onRemoveFile}
            {...(onReattachFile ? { onReattachFile } : {})}
          />
          {more === undefined ? null : <div className="sl-fields">{more}</div>}
        </>
      ) : null}
      {form.sources.images === "provide" ? (
        <FilePick
          field="provided.images"
          label="Your images, in the order they play"
          accept="image/png,image/jpeg,image/webp"
          multiple
          numbered
          uploads={form.provided.images}
          problem={problem("provided.images")}
          onPick={(files) => {
            onPickFiles("images", files);
          }}
          onReattach={
            onReattachFile ? (key, file) => onReattachFile("images", key, file) : undefined
          }
          onRemove={(key) => {
            onRemoveFile("images", key);
          }}
        />
      ) : null}
    </StageRail>
  );
}

// Who draws the images (and the thumbnail and the shorts' pictures): the image service, its
// model and, for an image agent, its effort.
export function ImageProviderControls({
  form,
  providers,
  problem,
  update,
  label,
}: Pick<RailProps, "form" | "providers" | "problem" | "update"> & {
  // The group's name where it is not the images' own: the thumbnail's "Drawn by".
  readonly label?: string;
}) {
  return (
    <ServiceGroup
      family="image"
      {...(label === undefined ? {} : { label })}
      providers={providers}
      provider={form.images.provider}
      model={form.images.model}
      serviceField="images.provider"
      modelField="images.model"
      serviceProblem={problem("images")}
      modelProblem={problem("images.model")}
      leaveOut={
        form.sources.images === "generate"
          ? {
              label: "Set Images to None",
              onLeave: () => update({ sources: { ...form.sources, images: "off", video: "off" } }),
            }
          : undefined
      }
      onService={(provider) => update({ images: { provider, model: "" } })}
      onModel={(model) => update({ images: { ...form.images, model } })}
    >
      <ThinkingPicker
        field="images.thinking"
        label="Effort"
        tip="play.images.effort"
        choice={form.images}
        problem={problem("images.thinking")}
        onChange={(images) => update({ images })}
      />
    </ServiceGroup>
  );
}

// The Images rail's establishing image: Off, from an image prompt, or an uploaded file.
function ReferenceRow({
  form,
  prompts,
  problem,
  update,
  onPickFiles,
  onRemoveFile,
  onReattachFile,
}: Pick<
  RailProps,
  "form" | "prompts" | "problem" | "update" | "onPickFiles" | "onRemoveFile" | "onReattachFile"
>) {
  return (
    <ReferenceImage
      value={form.reference ?? referenceOff}
      prompts={prompts}
      problem={problem}
      thumbnailOn={
        form.sources.thumbnail === "from_prompt" || form.sources.thumbnail === "prompt_by_llm"
      }
      onChange={(reference) => update({ reference })}
      upload={
        <FilePick
          field="provided.reference"
          label="Establishing image file"
          accept="image/png,image/jpeg"
          uploads={form.provided.reference === undefined ? [] : [form.provided.reference]}
          problem={problem("provided.reference")}
          onPick={(files) => {
            onPickFiles("reference", files);
          }}
          onReattach={
            onReattachFile ? (key, file) => onReattachFile("reference", key, file) : undefined
          }
          onRemove={(key) => {
            onRemoveFile("reference", key);
          }}
        />
      }
    />
  );
}
