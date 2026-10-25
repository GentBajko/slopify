import type { SpeechInstall, SpeechVoice } from "@app/kernel/ports/system-speech.js";
import type { ProviderStatus } from "@app/slices/settings/model.js";
import { systemVoiceProvider } from "@app/slices/settings/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Volume2Icon } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { type Api, speakAudition } from "@/api";
import { useApp } from "@/app-context";
import { Button, ButtonRow } from "@/components/kit/button";
import { Input, Select } from "@/components/kit/field";
import { ButtonLink, TextLink } from "@/components/kit/link";
import { Status } from "@/components/kit/status";
import { ServiceAbout } from "@/components/provider-cli";
import { read } from "@/http";
import { checkFirstRun, onboardingKey } from "@/onboarding/api";
import { keys } from "@/queries";

// The system voice's speech programs and their voices (`GET /api/providers/system-voice/voices`):
// Keys & services shows what was found, Voices offers the voices to add.

export interface SystemVoices {
  readonly engines: readonly {
    readonly id: string;
    readonly name: string;
    readonly voices: readonly SpeechVoice[];
    readonly defaultVoice: string | null;
  }[];
  readonly issue: string | null;
  // With no speech program: how to install one from a terminal, where that is how it is done.
  readonly install?: SpeechInstall | null;
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
  return readiness.available
    ? { tone: "done", word: "Ready" }
    : { tone: "off", word: "Not installed" };
}

// The system voice's setup on Keys & services: the program found and how many voices it has,
// or that none was found, the commands that install one, Check again once it is installed and
// the key that needs no program at all.
export function SystemVoiceDetail({
  provider,
  readiness,
  onUseKey,
}: {
  readonly provider: ProviderStatus;
  readonly readiness: LocalReadiness;
  // Opens OpenAI's key on this page: its voices work at once, with no program to install.
  readonly onUseKey?: () => void;
}) {
  const headingId = useId();
  const voices = useSystemVoices();
  const engines = readiness.available ? (voices.data?.engines ?? []) : [];
  const install = voices.data?.install ?? undefined;
  const check = useCheckSpeechAgain();
  return (
    <section
      aria-labelledby={headingId}
      data-ready={readiness.available}
      className="flex min-w-0 flex-col gap-4"
    >
      <div>
        <h3 id={headingId} className="sl-section-head__title">
          {provider.displayName}
        </h3>
        <p className="sl-section-head__meta">Voice service · built into this computer, no key</p>
      </div>
      <ServiceAbout provider={provider} />
      <p className="m-0 flex min-w-0 flex-wrap items-center gap-x-2" aria-live="polite">
        <Status tone={localState(readiness).tone}>{localState(readiness).word}</Status>
        <span className="min-w-0 break-words text-ink-2">
          {readiness.available
            ? `Found ${readiness.engine ?? "a speech program"}. Narration with it is free; a voice service with a key sounds better.`
            : install !== undefined
              ? noProgram
              : (readiness.issue ?? noProgram)}
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
      ) : (
        <>
          {install === undefined ? null : <InstallSteps install={install} />}
          <ButtonRow>
            <Button disabled={check.isPending} onClick={() => check.mutate()}>
              {check.isPending ? "Checking…" : "Check again"}
            </Button>
            {onUseKey === undefined ? null : (
              <Button variant="quiet" onClick={onUseKey}>
                Add an OpenAI key instead
              </Button>
            )}
          </ButtonRow>
          {check.error === null ? null : (
            <p role="alert" className="m-0 text-small text-danger">
              {`Slopify couldn't look again: ${check.error.message}`}
            </p>
          )}
          {check.isSuccess ? (
            <p role="status" className="m-0 text-small text-ink-2">
              Looked again just now: still no speech program.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

const noProgram = "No speech program was found on this computer, so it can't narrate.";

// The commands that install a speech program, apart from the sentence, so each can be copied.
function InstallSteps({ install }: { readonly install: SpeechInstall }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="m-0 text-small text-ink-2">{install.text}</p>
      <pre className="m-0 overflow-x-auto rounded-sm bg-sunken px-3 py-2 font-mono text-small text-ink">
        {install.commands.join("\n")}
      </pre>
    </div>
  );
}

// Check again: looks for a speech program afresh (the server otherwise answers from the last
// minute's look), then reads every service and the first-run view again.
function useCheckSpeechAgain() {
  const { api } = useApp();
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => checkFirstRun(api),
    onSuccess: async (view) => {
      client.setQueryData(onboardingKey, view);
      await client.invalidateQueries({ queryKey: keys.providers });
    },
  });
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
  if (voices.data !== undefined && engines.length === 0) {
    const install = voices.data.install ?? undefined;
    return (
      <div className="flex min-w-0 flex-col gap-2">
        <p role="alert" className="m-0 text-small text-danger">
          {install === undefined ? (voices.data.issue ?? noProgram) : noProgram}
        </p>
        {install === undefined ? null : <InstallSteps install={install} />}
        <p className="m-0 text-small">
          <TextLink to="/settings" search={{ section: "providers", provider: systemVoiceProvider }}>
            Check again on Keys & services
          </TextLink>
        </p>
      </div>
    );
  }
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

// The sentence Listen speaks, here and on Voices.
export const sampleLine = "This is how your narration will sound in this voice.";
