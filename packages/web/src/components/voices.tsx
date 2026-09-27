import type { ProviderId, ProviderStatus, Voice } from "@app/slices/settings/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { VoiceField, VoiceRefusal } from "@/api";
import { addVoice, removeVoice } from "@/api";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { ConfirmDialog } from "@/components/kit/dialog";
import { Field, Input, Select } from "@/components/kit/field";
import { SectionHead } from "@/components/kit/section-head";
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
        <table className="sl-table min-w-[480px] table-fixed">
          <caption className="sr-only">Voices</caption>
          <thead>
            <tr>
              <th scope="col" className="w-[30%] pr-4">
                Name
              </th>
              <th scope="col" className="w-[26%] pr-4">
                Provider
              </th>
              <th scope="col" className="pr-4">
                Voice ID
              </th>
              <th scope="col" className="w-[96px]">
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {listed === undefined ? (
              <tr>
                <td colSpan={4}>
                  <span className="block h-4 w-64 rounded-control bg-raised" />
                </td>
              </tr>
            ) : listed.length === 0 ? (
              // An empty list teaches rather than showing a bare box.
              <tr>
                <td colSpan={4} className="text-ink-2">
                  Add a voice ID from your text-to-speech provider. Audio needs one to narrate.
                </td>
              </tr>
            ) : (
              listed.map((voice) => (
                <tr key={voice.id}>
                  <td className="truncate pr-4 font-semibold">{voice.name}</td>
                  <td className="truncate pr-4 text-ink-2">{nameOf(tts, voice.provider)}</td>
                  <td className="truncate pr-4 text-ink-2">{voice.voiceId}</td>
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
  const [picked, setPicked] = useState<ProviderId | undefined>(undefined);
  const [refusal, setRefusal] = useState<VoiceRefusal | undefined>(undefined);

  const provider = picked ?? tts[0]?.id;

  const add = useMutation({
    mutationFn: (draft: { provider: ProviderId; name: string; voiceId: string }) =>
      addVoice(api, draft),
    onSuccess: async (result) => {
      if (!result.ok) {
        setRefusal(result.refusal);
        return;
      }
      setName("");
      setVoiceId("");
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

  return (
    <div className="flex flex-col gap-3">
      <div className="grid items-start gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
        <Field label="Voice name" error={problem("name")}>
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

        <Field label="Provider" error={problem("provider")}>
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
          error={problem("voiceId")}
          {...(provider === "inworld"
            ? { help: "Use an Inworld voice ID, such as Dennis, or one from your workspace." }
            : {})}
        >
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
        </Field>

        <Button
          variant="primary"
          className="md:mt-[22px]"
          disabled={provider === undefined || refusal !== undefined || add.isPending}
          onClick={() => {
            if (provider !== undefined) {
              add.mutate({ provider, name, voiceId });
            }
          }}
        >
          Add voice
        </Button>
      </div>
      {add.error === null ? null : (
        <p role="alert" className="m-0 text-small text-danger">
          {add.error.message}
        </p>
      )}
    </div>
  );
}

function nameOf(tts: readonly ProviderStatus[], id: ProviderId): string {
  return tts.find((provider) => provider.id === id)?.displayName ?? id;
}
