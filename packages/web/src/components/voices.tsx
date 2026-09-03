import type { ProviderId, ProviderStatus, Voice } from "@app/slices/settings/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import type { VoiceField, VoiceRefusal } from "@/api";
import { addVoice, removeVoice } from "@/api";
import { useApp } from "@/app-context";
import { ConfirmDialog } from "@/components/confirm";
import { Rail, RailGroup } from "@/components/rail";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { keys, providersQuery, voicesQuery } from "@/queries";

// The header, the listed rows and the add row are cells of one table, so the three line
// up under each other the way the reference sheet draws them. The last column is wider
// than the reference's 80 px because "Add voice" does not fit in 80.
const cell = "px-4 align-top";

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
      <RailGroup>
        <Rail>
          <p className="text-body text-red">{voices.error.message}</p>
        </Rail>
      </RailGroup>
    );
  }

  const listed = voices.data?.voices;

  return (
    <RailGroup>
      <table className="w-full table-fixed border-collapse text-small">
        <thead>
          <tr className="border-b border-line">
            <th className={cn(cell, "engraved w-[26%] py-3 text-left text-ink3")}>Voices · Name</th>
            <th className={cn(cell, "engraved w-[26%] py-3 text-left text-ink3")}>Provider</th>
            <th className={cn(cell, "engraved py-3 text-left text-ink3")}>Voice ID</th>
            <th className={cn(cell, "w-[104px] py-3")}>
              <span className="sr-only">Remove</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {listed === undefined ? (
            <tr className="border-b border-line">
              <td colSpan={4} className={cn(cell, "py-4")}>
                <span className="block h-4 w-64 rounded-control bg-panel2" />
              </td>
            </tr>
          ) : listed.length === 0 ? (
            // An empty list teaches rather than showing a bare box.
            <tr className="border-b border-line">
              <td colSpan={4} className={cn(cell, "py-4 text-ink2")}>
                Add a voice ID from your text-to-speech provider. Audio needs one to narrate.
              </td>
            </tr>
          ) : (
            listed.map((voice) => (
              <tr key={voice.id} className="border-b border-line">
                <td className={cn(cell, "py-3 font-semibold")}>{voice.name}</td>
                <td className={cn(cell, "py-3 text-ink2")}>{nameOf(tts, voice.provider)}</td>
                <td className={cn(cell, "py-3 text-ink2 tabular-nums")}>{voice.voiceId}</td>
                <td className={cn(cell, "py-3 text-right")}>
                  <Button
                    className="bg-transparent"
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
        <tfoot>
          <AddVoiceRow tts={tts} />
        </tfoot>
      </table>

      {remove.error === null ? null : (
        <p className="border-t border-line px-4 py-3 text-label text-red">{remove.error.message}</p>
      )}

      <ConfirmDialog
        open={removing !== undefined}
        title={removing === undefined ? "" : `Remove ${removing.name}?`}
        consequence="Projects that used this voice keep the audio they made with it."
        verb="Remove"
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
    </RailGroup>
  );
}

function AddVoiceRow({ tts }: { readonly tts: readonly ProviderStatus[] }) {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const nameId = useId();
  const providerId = useId();
  const providerLabelId = useId();
  const voiceFieldId = useId();
  const refusalId = useId();

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
    <tr>
      <td className={cn(cell, "py-[14px]")}>
        <Label htmlFor={nameId} className="mb-[5px]">
          Voice name
        </Label>
        <Input
          id={nameId}
          value={name}
          aria-invalid={problem("name") !== undefined}
          onChange={(event) => {
            const next = event.target.value;
            edit("name", () => {
              setName(next);
            });
          }}
        />
        <FieldError id={`${refusalId}-name`} message={problem("name")} />
      </td>

      <td className={cn(cell, "py-[14px]")}>
        <Label id={providerLabelId} className="mb-[5px]">
          Provider
        </Label>
        <Select
          value={provider ?? ""}
          onValueChange={(next) => {
            const chosen = tts.find((option) => option.id === next);
            if (chosen !== undefined) {
              edit("provider", () => {
                setPicked(chosen.id);
              });
            }
          }}
        >
          <SelectTrigger id={providerId} aria-labelledby={`${providerLabelId} ${providerId}`}>
            <SelectValue placeholder="Pick a provider" />
          </SelectTrigger>
          <SelectContent>
            {tts.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.displayName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldError id={`${refusalId}-provider`} message={problem("provider")} />
      </td>

      <td className={cn(cell, "py-[14px]")}>
        <Label htmlFor={voiceFieldId} className="mb-[5px]">
          Voice ID
        </Label>
        <Input
          id={voiceFieldId}
          className="tabular-nums"
          value={voiceId}
          aria-invalid={problem("voiceId") !== undefined}
          aria-describedby={problem("voiceId") === undefined ? undefined : `${refusalId}-voiceId`}
          onChange={(event) => {
            const next = event.target.value;
            edit("voiceId", () => {
              setVoiceId(next);
            });
          }}
        />
        <FieldError id={`${refusalId}-voiceId`} message={problem("voiceId")} />
        {add.error === null ? null : (
          <p className="mt-1 text-label text-red">{add.error.message}</p>
        )}
      </td>

      <td className={cn(cell, "py-[14px] text-right")}>
        <Button
          className="mt-[22px]"
          disabled={provider === undefined || refusal !== undefined || add.isPending}
          onClick={() => {
            if (provider !== undefined) {
              add.mutate({ provider, name, voiceId });
            }
          }}
        >
          Add voice
        </Button>
      </td>
    </tr>
  );
}

function FieldError({
  id,
  message,
}: {
  readonly id: string;
  readonly message: string | undefined;
}) {
  if (message === undefined) {
    return null;
  }
  return (
    <p id={id} className="mt-1 text-label text-red">
      {message}
    </p>
  );
}

function nameOf(tts: readonly ProviderStatus[], id: ProviderId): string {
  return tts.find((provider) => provider.id === id)?.displayName ?? id;
}
