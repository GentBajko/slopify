import { usesPronunciationGlossary } from "@app/slices/admission/rules.js";
import type { ComponentProps, ReactNode } from "react";
import { ChunkingControl } from "@/play/chunking";
import { ImagePrompts } from "@/play/image-prompts";
import { ModelPicker, OptionPicker, ProviderPicker } from "@/play/pickers";
import { FilePick } from "@/play/provided";
import type { RailProps } from "@/play/rail-frame";
import { railBeneath, railControls, SourceSwitch, StageRail } from "@/play/rail-frame";
import { NarrationPreparation } from "./narration-preparation";
import { PronunciationGlossary } from "./pronunciation-glossary";

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
}: RailProps & {
  readonly rawCounts?: ComponentProps<typeof ChunkingControl>["rawCounts"];
  // Intro, outro and the links that go with them, drawn inside the Advanced disclosure.
  readonly advanced?: ReactNode;
}) {
  const mine = voices.filter((voice) => voice.provider === form.audio.provider);
  // The disclosure's own line says what is not at its default, so a closed Advanced still
  // tells the reader what it holds.
  const advancedSummary = [
    form.chunking.mode,
    form.intro ? `intro ${form.intro}` : undefined,
    form.outro ? `outro ${form.outro}` : undefined,
    form.narrationPrompt ? "preparation on" : undefined,
    form.audio.usePronunciationGlossary ? "glossary on" : undefined,
  ]
    .filter((part) => part !== undefined)
    .join(" · ");

  return (
    <StageRail kind="audio" name="Audio" dim={form.sources.audio === "off"}>
      <SourceSwitch kind="audio" form={form} update={update} />
      <div className={railControls}>
        {form.sources.audio === "generate" ? (
          <>
            <ProviderPicker
              field="audio.provider"
              label="TTS"
              family="tts"
              providers={providers}
              value={form.audio.provider}
              problem={problem("audio")}
              onPick={(provider) => {
                update({
                  audio: { ...form.audio, provider, model: "", voice: "" },
                });
              }}
            />
            <ModelPicker
              field="audio.model"
              label="TTS model"
              provider={form.audio.provider}
              value={form.audio.model}
              problem={problem("audio.model")}
              onPick={(model) => update({ audio: { ...form.audio, model } })}
            />
            <OptionPicker
              field="audio.voice"
              label="Voice"
              value={form.audio.voice}
              placeholder={mine.length === 0 ? "No voices. Add one in Settings." : "Pick a voice"}
              options={mine.map((voice) => ({ value: voice.voiceId, label: voice.name }))}
              problem={problem("audio.voice")}
              onPick={(voice) => {
                update({ audio: { ...form.audio, voice } });
              }}
            />
            <details className="col-span-full rounded-control border border-line px-3">
              <summary className="flex min-h-9 cursor-pointer items-center text-small text-ink2">
                Audio Advanced · {advancedSummary}
              </summary>
              <div className="grid grid-cols-1 gap-4 pt-2 pb-3 min-[700px]:grid-cols-2">
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
                  supported={usesPronunciationGlossary({
                    sources: form.sources,
                    audio: { ...form.audio, usePronunciationGlossary: true },
                  })}
                  onChange={(usePronunciationGlossary) =>
                    update({ audio: { ...form.audio, usePronunciationGlossary } })
                  }
                  shared={{
                    value: form.audio.shareGlossary ?? true,
                    onChange: (shareGlossary) =>
                      update({ audio: { ...form.audio, shareGlossary } }),
                  }}
                />
              </div>
            </details>
          </>
        ) : null}
      </div>
      {form.sources.audio === "provide" ? (
        <div className={railBeneath}>
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
          <p className="mt-2 text-small text-ink2">
            Uploaded narration is used as-is; include any intro and outro in that file.
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
}: RailProps & { readonly rawNumbers?: ComponentProps<typeof ImagePrompts>["rawNumbers"] }) {
  return (
    <StageRail kind="images" name="Images" dim={form.sources.images === "off"}>
      <SourceSwitch kind="images" form={form} update={update} />
      <div className={railControls}>
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
              picked={form.imagePrompts}
              problem={problem}
              onPick={(imagePrompts) => {
                update({ imagePrompts });
              }}
            />
          </>
        ) : null}
      </div>
      {form.sources.images === "provide" ? (
        <div className={railBeneath}>
          <FilePick
            field="provided.images"
            label="Slideshow images"
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
        </div>
      ) : null}
    </StageRail>
  );
}

export function ImageProviderControls({
  form,
  providers,
  problem,
  update,
}: Pick<RailProps, "form" | "providers" | "problem" | "update">) {
  return (
    <>
      <ProviderPicker
        field="images.provider"
        label="Provider"
        family="image"
        providers={providers}
        value={form.images.provider}
        problem={problem("images")}
        onPick={(provider) => update({ images: { provider, model: "" } })}
      />
      <ModelPicker
        field="images.model"
        label="Model"
        provider={form.images.provider}
        value={form.images.model}
        problem={problem("images.model")}
        onPick={(model) => update({ images: { ...form.images, model } })}
      />
    </>
  );
}
