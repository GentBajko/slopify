import { ChunkingControl } from "@/play/chunking";
import { ImagePrompts } from "@/play/image-prompts";
import { ModelPicker, OptionPicker, ProviderPicker } from "@/play/pickers";
import { FilePick } from "@/play/provided";
import type { RailProps } from "@/play/rail-frame";
import { railBeneath, railControls, SourceSwitch, StageRail } from "@/play/rail-frame";

// The two rails that carry a provider, and with it everything a provider decides: the
// voice and the chunking of the narration, and the model and the ticked
// prompts of the images. Both fall back to a file pick when their stage is
// set to Provide.

export function AudioRail({
  form,
  providers,
  voices,
  problem,
  update,
  onPickFiles,
  onRemoveFile,
}: RailProps) {
  const mine = voices.filter((voice) => voice.provider === form.audio.provider);

  return (
    <StageRail kind="audio" name="Audio" dim={form.sources.audio === "off"}>
      <SourceSwitch kind="audio" form={form} update={update} />
      <div className={railControls}>
        {form.sources.audio === "generate" ? (
          <>
            <ProviderPicker
              label="TTS"
              inline
              family="tts"
              providers={providers}
              value={form.audio.provider}
              problem={problem("audio")}
              onPick={(provider) => {
                update({
                  audio: { provider, model: "", voice: "" },
                });
              }}
            />
            <ModelPicker
              label="TTS model"
              inline
              provider={form.audio.provider}
              value={form.audio.model}
              problem={undefined}
              onPick={(model) => update({ audio: { ...form.audio, model } })}
            />
            <OptionPicker
              label="Voice"
              inline
              value={form.audio.voice}
              placeholder={mine.length === 0 ? "No voices. Add one in Settings." : "Pick a voice"}
              options={mine.map((voice) => ({ value: voice.voiceId, label: voice.name }))}
              problem={problem("audio.voice")}
              onPick={(voice) => {
                update({ audio: { ...form.audio, voice } });
              }}
            />
            <ChunkingControl
              value={form.chunking}
              onPick={(chunking) => {
                update({ chunking });
              }}
            />
          </>
        ) : null}
      </div>
      {form.sources.audio === "provide" ? (
        <div className={railBeneath}>
          <FilePick
            label="Narration file"
            accept="audio/*"
            uploads={form.provided.audio === undefined ? [] : [form.provided.audio]}
            problem={problem("provided.audio")}
            onPick={(files) => {
              onPickFiles("audio", files);
            }}
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
}: RailProps) {
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
            label="Slideshow images"
            accept="image/png,image/jpeg,image/webp"
            multiple
            numbered
            uploads={form.provided.images}
            problem={problem("provided.images")}
            onPick={(files) => {
              onPickFiles("images", files);
            }}
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
        label="Provider"
        inline
        family="image"
        providers={providers}
        value={form.images.provider}
        problem={problem("images")}
        onPick={(provider) => update({ images: { provider, model: "" } })}
      />
      <ModelPicker
        label="Model"
        inline
        provider={form.images.provider}
        value={form.images.model}
        problem={undefined}
        onPick={(model) => update({ images: { ...form.images, model } })}
      />
    </>
  );
}
