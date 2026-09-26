import {
  usesNarrationPreparation,
  usesPronunciationGlossary,
} from "@app/slices/admission/rules.js";
import type { RevisionEdit } from "@app/slices/revisions/model.js";
import { useState } from "react";
import { type ProviderStatus, readSharedPronunciations, type Voice } from "@/api";
import { useApp } from "@/app-context";
import { Button } from "@/components/ui/button";
import { ChunkingControl } from "@/play/chunking";
import { ModelPicker, OptionPicker, ProviderPicker } from "@/play/pickers";
import { PronunciationGlossary } from "@/play/pronunciation-glossary";
import { ThinkingPicker } from "@/play/thinking";

// "Also use pronunciations from my other projects" in Edit project: turning it on copies the
// other projects' glossaries into this one, and the button copies them again, so a project
// only picks up newer pronunciations when asked (and rebuilds the narration they change).
function useSharedGlossary(
  projectId: string,
  edit: RevisionEdit,
  onChange: (edit: RevisionEdit) => void,
) {
  const { api } = useApp();
  const [state, setState] = useState<{ busy: boolean; error?: string; projects?: number }>({
    busy: false,
  });
  const { config } = edit;
  const audio = config.audio;
  const copy = async (): Promise<void> => {
    if (audio === undefined) return;
    setState({ busy: true });
    try {
      const shared = await readSharedPronunciations(api, projectId);
      const { sharedGlossary: _old, ...rest } = config;
      onChange({
        ...edit,
        config: {
          ...rest,
          audio: { ...audio, shareGlossary: true },
          ...(shared.entries.length === 0 ? {} : { sharedGlossary: shared.entries }),
        },
      });
      setState({ busy: false, projects: shared.projects });
    } catch (error) {
      setState({ busy: false, error: error instanceof Error ? error.message : String(error) });
    }
  };
  const off = (): void => {
    if (audio === undefined) return;
    const { sharedGlossary: _old, ...rest } = config;
    onChange({ ...edit, config: { ...rest, audio: { ...audio, shareGlossary: false } } });
  };
  const count = config.sharedGlossary?.length ?? 0;
  const note =
    audio?.shareGlossary === true ? (
      <p className="flex flex-wrap items-center gap-2 text-label text-ink2">
        {state.error !== undefined
          ? `Couldn't read your other projects' pronunciations: ${state.error}`
          : count === 0
            ? "No pronunciations from other projects are copied yet."
            : `${String(count)} ${count === 1 ? "term" : "terms"} copied from ${
                state.projects === undefined
                  ? "your other projects"
                  : `${String(state.projects)} other ${state.projects === 1 ? "project" : "projects"}`
              }.`}
        <Button type="button" variant="ghost" disabled={state.busy} onClick={() => void copy()}>
          {state.busy ? "Copying…" : "Update from other projects"}
        </Button>
      </p>
    ) : undefined;
  return {
    value: audio?.shareGlossary === true,
    onChange: (on: boolean) => {
      if (on) void copy();
      else off();
    },
    note,
  };
}

export function RevisionProviders({
  projectId,
  edit,
  providers,
  voices,
  onChange,
}: {
  readonly projectId: string;
  readonly edit: RevisionEdit;
  readonly providers: readonly ProviderStatus[];
  readonly voices: readonly Voice[];
  readonly onChange: (edit: RevisionEdit) => void;
}): import("react").ReactElement {
  const { config } = edit;
  const llm = config.llm ?? { provider: "", model: "" };
  const audio = config.audio ?? { provider: "", model: "", voice: "" };
  const shared = useSharedGlossary(projectId, edit, onChange);
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
            shared={shared}
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
