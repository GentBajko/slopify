import { skippedSpeakerPronunciations } from "@app/slices/narration/pronunciation.js";
import type { ProviderStatus } from "@app/slices/settings/model.js";
import {
  paceSteps,
  type Speaker,
  type SpeakerRole,
  speakerRoles,
} from "@app/slices/voices/model.js";
import { useMutation, useQuery } from "@tanstack/react-query";
import { type ReactElement, useEffect, useMemo, useState } from "react";
import { quoteAuditions, speakAudition, type Voice } from "@/api";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Callout } from "@/components/kit/callout";
import { Field, Input, Textarea } from "@/components/kit/field";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import { useVoicesForLanguage, VoiceLanguageNote } from "@/language/voice-language";
import { usd } from "@/lib/format";
import { ModelPicker, OptionPicker, ProviderPicker } from "@/play/pickers";
import { RowMenu } from "./row-menu.js";

// One speaker of the Multiple voices editor: name, role, voice, pace, pronunciations, an
// Audition button, and Remove with the rarer Move up, Move down and Duplicate in its menu.

const roleLabels: Readonly<Record<SpeakerRole, string>> = {
  narrator: "Narrator",
  host: "Host",
  guest: "Guest",
  character: "Character",
};

export function SpeakerRow({
  index,
  speaker,
  line,
  providers,
  voices,
  language,
  problem,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  onDuplicate,
}: {
  readonly index: number;
  readonly speaker: Speaker;
  readonly line: string;
  readonly providers: readonly ProviderStatus[];
  readonly voices: readonly Voice[];
  readonly language: string | undefined;
  readonly problem?: ((field: string) => string | undefined) | undefined;
  readonly onChange: (next: Speaker) => void;
  readonly onRemove: (() => void) | undefined;
  readonly onMoveUp?: (() => void) | undefined;
  readonly onMoveDown?: (() => void) | undefined;
  readonly onDuplicate?: (() => void) | undefined;
}): ReactElement {
  const field = `voices.speakers.${String(index)}`;
  const voice = speaker.voice;
  const ofProvider = voices.filter((one) => one.provider === voice.provider);
  const byLanguage = useVoicesForLanguage(ofProvider, language, voice.voice || undefined);
  const mine = language === undefined ? ofProvider : byLanguage.listed;
  const name = speaker.name.trim() || "this speaker";
  // The rows the narration would skip, found as they are typed. "und" (undetermined) reads
  // like any non-English language: full IPA, still never ARPAbet or tags.
  const skipped = useMemo(
    () => skippedSpeakerPronunciations([speaker], language ?? "und")[0]?.skipped ?? [],
    [speaker, language],
  );
  return (
    <li className="grid grid-cols-1 gap-3 py-3 min-[700px]:grid-cols-2" data-play-field={field}>
      <div className="flex min-w-0 items-end gap-2">
        <span
          aria-hidden="true"
          className="mb-2 size-3 shrink-0 rounded-full"
          style={{ background: `var(--color-speaker-${String((index % 6) + 1)})` }}
        />
        <Field
          label="Speaker name"
          tip="play.speaker.name"
          error={problem?.(`${field}.name`)}
          className="min-w-0 flex-1"
        >
          <Input
            value={speaker.name}
            maxLength={40}
            onChange={(event) => onChange({ ...speaker, name: event.target.value })}
          />
        </Field>
      </div>
      <OptionPicker
        label="Role"
        tip="play.speaker.role"
        value={speaker.role}
        placeholder="Pick a role"
        options={speakerRoles.map((role) => ({ value: role, label: roleLabels[role] }))}
        problem={undefined}
        onPick={(role) => {
          const next = speakerRoles.find((one) => one === role);
          if (next !== undefined) onChange({ ...speaker, role: next });
        }}
      />
      <ProviderPicker
        field={`${field}.voice`}
        label="Voice provider"
        tip="play.speaker.provider"
        family="tts"
        providers={providers}
        value={voice.provider}
        problem={problem?.(`${field}.voice`)}
        onPick={(provider) => onChange({ ...speaker, voice: { provider, model: "", voice: "" } })}
      />
      <ModelPicker
        label="Voice model"
        tip="play.speaker.model"
        provider={voice.provider}
        value={voice.model}
        problem={undefined}
        onPick={(model) => onChange({ ...speaker, voice: { ...voice, model } })}
      />
      <OptionPicker
        field={`${field}.voice.voice`}
        label="Voice"
        tip="play.speaker.voice"
        value={voice.voice}
        placeholder={mine.length === 0 ? "No voices. Add one in Settings." : "Pick a voice"}
        options={mine.map((one) => ({ value: one.voiceId, label: one.name }))}
        problem={problem?.(`${field}.voice.voice`)}
        onPick={(picked) => onChange({ ...speaker, voice: { ...voice, voice: picked } })}
      />
      {language === undefined ? null : (
        <VoiceLanguageNote
          language={language}
          voice={ofProvider.find((one) => one.voiceId === voice.voice)}
          hidden={byLanguage.hidden}
          showAll={byLanguage.showAll}
          onShowAll={byLanguage.setShowAll}
        />
      )}
      <OptionPicker
        field={`${field}.pace`}
        label="Pace"
        tip="play.speaker.pace"
        value={String(speaker.pace ?? 1)}
        placeholder="Pick a pace"
        options={paceSteps.map((step) => ({
          value: String(step),
          label: step === 1 ? "Normal" : `${String(step)}×`,
        }))}
        problem={problem?.(`${field}.pace`)}
        onPick={(pace) => {
          const { pace: _old, ...rest } = speaker;
          onChange(Number(pace) === 1 ? rest : { ...rest, pace: Number(pace) });
        }}
      />
      <details className="col-span-full text-small" {...helpScope}>
        <summary className="flex min-h-8 cursor-pointer items-center gap-2 text-ink-2">
          Pronunciations for {speaker.name.trim() || "this speaker"}
          {speaker.pronunciations?.trim() ? " · set" : ""}
          <InfoTip id="play.speaker.pronunciations" />
        </summary>
        <Textarea
          rows={3}
          aria-label={`Pronunciations for ${speaker.name.trim() || "this speaker"}`}
          value={speaker.pronunciations ?? ""}
          placeholder="Arda: /ˈɑɹdə/"
          onChange={(event) => {
            const { pronunciations: _old, ...rest } = speaker;
            onChange(
              event.target.value === "" ? rest : { ...rest, pronunciations: event.target.value },
            );
          }}
        />
      </details>
      {skipped.length === 0 ? null : (
        <Callout
          tone="waiting"
          className="col-span-full"
          title={`${String(skipped.length)} ${skipped.length === 1 ? "pronunciation" : "pronunciations"} for ${name} ${skipped.length === 1 ? "is" : "are"} skipped`}
        >
          <ul>
            {skipped.map((row) => (
              <li key={row.row}>
                Entry {row.row}: {row.reason}.
              </li>
            ))}
          </ul>
          <p>
            Those words are read as ordinary text; the other entries are used. Fix them in
            Pronunciations for {name} above: one <code>Term: /IPA/</code> per line.
          </p>
        </Callout>
      )}
      <div className="col-span-full flex flex-wrap items-center gap-3">
        <Audition speaker={speaker} line={line} />
        <span className="flex-1" />
        {onRemove === undefined ? null : (
          <Button type="button" variant="quiet" onClick={onRemove}>
            Remove {speaker.name.trim() || "speaker"}
          </Button>
        )}
        <RowMenu
          name={speaker.name.trim() || `speaker ${String(index + 1)}`}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          onDuplicate={onDuplicate}
        />
      </div>
    </li>
  );
}

const money = { format: usd };

// One short line in the speaker's voice, priced before it is asked for and spoken only on the
// click. The status line is always there, so the row does not move when it fills.
function Audition({
  speaker,
  line,
}: {
  readonly speaker: Speaker;
  readonly line: string;
}): ReactElement {
  const { api } = useApp();
  const { provider, model, voice } = speaker.voice;
  const ready = provider !== "" && model !== "" && voice !== "";
  const quote = useQuery({
    queryKey: ["audition-quote", provider, model, line],
    queryFn: () =>
      quoteAuditions(api, [
        { speaker: speaker.name.trim() || "Speaker", provider, model, text: line },
      ]),
    enabled: ready,
    staleTime: 60_000,
  });
  const [url, setUrl] = useState<string | undefined>(undefined);
  useEffect(
    () => () => {
      if (url !== undefined) URL.revokeObjectURL(url);
    },
    [url],
  );
  const speak = useMutation({
    mutationFn: () => speakAudition(api, { provider, model, voice, text: line }),
    onSuccess: (blob) => {
      const next = URL.createObjectURL(blob);
      setUrl(next);
      void new Audio(next).play().catch(() => {});
    },
  });
  const estimate = quote.data?.estimate;
  const price =
    estimate === undefined || estimate === null
      ? undefined
      : estimate.unknown > 0
        ? "price unknown"
        : `about ${money.format(estimate.high)}`;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-3">
      <span className="inline-flex items-center gap-1">
        <Button
          type="button"
          disabled={!ready || speak.isPending}
          onClick={() => speak.mutate()}
          title={`Reads: ${line}`}
        >
          {speak.isPending ? "Speaking…" : `Audition${price === undefined ? "" : ` · ${price}`}`}
        </Button>
        <InfoTip id="play.speaker.audition" />
      </span>
      <span className="min-h-5 text-label text-ink-2" aria-live="polite">
        {!ready
          ? "Pick a provider, model and voice to audition."
          : speak.error !== null
            ? speak.error.message
            : url !== undefined
              ? "Playing the audition."
              : `Reads their first line: “${line.length > 60 ? `${line.slice(0, 60)}…` : line}”`}
      </span>
    </div>
  );
}
