import { readinessIsUsable } from "@app/kernel/ports/model.js";
import {
  geminiVoices,
  type ProviderId,
  type ProviderStatus,
  systemVoiceProvider,
  type Voice,
} from "@app/slices/settings/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Volume2Icon } from "lucide-react";
import { type ReactElement, type ReactNode, useEffect, useState } from "react";
import type { VoiceField, VoiceRefusal } from "@/api";
import { addVoice, removeVoice, setVoiceImitatesRealPerson, speakAudition } from "@/api";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { ConfirmDialog } from "@/components/kit/dialog";
import { Field, HelpLine, Input, Select } from "@/components/kit/field";
import { helpScope } from "@/components/kit/info-tip";
import { ButtonLink, TextLink } from "@/components/kit/link";
import { List, ListRow } from "@/components/kit/list-row";
import { SectionHead } from "@/components/kit/section-head";
import { Status } from "@/components/kit/status";
import { Switch } from "@/components/kit/switch";
import { articleOf } from "@/components/provider-keys";
import { SystemVoicePicker, sampleLine, useSystemVoices } from "@/components/system-voices";
import { VoiceLanguagesCell, VoiceLanguagesPicker } from "@/language/voice-languages-cell";
import { listProviderModels } from "@/lib/models";
import { keys, providersQuery, voicesQuery } from "@/queries";
import { backSearch, type SettingsBack } from "@/routes/settings-back";

// OpenAI speaks a fixed set of voices by name, so they are picked rather than typed; a voice
// cloned in the OpenAI account (`voice_…`) is still pasted as an ID.
const openAiVoices = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "nova",
  "onyx",
  "sage",
  "shimmer",
  "verse",
] as const;
const pasteId = "__paste__";

// Where a service's own voice IDs are listed, for the services whose voices are typed.
const voiceLibraries: Partial<
  Record<ProviderId, { readonly label: string; readonly url: string }>
> = {
  elevenlabs: { label: "ElevenLabs voice library", url: "https://elevenlabs.io/app/voice-library" },
  cartesia: { label: "Cartesia voice library", url: "https://play.cartesia.ai/voices" },
};

function usable(provider: ProviderStatus | undefined): boolean {
  return provider !== undefined && readinessIsUsable(provider.readiness);
}

// What a voice service that cannot speak lacks, in the one list of states: a key, or for the
// computer's own voice its speech program.
function missingWord(provider: ProviderStatus): "No key" | "Not installed" {
  return provider.readiness.kind === "local" ? "Not installed" : "No key";
}

// The fix for a service that cannot speak yet, opened at that service on Keys & services. A way
// back to the welcome or Create goes along.
function AddKeyLink({
  provider,
  back,
}: {
  readonly provider: ProviderStatus;
  readonly back: SettingsBack | undefined;
}): ReactElement {
  return (
    <ButtonLink
      size="small"
      to="/settings"
      search={{ section: "providers", family: "tts", provider: provider.id, ...backSearch(back) }}
    >
      {provider.readiness.kind === "local"
        ? "Set up the system voice"
        : `Add ${articleOf(provider.displayName)} ${provider.displayName} key`}
    </ButtonLink>
  );
}

// The voices narration can be read in, each with whether its service can speak now, a Listen
// that plays one sentence in it, and the form that adds one. A wrong voice ID is still only
// found when narration uses it; the only rule the form knows is the one the server enforces.
export function Voices({
  provider: asked,
  back,
}: {
  // A voice service named in the address (Create's "add a voice" for the service it uses):
  // Add a voice starts on it.
  readonly provider?: string | undefined;
  // The screen the person came to Settings from, kept on the links to Keys & services.
  readonly back?: SettingsBack | undefined;
} = {}) {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const voices = useQuery(voicesQuery(api));
  const providers = useQuery(providersQuery(api));

  const [removing, setRemoving] = useState<Voice | undefined>(undefined);

  const remove = useMutation({
    mutationFn: (id: string) => removeVoice(api, id),
    onSettled: async () => {
      setRemoving(undefined);
      await queryClient.invalidateQueries({ queryKey: keys.voices });
    },
  });

  // A voice cloned from, or made to sound like, a real person: its narration answers Yes to
  // YouTube's question about altered or synthetic content.
  const realPerson = useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) =>
      setVoiceImitatesRealPerson(api, id, on),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.voices });
    },
  });

  const tts = (providers.data?.providers ?? []).filter((provider) => provider.family === "tts");
  const serviceOf = (voice: Voice): ProviderStatus | undefined =>
    tts.find((provider) => provider.id === voice.provider);

  if (voices.error !== null) {
    return (
      <p role="alert" className="m-0 text-body text-danger">
        {voices.error.message}
      </p>
    );
  }

  const listed = voices.data?.voices;
  // The services saved voices need and that cannot speak yet, said once above the list.
  const silent = tts.filter(
    (provider) =>
      providers.data !== undefined &&
      !usable(provider) &&
      (listed ?? []).some((voice) => voice.provider === provider.id),
  );

  return (
    <div data-tour="voices" className="flex min-w-0 flex-col gap-6">
      {silent.map((provider) => {
        const count = (listed ?? []).filter((voice) => voice.provider === provider.id).length;
        return (
          <div
            key={provider.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-control bg-raised px-3 py-2"
          >
            <Status tone="waiting">{missingWord(provider)}</Status>
            <span className="min-w-0 flex-1 text-small text-ink">
              {`${provider.readiness.kind === "local" ? `The ${provider.displayName.toLowerCase()} isn't installed` : `${provider.displayName} has no key yet`}, so ${count === 1 ? "its voice" : `its ${String(count)} voices`} can't narrate.`}
            </span>
            <AddKeyLink provider={provider} back={back} />
          </div>
        );
      })}

      {/* Rows, not a table: on a narrow column a row puts its actions under its text, so
          nothing is cut off and the page never scrolls sideways. */}
      <div className="@container min-w-0" {...helpScope}>
        {listed === undefined ? (
          <span className="block h-10 w-64 rounded-control bg-raised" />
        ) : listed.length === 0 ? (
          // An empty list teaches rather than showing a bare box.
          <p className="m-0 text-ink-2">
            No voices yet. Add one below: narration reads your script in it.
          </p>
        ) : (
          <List label="Voices">
            {listed.map((voice) => {
              const service = serviceOf(voice);
              const canSpeak = usable(service);
              return (
                <ListRow
                  key={voice.id}
                  className="relative"
                  title={voice.name}
                  meta={
                    <span className="inline-flex max-w-full items-center gap-2">
                      <span className="truncate">{service?.displayName ?? voice.provider}</span>
                      {service === undefined || providers.data === undefined ? null : canSpeak ? (
                        <Status tone="done">Ready</Status>
                      ) : (
                        <Status tone="off">{missingWord(service)}</Status>
                      )}
                      <span className="truncate">{`· ${voice.voiceId}`}</span>
                    </span>
                  }
                  actions={
                    <>
                      {canSpeak ? <ListenButton voice={voice} /> : null}
                      <Button
                        variant="quiet"
                        size="small"
                        aria-label={`Remove ${voice.name}`}
                        onClick={() => {
                          setRemoving(voice);
                        }}
                      >
                        Remove
                      </Button>
                    </>
                  }
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="text-small text-ink-2">Speaks</span>
                      <VoiceLanguagesCell voice={voice} />
                    </div>
                    <Switch
                      checked={
                        realPerson.isPending && realPerson.variables.id === voice.id
                          ? realPerson.variables.on
                          : voice.imitatesRealPerson === true
                      }
                      disabled={realPerson.isPending}
                      onChange={(on) => realPerson.mutate({ id: voice.id, on })}
                      label={
                        <>
                          <span className="sr-only">{`${voice.name} sounds like a real person`}</span>
                          <span aria-hidden="true">Sounds like a real person</span>
                        </>
                      }
                      className="text-small"
                    />
                  </div>
                </ListRow>
              );
            })}
          </List>
        )}
        {realPerson.error === null ? null : (
          <p role="alert" className="m-0 mt-2 text-small text-danger">
            {`Couldn't save Sounds like a real person: ${realPerson.error.message} Press the switch again.`}
          </p>
        )}
        {remove.error === null ? null : (
          <p role="alert" className="m-0 mt-2 text-small text-danger">
            {remove.error.message}
          </p>
        )}
        <div className="mt-3 flex flex-col gap-1">
          <HelpLine>
            Sounds like a real person: turn it on for a voice cloned from, or made to sound like,
            someone real. YouTube asks you to say so when you upload; Copy for YouTube Studio
            answers Yes for you.
          </HelpLine>
          {/* Said only while a row draws Listen. */}
          {(listed ?? []).some((voice) => usable(serviceOf(voice))) ? (
            <HelpLine>
              Listen reads one sentence aloud: free with the system voice, one short paid request
              with a service that has a key.
            </HelpLine>
          ) : null}
          <p className="m-0 text-small text-ink-2">
            How names and words are said:{" "}
            <TextLink to="/narration-aliases">Pronunciation ↗</TextLink>
          </p>
        </div>
      </div>

      <div>
        <SectionHead title="Add a voice" />
        <AddVoiceRow
          tts={tts}
          asked={tts.find((provider) => provider.id === asked)?.id}
          needed={(listed ?? []).map((voice) => voice.provider)}
          // A service already named above the list is not offered a second time.
          said={silent.map((provider) => provider.id)}
          back={back}
        />
      </div>

      <ConfirmDialog
        open={removing !== undefined}
        title={removing === undefined ? "" : `Remove ${removing.name}?`}
        consequence="Projects that used this voice keep the narration they made with it."
        confirmLabel="Remove voice"
        pending={remove.isPending}
        onConfirm={() => {
          if (removing !== undefined) {
            remove.mutate(removing.id);
          }
        }}
        onCancel={() => {
          setRemoving(undefined);
        }}
      />
    </div>
  );
}

// Listen: one sentence in this voice, through its service's first model (the system voice's
// model is its speech program).
function ListenButton({ voice }: { readonly voice: Voice }): ReactElement {
  const { api } = useApp();
  const system = useSystemVoices(voice.provider === systemVoiceProvider);
  const [url, setUrl] = useState<string | undefined>(undefined);
  useEffect(
    () => () => {
      if (url !== undefined) URL.revokeObjectURL(url);
    },
    [url],
  );
  const listen = useMutation({
    mutationFn: async () => {
      const model =
        voice.provider === systemVoiceProvider
          ? system.data?.engines.find((engine) =>
              engine.voices.some((one) => one.id === voice.voiceId),
            )?.id
          : (await listProviderModels(api, voice.provider)).models[0]?.id;
      if (model === undefined)
        throw new Error("No voice model was found for this service. Check it on Models.");
      return speakAudition(api, {
        provider: voice.provider,
        model,
        voice: voice.voiceId,
        text: sampleLine,
      });
    },
    onSuccess: (blob) => {
      const next = URL.createObjectURL(blob);
      setUrl(next);
      void new Audio(next).play().catch(() => {});
    },
  });
  return (
    <>
      <Button
        variant="quiet"
        size="small"
        aria-label={`Listen to ${voice.name}`}
        disabled={listen.isPending}
        onClick={() => listen.mutate()}
      >
        <Volume2Icon aria-hidden="true" className="size-[14px]" />
        {listen.isPending ? "Speaking…" : "Listen"}
      </Button>
      {listen.error === null ? null : (
        <span role="alert" className="basis-full text-left text-small text-danger">
          {`${voice.name} couldn't be spoken: ${listen.error.message}`}
        </span>
      )}
    </>
  );
}

function AddVoiceRow({
  tts,
  asked,
  needed,
  said,
  back,
}: {
  readonly tts: readonly ProviderStatus[];
  // The service the address names, which the form starts on.
  readonly asked: ProviderId | undefined;
  // The services the saved voices use, the likeliest one to add another voice of.
  readonly needed: readonly ProviderId[];
  // The services the page already offers to set up, above the list.
  readonly said: readonly ProviderId[];
  readonly back: SettingsBack | undefined;
}) {
  const { api } = useApp();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [voiceId, setVoiceId] = useState("");
  const [pasting, setPasting] = useState(false);
  const [languages, setLanguages] = useState<readonly string[]>([]);
  const [picked, setPicked] = useState<ProviderId | undefined>(undefined);
  const [refusal, setRefusal] = useState<VoiceRefusal | undefined>(undefined);

  // The service the address names, else the first that can speak now (a voice for one without
  // a key could not narrate), else the one the saved voices use.
  const provider =
    picked ??
    asked ??
    (tts.find(usable) ?? tts.find((option) => needed.includes(option.id)) ?? tts[0])?.id;
  const service = tts.find((option) => option.id === provider);

  const add = useMutation({
    mutationFn: (draft: {
      provider: ProviderId;
      name: string;
      voiceId: string;
      languages?: readonly string[];
    }) => addVoice(api, draft),
    onSuccess: async (result) => {
      if (!result.ok) {
        setRefusal(result.refusal);
        return;
      }
      setName("");
      setVoiceId("");
      setPasting(false);
      setLanguages([]);
      setRefusal(undefined);
      await queryClient.invalidateQueries({ queryKey: keys.voices });
    },
  });

  // The refusal names a field, and it stands until that field changes: the screen keeps
  // Add disabled while a duplicate is on the form.
  const edit = (field: VoiceField, apply: () => void): void => {
    apply();
    if (refusal?.field === field) {
      setRefusal(undefined);
    }
  };

  const problem = (field: VoiceField): string | undefined =>
    refusal?.field === field ? refusal.message : undefined;

  // The voice is typed for these services (and an OpenAI voice of your own), picked for the rest.
  const typed =
    provider !== "system-voice" &&
    provider !== "google-tts" &&
    (provider !== "openai-tts" || pasting);
  // What the form still needs, said beside Add voice while it can't add: the next thing to do.
  const missing =
    provider === undefined
      ? "Pick a voice service first"
      : voiceId.trim() === ""
        ? typed
          ? "Paste a voice ID first"
          : "Pick a voice first"
        : name.trim() === ""
          ? "Type a name first"
          : undefined;
  // The computer's own voice without its speech program has nothing to pick: the form says so
  // once, with the fix, instead of offering an empty choice.
  const uninstalled =
    service !== undefined && service.readiness.kind === "local" && !usable(service);

  const submit = (): void => {
    if (provider === undefined || missing !== undefined || refusal !== undefined || add.isPending)
      return;
    add.mutate({
      provider,
      name,
      voiceId,
      ...(languages.length === 0 ? {} : { languages }),
    });
  };

  const pickVoice = (next: string): void => {
    edit("voiceId", () => {
      setVoiceId(next);
      if (name.trim() === "") setName(next);
    });
  };

  const library = provider === undefined ? undefined : voiceLibraries[provider];
  const voiceHelp: ReactNode =
    provider === "inworld" ? (
      "Use an Inworld voice ID, such as Dennis, or one from your workspace."
    ) : library !== undefined ? (
      <>
        Copy a voice's ID from the{" "}
        <a href={library.url} target="_blank" rel="noreferrer" className="sl-link">
          {`${library.label} ↗`}
        </a>{" "}
        or your own voices there.
      </>
    ) : provider === "openai-tts" && pasting ? (
      "A voice made in your OpenAI account starts with voice_."
    ) : undefined;

  return (
    // A form so Enter in any box adds the voice, as Add voice does.
    // Its columns follow the form's own width (a container), not the window's: beside the
    // Settings list on a laptop it has two columns, and five only where all of them fit.
    <form
      className="@container flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="grid items-start gap-4 @min-[36rem]:grid-cols-2 @min-[60rem]:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto]">
        <Field label="Voice service" error={problem("provider")}>
          <Select
            value={provider ?? ""}
            onChange={(event) => {
              const chosen = tts.find((option) => option.id === event.target.value);
              if (chosen !== undefined) {
                edit("provider", () => {
                  setPicked(chosen.id);
                  setVoiceId("");
                  setPasting(false);
                });
              }
            }}
          >
            {tts.length === 0 ? <option value="">No voice service</option> : null}
            {tts.map((option) => (
              <option key={option.id} value={option.id}>
                {usable(option)
                  ? option.displayName
                  : `${option.displayName} (${missingWord(option).toLowerCase()})`}
              </option>
            ))}
          </Select>
        </Field>

        {uninstalled ? (
          <p className="m-0 flex flex-wrap items-center gap-2 self-center text-small text-ink-2 @min-[36rem]:col-span-full @min-[60rem]:col-span-4 @min-[60rem]:mt-6">
            The system voice isn't installed on this computer, so it has no voices to add yet.
            {said.includes(service.id) ? null : <AddKeyLink provider={service} back={back} />}
          </p>
        ) : (
          <>
            <Field
              label={typed ? "Voice ID" : "Voice"}
              error={problem("voiceId")}
              {...(voiceHelp === undefined ? {} : { help: voiceHelp })}
            >
              {provider === "system-voice" ? (
                // The computer's own voices are listed, not typed; picking one names it too.
                <SystemVoicePicker
                  value={voiceId}
                  onPick={(voice) => {
                    edit("voiceId", () => {
                      setVoiceId(voice.id);
                    });
                    if (name.trim() === "") setName(voice.name);
                    const language = /^([a-z]{2,3})(?:[-_]|$)/i.exec(voice.language ?? "")?.[1];
                    if (languages.length === 0 && language !== undefined)
                      setLanguages([language.toLowerCase()]);
                  }}
                />
              ) : provider === "google-tts" ? (
                // Gemini speaks only its prebuilt voices, so they are picked rather than typed.
                <Select
                  value={voiceId}
                  options={[
                    { value: "", label: "Pick a Gemini voice" },
                    ...geminiVoices.map((one) => ({
                      value: one.name,
                      label: `${one.name} (${one.style})`,
                    })),
                  ]}
                  onChange={(event) => pickVoice(event.target.value)}
                />
              ) : provider === "openai-tts" && !pasting ? (
                <Select
                  value={voiceId}
                  options={[
                    { value: "", label: "Pick an OpenAI voice" },
                    ...openAiVoices.map((one) => ({ value: one, label: one })),
                    { value: pasteId, label: "A voice of my own (paste its ID)" },
                  ]}
                  onChange={(event) => {
                    if (event.target.value === pasteId) {
                      setPasting(true);
                      edit("voiceId", () => setVoiceId(""));
                    } else pickVoice(event.target.value);
                  }}
                />
              ) : (
                <span className="flex min-w-0 flex-col items-start gap-1">
                  <Input
                    className="tabular-nums"
                    value={voiceId}
                    onChange={(event) => {
                      const next = event.target.value;
                      edit("voiceId", () => {
                        setVoiceId(next);
                      });
                    }}
                  />
                  {provider === "openai-tts" ? (
                    // The way back from pasting to OpenAI's own voices.
                    <Button
                      variant="quiet"
                      size="small"
                      onClick={() => {
                        setPasting(false);
                        edit("voiceId", () => setVoiceId(""));
                      }}
                    >
                      Pick from OpenAI's voices
                    </Button>
                  ) : null}
                </span>
              )}
            </Field>

            <Field label="Name" help="How you pick it on Create." error={problem("name")}>
              <Input
                value={name}
                onChange={(event) => {
                  const next = event.target.value;
                  edit("name", () => {
                    setName(next);
                  });
                }}
              />
            </Field>

            <Field
              label="Languages it speaks"
              help="Create lists the voice for projects in these languages."
              error={problem("languages")}
            >
              <VoiceLanguagesPicker
                value={languages}
                label="Languages it speaks"
                onChange={(codes) => edit("languages", () => setLanguages(codes))}
              />
            </Field>

            <div className="flex flex-col items-start gap-1 @min-[60rem]:mt-6">
              <Button
                type="submit"
                variant="primary"
                disabled={missing !== undefined || refusal !== undefined || add.isPending}
              >
                Add voice
              </Button>
              {missing === undefined ? null : (
                <span className="text-small text-ink-2">{missing}</span>
              )}
            </div>
          </>
        )}
      </div>
      {/* A service with no key is said once: here, unless the note above the list says it. */}
      {service === undefined ||
      usable(service) ||
      uninstalled ||
      said.includes(service.id) ? null : (
        <p className="m-0 flex flex-wrap items-center gap-2 text-small text-ink-2">
          {`${service.displayName} has no key yet: you can add the voice now, but it can't narrate until the key is saved.`}
          <AddKeyLink provider={service} back={back} />
        </p>
      )}
      {add.error === null ? null : (
        <p role="alert" className="m-0 text-small text-danger">
          {add.error.message}
        </p>
      )}
    </form>
  );
}
