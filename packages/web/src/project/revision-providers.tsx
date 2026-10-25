import {
  usesNarrationPreparation,
  usesPronunciationGlossary,
} from "@app/slices/admission/rules.js";
import type { RevisionEdit } from "@app/slices/revisions/model.js";
import { usesVoices } from "@app/slices/voices/model.js";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  type ProviderStatus,
  readNarrationAliases,
  readSharedPronunciations,
  type Voice,
} from "@/api";
import { useApp } from "@/app-context";
import { channelQuery, defaultChannelId } from "@/channels/api";
import { Button } from "@/components/kit/button";
import { ChunkingControl } from "@/play/chunking";
import { DescribeFiguresToggle } from "@/play/describe-figures";
import { NarrationAliasesToggle } from "@/play/narration-aliases";
import { OptionPicker } from "@/play/pickers";
import { PronunciationGlossary } from "@/play/pronunciation-glossary";
import { ServiceGroup } from "@/play/service-group";
import { ThinkingPicker } from "@/play/thinking";
import { SpeakersEditor } from "@/voices/speakers-editor";
import { changeSource } from "./revision-form-state.js";

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
      <p className="flex flex-wrap items-center gap-2 text-label text-ink-2">
        {state.error !== undefined
          ? `Couldn't read your other projects' pronunciations: ${state.error}`
          : count === 0
            ? "No pronunciations from other projects are copied yet."
            : `${String(count)} ${count === 1 ? "term" : "terms"} copied from ${
                state.projects === undefined
                  ? "your other projects"
                  : `${String(state.projects)} other ${state.projects === 1 ? "project" : "projects"}`
              }.`}
        <Button type="button" variant="quiet" disabled={state.busy} onClick={() => void copy()}>
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

// "Use narration aliases" in Edit project: turning it on copies Library → Narration aliases into this
// project, and the button copies them again, so a Library edit only reaches a project that
// asks for it (and rebuilds only the narration the changed aliases touch).
function useAliases(edit: RevisionEdit, onChange: (edit: RevisionEdit) => void) {
  const { api } = useApp();
  const [state, setState] = useState<{ busy: boolean; error?: string }>({ busy: false });
  const { config } = edit;
  const audio = config.audio;
  const copy = async (): Promise<void> => {
    if (audio === undefined) return;
    setState({ busy: true });
    try {
      const { aliases } = await readNarrationAliases(api);
      const { narrationAliases: _old, ...rest } = config;
      onChange({
        ...edit,
        config: {
          ...rest,
          audio: { ...audio, useNarrationAliases: true },
          ...(aliases.length === 0 ? {} : { narrationAliases: aliases }),
        },
      });
      setState({ busy: false });
    } catch (error) {
      setState({ busy: false, error: error instanceof Error ? error.message : String(error) });
    }
  };
  const count = config.narrationAliases?.length ?? 0;
  return {
    value: audio?.useNarrationAliases === true,
    onChange: (on: boolean) => {
      if (audio === undefined) return;
      if (on) void copy();
      else {
        const { narrationAliases: _old, ...rest } = config;
        onChange({ ...edit, config: { ...rest, audio: { ...audio, useNarrationAliases: false } } });
      }
    },
    note:
      audio?.useNarrationAliases === true ? (
        <p className="flex flex-wrap items-center gap-2 text-label text-ink-2">
          {state.error !== undefined
            ? `Couldn't read Library → Narration aliases: ${state.error} Try Update from Library again.`
            : count === 0
              ? "No aliases are copied yet. Add some in Library → Narration aliases."
              : `${String(count)} ${count === 1 ? "alias" : "aliases"} copied from Library → Narration aliases.`}
          <Button type="button" variant="quiet" disabled={state.busy} onClick={() => void copy()}>
            {state.busy ? "Copying…" : "Update from Library"}
          </Button>
        </p>
      ) : undefined,
  };
}

// Who makes each stage, in the settings section of that stage, in Create's words: the article
// is "Written by" a service and model, the narration is read by a voice service, its model
// and voice, and the images come from an image service.
export function RevisionProviders({
  part,
  projectId,
  edit,
  providers,
  voices,
  onChange,
}: {
  readonly part: "text" | "voice" | "images";
  readonly projectId: string;
  readonly edit: RevisionEdit;
  readonly providers: readonly ProviderStatus[];
  readonly voices: readonly Voice[];
  readonly onChange: (edit: RevisionEdit) => void;
}): import("react").ReactElement | null {
  const { config } = edit;
  const llm = config.llm ?? { provider: "", model: "" };
  const audio = config.audio ?? { provider: "", model: "", voice: "" };
  const shared = useSharedGlossary(projectId, edit, onChange);
  const aliases = useAliases(edit, onChange);
  const { api } = useApp();
  const cast = useQuery(channelQuery(api, config.channelId ?? defaultChannelId));
  const images = config.images ?? { provider: "", model: "" };
  const textNeeded =
    usesNarrationPreparation(config) ||
    (config.sources.audio === "generate" && config.audio?.describeFigures === true) ||
    config.sources.research === "generate" ||
    config.sources.article === "generate" ||
    config.sources.thumbnail === "prompt_by_llm" ||
    (usesVoices(config) &&
      (config.voices?.source === "attribute" || config.voices?.source === "adapt")) ||
    (config.sources.audio === "generate" &&
      (config.intro?.mode === "llm" || config.outro?.mode === "llm"));
  const imagesNeeded =
    config.sources.images === "generate" ||
    config.sources.thumbnail === "from_prompt" ||
    config.sources.thumbnail === "prompt_by_llm";
  const voiceOptions = voices
    .filter((voice) => voice.provider === audio.provider)
    .map((voice) => ({ value: voice.voiceId, label: voice.name }));
  if (part === "text" && !textNeeded) return null;
  if (part === "voice" && config.sources.audio !== "generate") return null;
  if (part === "images" && !imagesNeeded) return null;
  const title = part === "text" ? "Written by" : part === "voice" ? "Read by" : "Images by";
  return (
    <section aria-label={title} className="grid min-w-0 gap-3 sm:grid-cols-2">
      {part === "text" ? (
        <ServiceGroup
          family="llm"
          providers={providers}
          provider={llm.provider}
          model={llm.model}
          serviceField="llm.provider"
          modelField="llm.model"
          serviceProblem={undefined}
          modelProblem={undefined}
          onService={(provider) =>
            onChange({ ...edit, config: { ...config, llm: { provider, model: "" } } })
          }
          onModel={(model) => onChange({ ...edit, config: { ...config, llm: { ...llm, model } } })}
        >
          <ThinkingPicker
            choice={llm}
            onChange={(choice) => onChange({ ...edit, config: { ...config, llm: choice } })}
          />
        </ServiceGroup>
      ) : null}
      {part === "voice" ? (
        <>
          {/* With several speakers, each has its own voice (Speakers), and this one reads only
              the intro and outro; with neither it reads nothing, so it isn't offered. */}
          {config.voices !== undefined &&
          config.intro === undefined &&
          config.outro === undefined ? null : (
            <ServiceGroup
              family="tts"
              label={config.voices === undefined ? "Read by" : "Intro and outro read by"}
              providers={providers}
              provider={audio.provider}
              model={audio.model}
              serviceField="audio.provider"
              modelField="audio.model"
              serviceProblem={undefined}
              modelProblem={undefined}
              leaveOut={{
                label: "Set Narration to Off",
                onLeave: () => onChange(changeSource(edit, "audio", "off")),
              }}
              onService={(provider) =>
                onChange({
                  ...edit,
                  config: { ...config, audio: { ...audio, provider, model: "", voice: "" } },
                })
              }
              onModel={(model) =>
                onChange({ ...edit, config: { ...config, audio: { ...audio, model } } })
              }
            >
              <OptionPicker
                label={config.voices === undefined ? "Voice" : "Intro and outro voice"}
                value={audio.voice}
                problem={undefined}
                placeholder="Choose a saved voice"
                options={
                  audio.voice !== "" && !voiceOptions.some((voice) => voice.value === audio.voice)
                    ? [
                        { value: audio.voice, label: `${audio.voice} (saved voice)` },
                        ...voiceOptions,
                      ]
                    : voiceOptions
                }
                onPick={(voice) =>
                  onChange({ ...edit, config: { ...config, audio: { ...audio, voice } } })
                }
              />
              {config.voices === undefined ? null : (
                <p className="sl-fields__wide m-0 text-small text-ink-2">
                  This voice reads only the intro and outro. Each speaker's voice is set under
                  Speakers.
                </p>
              )}
            </ServiceGroup>
          )}
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
          <NarrationAliasesToggle {...aliases} />
          <DescribeFiguresToggle
            tip="project.edit.describe-figures"
            value={audio.describeFigures}
            skipCode={audio.skipCode}
            onChange={({ describeFigures, skipCode }) => {
              // Stored only when on, so turning it off again plans what the project had.
              const { describeFigures: _on, skipCode: _code, ...rest } = audio;
              onChange({
                ...edit,
                config: {
                  ...config,
                  audio: {
                    ...rest,
                    ...(describeFigures ? { describeFigures } : {}),
                    ...(describeFigures && skipCode ? { skipCode } : {}),
                  },
                },
              });
            }}
          />
          <section aria-label="Speakers" className="col-span-full border-t border-line pt-3">
            <h3 className="mb-2 text-small font-semibold">Speakers</h3>
            <SpeakersEditor
              value={config.voices}
              // The project's channel's cast, for "Add from the cast", and its language, which
              // filters each speaker's voices.
              cast={cast.data?.cast ?? []}
              language={config.language}
              providers={providers}
              voices={voices}
              script={edit.content.articleMarkdown ?? undefined}
              onChange={(next) => {
                const { voices: _old, ...rest } = config;
                onChange({
                  ...edit,
                  config: next === undefined ? rest : { ...rest, voices: next },
                });
              }}
            />
          </section>
        </>
      ) : null}
      {part === "images" ? (
        <ServiceGroup
          family="image"
          providers={providers}
          provider={images.provider}
          model={images.model}
          serviceField="images.provider"
          modelField="images.model"
          serviceProblem={undefined}
          modelProblem={undefined}
          leaveOut={
            config.sources.images === "generate"
              ? {
                  label: "Set Images to None",
                  onLeave: () => onChange(changeSource(edit, "images", "off")),
                }
              : undefined
          }
          onService={(provider) =>
            onChange({ ...edit, config: { ...config, images: { provider, model: "" } } })
          }
          onModel={(model) =>
            onChange({ ...edit, config: { ...config, images: { ...images, model } } })
          }
        >
          <ThinkingPicker
            field="images.thinking"
            label="Effort"
            tip="play.images.effort"
            choice={images}
            onChange={(choice) => onChange({ ...edit, config: { ...config, images: choice } })}
          />
        </ServiceGroup>
      ) : null}
    </section>
  );
}
