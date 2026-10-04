import {
  geminiVoices,
  type ProviderId,
  type ProviderStatus,
  type Voice,
} from "@app/slices/settings/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { VoiceField, VoiceRefusal } from "@/api";
import { addVoice, removeVoice, setVoiceImitatesRealPerson } from "@/api";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { ConfirmDialog } from "@/components/kit/dialog";
import { Field, Input, Select } from "@/components/kit/field";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import { SectionHead } from "@/components/kit/section-head";
import { Switch } from "@/components/kit/switch";
import { SystemVoicePicker } from "@/components/system-voices";
import {
  languagesOfText,
  languagesReading,
  VoiceLanguagesCell,
} from "@/language/voice-languages-cell";
import { keys, providersQuery, voicesQuery } from "@/queries";

// The voice list and the row that adds to it. Nothing here is checked against the provider: a
// wrong voice ID is discovered when the audio stage uses it, so the only rule the form knows is
// the one the server enforces.
export function Voices() {
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
  // YouTube's AI use ("makes a real person appear to say or do something they didn't").
  const realPerson = useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) =>
      setVoiceImitatesRealPerson(api, id, on),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.voices });
    },
  });

  const tts = (providers.data?.providers ?? []).filter((provider) => provider.family === "tts");

  if (voices.error !== null) {
    return (
      <p role="alert" className="m-0 text-body text-danger">
        {voices.error.message}
      </p>
    );
  }

  const listed = voices.data?.voices;

  return (
    <div data-tour="voices" className="flex min-w-0 flex-col gap-10">
      <div className="min-w-0 overflow-x-auto">
        <table className="sl-table min-w-[640px] table-fixed" {...helpScope}>
          <caption className="sr-only">Voices</caption>
          <thead>
            <tr>
              <th scope="col" className="w-[22%] pr-4">
                Name
              </th>
              <th scope="col" className="w-[18%] pr-4">
                Provider
              </th>
              <th scope="col" className="pr-4">
                Voice ID
              </th>
              <th scope="col" className="w-[22%] pr-4">
                <span className="inline-flex items-center gap-1">
                  Languages
                  <InfoTip id="play.voices.languages" className="-my-1" />
                </span>
              </th>
              <th scope="col" className="w-[20%] pr-4">
                <span className="inline-flex items-center gap-1">
                  Real person
                  <InfoTip id="play.voices.real-person" className="-my-1" />
                </span>
              </th>
              <th scope="col" className="w-[96px]">
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {listed === undefined ? (
              <tr>
                <td colSpan={6}>
                  <span className="block h-4 w-64 rounded-control bg-raised" />
                </td>
              </tr>
            ) : listed.length === 0 ? (
              // An empty list teaches rather than showing a bare box.
              <tr>
                <td colSpan={6} className="text-ink-2">
                  Add a voice ID from your text-to-speech provider. Audio needs one to narrate.
                </td>
              </tr>
            ) : (
              listed.map((voice) => (
                <tr key={voice.id}>
                  <td className="truncate pr-4 font-semibold">{voice.name}</td>
                  <td className="truncate pr-4 text-ink-2">{nameOf(tts, voice.provider)}</td>
                  <td className="truncate pr-4 text-ink-2">{voice.voiceId}</td>
                  <td className="pr-4">
                    <VoiceLanguagesCell voice={voice} />
                  </td>
                  <td className="pr-4">
                    <Switch
                      checked={
                        realPerson.isPending && realPerson.variables.id === voice.id
                          ? realPerson.variables.on
                          : voice.imitatesRealPerson === true
                      }
                      disabled={realPerson.isPending}
                      onChange={(on) => realPerson.mutate({ id: voice.id, on })}
                      label={
                        <span className="sr-only">{`${voice.name} imitates a real person`}</span>
                      }
                      className="text-small"
                    />
                  </td>
                  <td className="text-right">
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
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {realPerson.error === null ? null : (
          <p role="alert" className="m-0 mt-2 text-small text-danger">
            {`Couldn't change Real person: ${realPerson.error.message} Press the switch again.`}
          </p>
        )}
        {remove.error === null ? null : (
          <p role="alert" className="m-0 mt-2 text-small text-danger">
            {remove.error.message}
          </p>
        )}
      </div>

      <div>
        <SectionHead title="Add a voice" />
        <AddVoiceRow tts={tts} />
      </div>

      <ConfirmDialog
        open={removing !== undefined}
        title={removing === undefined ? "" : `Remove ${removing.name}?`}
        consequence="Projects that used this voice keep the audio they made with it."
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

function AddVoiceRow({ tts }: { readonly tts: readonly ProviderStatus[] }) {
  const { api } = useApp();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [voiceId, setVoiceId] = useState("");
  const [languages, setLanguages] = useState("");
  const [picked, setPicked] = useState<ProviderId | undefined>(undefined);
  const [refusal, setRefusal] = useState<VoiceRefusal | undefined>(undefined);

  const provider = picked ?? tts[0]?.id;

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
      setLanguages("");
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

  const submit = (): void => {
    if (provider === undefined || refusal !== undefined || add.isPending) return;
    const codes = languagesOfText(languages);
    add.mutate({
      provider,
      name,
      voiceId,
      ...(codes.length === 0 ? {} : { languages: codes }),
    });
  };

  return (
    // A form so Enter in any box adds the voice, as Add voice does.
    <form
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
        <Field label="Voice name" tip="play.voices.name" error={problem("name")}>
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

        <Field label="Provider" tip="play.voices.provider" error={problem("provider")}>
          <Select
            value={provider ?? ""}
            onChange={(event) => {
              const chosen = tts.find((option) => option.id === event.target.value);
              if (chosen !== undefined) {
                edit("provider", () => {
                  setPicked(chosen.id);
                });
              }
            }}
          >
            {tts.length === 0 ? <option value="">No speech provider</option> : null}
            {tts.map((option) => (
              <option key={option.id} value={option.id}>
                {option.displayName}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Voice ID"
          tip="play.voices.voice-id"
          error={problem("voiceId")}
          {...(provider === "inworld"
            ? { help: "Use an Inworld voice ID, such as Dennis, or one from your workspace." }
            : {})}
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
                if (languages.trim() === "" && language !== undefined)
                  setLanguages(language.toLowerCase());
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
              onChange={(event) => {
                const next = event.target.value;
                edit("voiceId", () => {
                  setVoiceId(next);
                  if (name.trim() === "") setName(next);
                });
              }}
            />
          ) : (
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
          )}
        </Field>

        <Field
          label="Languages"
          tip="play.voices.languages"
          help={languagesReading(languages)}
          error={problem("languages")}
        >
          <Input
            value={languages}
            placeholder="es, de"
            onChange={(event) => {
              const next = event.target.value;
              edit("languages", () => {
                setLanguages(next);
              });
            }}
          />
        </Field>

        <Button
          type="submit"
          variant="primary"
          className="md:mt-6"
          disabled={provider === undefined || refusal !== undefined || add.isPending}
        >
          Add voice
        </Button>
      </div>
      {add.error === null ? null : (
        <p role="alert" className="m-0 text-small text-danger">
          {add.error.message}
        </p>
      )}
    </form>
  );
}

function nameOf(tts: readonly ProviderStatus[], id: ProviderId): string {
  return tts.find((provider) => provider.id === id)?.displayName ?? id;
}
