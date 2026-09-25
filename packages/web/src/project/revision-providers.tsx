import {
  usesNarrationPreparation,
  usesPronunciationGlossary,
} from "@app/slices/admission/rules.js";
import type { RevisionEdit } from "@app/slices/revisions/model.js";
import type { ProviderStatus, Voice } from "@/api";
import { ChunkingControl } from "@/play/chunking";
import { ModelPicker, OptionPicker, ProviderPicker } from "@/play/pickers";
import { PronunciationGlossary } from "@/play/pronunciation-glossary";
import { ThinkingPicker } from "@/play/thinking";

export function RevisionProviders({
  edit,
  providers,
  voices,
  onChange,
}: {
  readonly edit: RevisionEdit;
  readonly providers: readonly ProviderStatus[];
  readonly voices: readonly Voice[];
  readonly onChange: (edit: RevisionEdit) => void;
}): import("react").ReactElement {
  const { config } = edit;
  const llm = config.llm ?? { provider: "", model: "" };
  const audio = config.audio ?? { provider: "", model: "", voice: "" };
  const images = config.images ?? { provider: "", model: "" };
  const textNeeded =
    usesNarrationPreparation(config) ||
    config.sources.research === "generate" ||
    config.sources.article === "generate" ||
    config.sources.thumbnail === "prompt_by_llm" ||
    (config.sources.audio === "generate" &&
      (config.intro?.mode === "llm" || config.outro?.mode === "llm"));
  const imagesNeeded =
    config.sources.images === "generate" ||
    config.sources.thumbnail === "from_prompt" ||
    config.sources.thumbnail === "prompt_by_llm";
  const voiceOptions = voices
    .filter((voice) => voice.provider === audio.provider)
    .map((voice) => ({ value: voice.voiceId, label: voice.name }));
  return (
    <section aria-label="Generation providers" className="grid min-w-0 gap-3 sm:grid-cols-2">
      {textNeeded ? (
        <>
          <ProviderPicker
            label="Text provider"
            family="llm"
            providers={providers}
            value={llm.provider}
            problem={undefined}
            onPick={(provider) =>
              onChange({ ...edit, config: { ...config, llm: { provider, model: "" } } })
            }
          />
          <ModelPicker
            label="Text model"
            provider={llm.provider}
            value={llm.model}
            problem={undefined}
            onPick={(model) => onChange({ ...edit, config: { ...config, llm: { ...llm, model } } })}
          />
          <ThinkingPicker
            choice={llm}
            onChange={(choice) => onChange({ ...edit, config: { ...config, llm: choice } })}
          />
        </>
      ) : null}
      {config.sources.audio === "generate" ? (
        <>
          <ProviderPicker
            label="Narration provider"
            family="tts"
            providers={providers}
            value={audio.provider}
            problem={undefined}
            onPick={(provider) =>
              onChange({
                ...edit,
                config: { ...config, audio: { ...audio, provider, model: "", voice: "" } },
              })
            }
          />
          <ModelPicker
            label="Narration model"
            provider={audio.provider}
            value={audio.model}
            problem={undefined}
            onPick={(model) =>
              onChange({ ...edit, config: { ...config, audio: { ...audio, model } } })
            }
          />
          <OptionPicker
            label="Narration voice"
            value={audio.voice}
            problem={undefined}
            placeholder="Choose a saved voice"
            options={
              audio.voice !== "" && !voiceOptions.some((voice) => voice.value === audio.voice)
                ? [{ value: audio.voice, label: `${audio.voice} (saved voice)` }, ...voiceOptions]
                : voiceOptions
            }
            onPick={(voice) =>
              onChange({ ...edit, config: { ...config, audio: { ...audio, voice } } })
            }
          />
          <ChunkingControl
            value={config.chunking ?? { mode: "whole" }}
            onPick={(chunking) => onChange({ ...edit, config: { ...config, chunking } })}
          />
          <PronunciationGlossary
            value={audio.usePronunciationGlossary}
            supported={usesPronunciationGlossary({
              sources: config.sources,
              audio: { ...audio, usePronunciationGlossary: true },
            })}
            onChange={(usePronunciationGlossary) =>
              onChange({
                ...edit,
                config: { ...config, audio: { ...audio, usePronunciationGlossary } },
              })
            }
          />
        </>
      ) : null}
      {imagesNeeded ? (
        <>
          <ProviderPicker
            label="Image provider"
            family="image"
            providers={providers}
            value={images.provider}
            problem={undefined}
            onPick={(provider) =>
              onChange({ ...edit, config: { ...config, images: { provider, model: "" } } })
            }
          />
          <ModelPicker
            label="Image model"
            provider={images.provider}
            value={images.model}
            problem={undefined}
            onPick={(model) =>
              onChange({ ...edit, config: { ...config, images: { ...images, model } } })
            }
          />
        </>
      ) : null}
    </section>
  );
}
