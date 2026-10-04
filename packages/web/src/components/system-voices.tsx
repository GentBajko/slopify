import type { SpeechVoice } from "@app/kernel/ports/system-speech.js";
import type { ProviderStatus } from "@app/slices/settings/model.js";
import { systemVoiceProvider } from "@app/slices/settings/model.js";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Volume2Icon } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { type Api, speakAudition } from "@/api";
import { useApp } from "@/app-context";
import { Button, ButtonRow } from "@/components/kit/button";
import { Input, Select } from "@/components/kit/field";
import { InfoTip } from "@/components/kit/info-tip";
import { ButtonLink } from "@/components/kit/link";
import { Lamp } from "@/components/kit/status";
import { providerTips } from "@/components/provider-cli";
import { read } from "@/http";

// The system voice's speech programs and their voices (`GET /api/providers/system-voice/voices`):
// Settings → Providers shows what was found, Settings → Voices offers the voices to add.

export interface SystemVoices {
  readonly engines: readonly {
    readonly id: string;
    readonly name: string;
    readonly voices: readonly SpeechVoice[];
    readonly defaultVoice: string | null;
  }[];
  readonly issue: string | null;
}

export const systemVoicesKey = ["providers", "system-voice", "voices"] as const;

export async function readSystemVoices(api: Api): Promise<SystemVoices> {
  return read<SystemVoices>(await api.fetch(`${api.origin}/api/providers/system-voice/voices`));
}

export function useSystemVoices(enabled = true) {
  const { api } = useApp();
  return useQuery({ queryKey: systemVoicesKey, queryFn: () => readSystemVoices(api), enabled });
}

type LocalReadiness = Extract<ProviderStatus["readiness"], { readonly kind: "local" }>;

export function localState(readiness: LocalReadiness): {
  readonly tone: "done" | "off";
  readonly word: string;
} {
  return readiness.available ? { tone: "done", word: "Ready" } : { tone: "off", word: "Not found" };
}

// Settings → Providers' detail column for the system voice: the program found and how many
// voices it has, or why none can speak and the fix.
export function SystemVoiceDetail({
  provider,
  readiness,
}: {
  readonly provider: ProviderStatus;
  readonly readiness: LocalReadiness;
}) {
  const headingId = useId();
  const voices = useSystemVoices(readiness.available);
  const engines = voices.data?.engines ?? [];
  return (
    <section
      aria-labelledby={headingId}
      data-ready={readiness.available}
      className="flex min-w-0 flex-col gap-5"
    >
      <div>
        <div className="flex items-center gap-2">
          <h3 id={headingId} className="sl-section-head__title">
            {provider.displayName}
          </h3>
          <InfoTip id={providerTips[provider.id]} label={provider.displayName} />
        </div>
        <p className="sl-section-head__meta">Speech · built into this computer, no key needed</p>
      </div>
      <p className="m-0 flex min-w-0 items-center gap-2" aria-live="polite">
        <Lamp tone={localState(readiness).tone} />
        <span className="min-w-0 break-words">
          {readiness.available
            ? `Found ${readiness.engine ?? "a speech program"}. Narration with it is free; a keyed voice (ElevenLabs, OpenAI) sounds better.`
            : (readiness.issue ?? "No speech program was found on this computer.")}
        </span>
      </p>
      {engines.length === 0 ? null : (
        <ul className="m-0 list-none p-0 text-small text-ink-2">
          {engines.map((engine) => {
            const count = engine.voices.length;
            return (
              <li key={engine.id}>{`${engine.name}: ${count} voice${count === 1 ? "" : "s"}`}</li>
            );
          })}
        </ul>
      )}
      {readiness.available ? (
        <ButtonRow>
          <ButtonLink to="/settings" search={{ section: "voices" }}>
            Add a system voice
          </ButtonLink>
        </ButtonRow>
      ) : null}
    </section>
  );
}

// Settings → Voices' Voice ID for the system voice: the voices found, grouped by program, and
// Listen beside them, which speaks one sentence in the picked voice before it is added. The
// system voice costs nothing, so Listen needs no price first.
export function SystemVoicePicker({
  value,
  onPick,
}: {
  readonly value: string;
  readonly onPick: (voice: SpeechVoice) => void;
}) {
  const { api } = useApp();
  const voices = useSystemVoices();
  const engines = voices.data?.engines ?? [];
  const engine = engines.find((one) => one.voices.some((voice) => voice.id === value));
  // eSpeak NG alone brings over a hundred voices; past a short list a filter box narrows the
  // select to the names typed, keeping the picked voice in it.
  const [filter, setFilter] = useState("");
  const filterId = useId();
  const words = filter.trim().toLowerCase();
  const total = engines.reduce((sum, one) => sum + one.voices.length, 0);
  const matches = (voice: SpeechVoice): boolean =>
    words === "" ||
    voice.id === value ||
    `${voice.name} ${voice.language ?? ""}`.toLowerCase().includes(words);
  const [url, setUrl] = useState<string | undefined>(undefined);
  useEffect(
    () => () => {
      if (url !== undefined) URL.revokeObjectURL(url);
    },
    [url],
  );
  const listen = useMutation({
    mutationFn: (voice: { readonly engine: string; readonly id: string }) =>
      speakAudition(api, {
        provider: systemVoiceProvider,
        model: voice.engine,
        voice: voice.id,
        text: sampleLine,
      }),
    onSuccess: (blob) => {
      const next = URL.createObjectURL(blob);
      setUrl(next);
      void new Audio(next).play().catch(() => {});
    },
  });
  if (voices.data !== undefined && engines.length === 0)
    return (
      <p role="alert" className="m-0 text-small text-danger">
        {voices.data.issue ?? "No speech program was found on this computer."}
      </p>
    );
  return (
    <div className="grid gap-1">
      {total > 12 ? (
        <Input
          id={filterId}
          type="search"
          aria-label="Filter voices"
          placeholder={`Filter ${String(total)} voices by name or language`}
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
      ) : null}
      <div className="flex min-w-0 items-center gap-2">
        <Select
          className="min-w-0 flex-1"
          value={value}
          onChange={(event) => {
            listen.reset();
            for (const one of engines) {
              const voice = one.voices.find((option) => option.id === event.target.value);
              if (voice !== undefined) return onPick(voice);
            }
          }}
        >
          <option value="">
            {voices.data === undefined ? "Looking for voices…" : "Pick a voice"}
          </option>
          {engines.map((one) => (
            <optgroup key={one.id} label={one.name}>
              {one.voices.filter(matches).map((voice) => (
                <option key={voice.id} value={voice.id}>
                  {voice.language === undefined ? voice.name : `${voice.name} (${voice.language})`}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
        <Button
          variant="quiet"
          disabled={engine === undefined || listen.isPending}
          disabledReason="Pick a voice first."
          onClick={() => {
            if (engine !== undefined) listen.mutate({ engine: engine.id, id: value });
          }}
        >
          <Volume2Icon aria-hidden="true" className="size-[14px]" />
          {listen.isPending ? "Speaking…" : "Listen"}
        </Button>
      </div>
      {listen.error === null ? null : (
        <p role="alert" className="m-0 text-small text-danger">
          {`The sample couldn't be spoken: ${listen.error.message}`}
        </p>
      )}
    </div>
  );
}

const sampleLine = "This is how your narration will sound in this voice.";
