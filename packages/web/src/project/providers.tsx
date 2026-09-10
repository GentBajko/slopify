import type {
  ProjectSummary,
  ProviderChoice,
  RunConfig,
  VoiceChoice,
} from "@app/slices/admission/model.js";
import type { ProviderStatus } from "@app/slices/settings/model.js";
import { useQuery } from "@tanstack/react-query";
import type { Dispatch, SetStateAction } from "react";
import { useApp } from "@/app-context";
import { Rail } from "@/components/rail";
import { Button } from "@/components/ui/button";
import { ModelPicker, OptionPicker, ProviderPicker } from "@/play/pickers";
import { voicesQuery } from "@/queries";
import type { ProviderChanges } from "./api";
import type { ProjectActions } from "./use-actions";

// Edits are local until Save succeeds. Resume is deliberately a separate action in
// the project header, so a provider change cannot unexpectedly start paid requests.
export function ProjectProviders({
  project,
  providers,
  actions,
  inFlight,
  edits,
  setEdits,
}: {
  readonly project: ProjectSummary;
  readonly providers: readonly ProviderStatus[];
  readonly actions: ProjectActions;
  readonly inFlight: boolean;
  readonly edits: ProviderChanges;
  readonly setEdits: Dispatch<SetStateAction<ProviderChanges>>;
}) {
  const { api } = useApp();
  const voices = useQuery(voicesQuery(api));
  const { config } = project;
  const llm = edits.llm ?? config.llm ?? { provider: "", model: "" };
  const audio = edits.audio ?? config.audio ?? { provider: "", model: "", voice: "" };
  const images = edits.images ?? config.images ?? { provider: "", model: "" };
  const showLlm =
    config.sources.article === "generate" ||
    config.sources.thumbnail === "prompt_by_llm" ||
    (config.sources.audio === "generate" &&
      (config.intro?.mode === "llm" || config.outro?.mode === "llm"));
  const showAudio = config.sources.audio === "generate";
  const showImages =
    config.sources.images === "generate" ||
    config.sources.thumbnail === "from_prompt" ||
    config.sources.thumbnail === "prompt_by_llm";
  if (!showLlm && !showAudio && !showImages) return null;
  const editable = (project.status === "paused" || project.status === "failed") && !inFlight;
  const choices = changedProviderChoices(config, edits);
  const dirty = Object.keys(choices).length > 0;
  const valid = (choice: ProviderChoice): boolean =>
    choice.provider !== "" &&
    choice.model.trim() !== "" &&
    providers.some(
      (provider) =>
        provider.id === choice.provider &&
        (provider.readiness.kind === "keyed"
          ? provider.readiness.hasKey
          : provider.readiness.installed),
    );
  const complete =
    (!choices.llm || valid(choices.llm)) &&
    (!choices.images || valid(choices.images)) &&
    (!choices.audio ||
      (valid(choices.audio) &&
        (voices.data?.voices ?? []).some(
          (voice) =>
            voice.provider === choices.audio?.provider && voice.voiceId === choices.audio.voice,
        )));

  return (
    <Rail className="block py-3" data-tour="project-providers">
      <details open>
        <summary className="cursor-pointer text-row font-semibold">Run providers</summary>
        <p className="mt-2 text-small text-ink2">
          {editable
            ? "Save your choices, then press Resume when ready. Finished outputs stay as they are. Changing the voice or TTS model restarts unfinished narration to keep one voice throughout."
            : inFlight && project.status === "paused"
              ? "Pausing: waiting for active requests to stop before providers can be changed."
              : project.status === "done" || project.status === "canceled"
                ? "These are the saved providers for this run. Start a new run to choose different providers."
                : "Pause the run to change providers, models or voice. These controls are also available after a failure."}
        </p>
        <fieldset
          disabled={!editable || actions.pending}
          className="mt-3 flex min-w-0 flex-col gap-3 disabled:opacity-60"
        >
          {showLlm ? (
            <ChoiceRow
              label="Text"
              choice={llm}
              family="llm"
              providers={providers}
              onChange={(value) => setEdits((current) => ({ ...current, llm: value }))}
            />
          ) : null}
          {showAudio ? (
            <div className="flex flex-wrap items-center gap-3">
              <ChoiceRow
                label="TTS"
                choice={audio}
                family="tts"
                providers={providers}
                onChange={(value) =>
                  setEdits((current) => ({
                    ...current,
                    audio: {
                      ...value,
                      voice: value.provider === audio.provider ? audio.voice : "",
                    },
                  }))
                }
              />
              <OptionPicker
                label="Narration voice"
                inline
                value={audio.voice}
                placeholder="Pick a voice"
                problem={undefined}
                options={(voices.data?.voices ?? [])
                  .filter((voice) => voice.provider === audio.provider)
                  .map((voice) => ({ value: voice.voiceId, label: voice.name }))}
                onPick={(voice) =>
                  setEdits((current) => ({ ...current, audio: { ...audio, voice } }))
                }
              />
            </div>
          ) : null}
          {showImages ? (
            <ChoiceRow
              label="Image"
              choice={images}
              family="image"
              providers={providers}
              onChange={(value) => setEdits((current) => ({ ...current, images: value }))}
            />
          ) : null}
          <div>
            <Button
              disabled={!editable || actions.pending || !complete || !dirty}
              onClick={() => actions.run({ kind: "providers", choices }, () => setEdits({}))}
            >
              Save providers
            </Button>
          </div>
        </fieldset>
        {dirty ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <p className="text-small text-ink2">
              Save or discard provider changes before resuming.
            </p>
            <Button disabled={actions.pending} onClick={() => setEdits({})}>
              Discard provider changes
            </Button>
          </div>
        ) : null}
        {voices.error ? <p className="mt-2 text-small text-red">{voices.error.message}</p> : null}
      </details>
    </Rail>
  );
}

export function changedProviderChoices(config: RunConfig, edits: ProviderChanges): ProviderChanges {
  return {
    ...(edits.llm && !same(edits.llm, config.llm) ? { llm: edits.llm } : {}),
    ...(edits.audio && !same(edits.audio, config.audio) ? { audio: edits.audio } : {}),
    ...(edits.images && !same(edits.images, config.images) ? { images: edits.images } : {}),
  };
}

function ChoiceRow({
  label,
  choice,
  family,
  providers,
  onChange,
}: {
  readonly label: string;
  readonly choice: ProviderChoice;
  readonly family: ProviderStatus["family"];
  readonly providers: readonly ProviderStatus[];
  readonly onChange: (choice: ProviderChoice) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <ProviderPicker
        label={`${label} provider`}
        inline
        family={family}
        providers={providers}
        value={choice.provider}
        problem={undefined}
        onPick={(provider) => onChange({ provider, model: "" })}
      />
      <ModelPicker
        label={`${label} model`}
        inline
        provider={choice.provider}
        value={choice.model}
        problem={undefined}
        onPick={(model) => onChange({ ...choice, model })}
      />
    </div>
  );
}

function same(
  left: ProviderChoice | VoiceChoice,
  right: ProviderChoice | VoiceChoice | undefined,
): boolean {
  return (
    left.provider === right?.provider &&
    left.model === right.model &&
    ("voice" in left ? left.voice : undefined) ===
      (right && "voice" in right ? right.voice : undefined)
  );
}
