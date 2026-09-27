import type { ProviderStatus } from "@app/slices/settings/model.js";
import { auditionLine } from "@app/slices/voices/audition.js";
import { speakerFromCast } from "@app/slices/voices/cast.js";
import {
  defaultVoicesSettings,
  paceSteps,
  type Speaker,
  type SpeakerRole,
  speakerRoles,
  speakersMax,
  turnGapSteps,
  type VoiceFormat,
  type VoicesSettings,
  voiceFormatLabels,
  voiceFormats,
} from "@app/slices/voices/model.js";
import { parseScript } from "@app/slices/voices/script.js";
import { useMutation, useQuery } from "@tanstack/react-query";
import { type ReactElement, useEffect, useMemo, useState } from "react";
import { quoteAuditions, speakAudition, type Voice } from "@/api";
import { useApp } from "@/app-context";
import type { CastMember } from "@/channels/api";
import { Button } from "@/components/kit/button";
import { Field, Input, Textarea } from "@/components/kit/field";
import { InfoTip } from "@/components/kit/info-tip";
import { Switch } from "@/components/kit/switch";
import { useVoicesForLanguage, VoiceLanguageNote } from "@/language/voice-language";
import { ModelPicker, OptionPicker, ProviderPicker } from "@/play/pickers";

// Multiple voices, the same control on Play and in Edit project: the format, where the script
// comes from, and the speakers with their voices, pace, pronunciations and an Audition button.
// Narration (no speakers) is the format every run had before, and choosing it removes the
// settings entirely so nothing about such a run changes.

const roleLabels: Readonly<Record<SpeakerRole, string>> = {
  narrator: "Narrator",
  host: "Host",
  guest: "Guest",
  character: "Character",
};

export function SpeakersEditor({
  value,
  onChange,
  providers,
  voices,
  script,
  problem,
  cast = [],
  language,
}: {
  // The channel's cast; members with a voice can be added as speakers.
  readonly cast?: readonly CastMember[] | undefined;
  // The project language each speaker's voice list is filtered by; absent lists every voice.
  readonly language?: string | undefined;
  readonly value: VoicesSettings | undefined;
  readonly onChange: (next: VoicesSettings | undefined) => void;
  readonly providers: readonly ProviderStatus[];
  readonly voices: readonly Voice[];
  // The script as written so far, for each speaker's audition line.
  readonly script?: string | undefined;
  readonly problem?: ((field: string) => string | undefined) | undefined;
}): ReactElement {
  const parsed = useMemo(() => {
    if (value === undefined || script === undefined || script.trim() === "") return undefined;
    const result = parseScript(script, value.speakers);
    return result.ok ? result.script : undefined;
  }, [script, value]);
  const pick = (format: string): void => {
    if (format === "") {
      onChange(undefined);
      return;
    }
    const next = voiceFormats.find((one) => one === format);
    if (next === undefined) return;
    onChange(
      value === undefined
        ? defaultVoicesSettings(next)
        : {
            ...value,
            format: next,
            source: next === "audiobook" ? value.source : "script",
          },
    );
  };
  const set = (patch: Partial<VoicesSettings>): void => {
    if (value !== undefined) onChange({ ...value, ...patch });
  };
  // Members with a voice who are not speakers yet.
  const voiced = cast.filter(
    (member) =>
      member.voice !== undefined &&
      !(value?.speakers ?? []).some((speaker) => speaker.castId === member.id),
  );
  const setSpeaker = (index: number, next: Speaker): void => {
    if (value === undefined) return;
    set({ speakers: value.speakers.map((one, at) => (at === index ? next : one)) });
  };

  return (
    <div className="col-span-full min-w-0 space-y-3" data-play-field="voices">
      <div className="grid grid-cols-1 gap-3 min-[700px]:grid-cols-2">
        <OptionPicker
          field="voices.format"
          label="Format"
          value={value?.format ?? ""}
          placeholder="Narration (one voice)"
          options={voiceFormats.map((format) => ({
            value: format,
            label: voiceFormatLabels[format],
          }))}
          problem={problem?.("voices.format")}
          onPick={pick}
        />
        {value?.format === "audiobook" ? (
          <OptionPicker
            field="voices.source"
            label="Script"
            value={value.source}
            placeholder="Pick where the script comes from"
            options={[
              { value: "script", label: "Write a script (Script prompt)" },
              { value: "attribute", label: "Split the article into speakers" },
            ]}
            problem={problem?.("voices.source")}
            onPick={(source) => set({ source: source === "attribute" ? "attribute" : "script" })}
          />
        ) : null}
      </div>
      {value === undefined ? (
        <p className="text-small text-ink-2">
          One voice reads the article. Pick a format for an audiobook, podcast, radio drama or
          interview with several speakers.
        </p>
      ) : (
        <>
          <p className="text-small text-ink-2">
            {value.source === "script"
              ? "The article prompt must be a Script prompt: the text model writes speaker turns, one `Name: words` paragraph each."
              : "The article is written or pasted as usual; the text model then hands its narration and dialogue to the speakers."}
          </p>
          {problem?.("voices.speakers") === undefined ? null : (
            <p className="text-label text-danger">{problem("voices.speakers")}</p>
          )}
          <ol aria-label="Speakers" className="divide-y divide-line border-y border-line">
            {value.speakers.map((speaker, index) => (
              <SpeakerRow
                key={speaker.id}
                index={index}
                speaker={speaker}
                line={auditionLine(speaker, parsed)}
                providers={providers}
                voices={voices}
                language={language}
                problem={problem}
                onChange={(next) => setSpeaker(index, next)}
                onRemove={
                  value.speakers.length > 1
                    ? () => set({ speakers: value.speakers.filter((_one, at) => at !== index) })
                    : undefined
                }
              />
            ))}
          </ol>
          <div className="flex flex-wrap items-end gap-3">
            <Button
              type="button"
              disabled={value.speakers.length >= speakersMax}
              onClick={() => set({ speakers: [...value.speakers, newSpeaker(value.speakers)] })}
            >
              Add speaker
            </Button>
            <OptionPicker
              label="Add from the cast"
              value=""
              placeholder={
                voiced.length === 0
                  ? "No cast member has a voice yet"
                  : `Pick one of ${String(voiced.length)}`
              }
              options={voiced.map((member) => ({ value: member.id, label: member.name }))}
              disabled={voiced.length === 0 || value.speakers.length >= speakersMax}
              problem={undefined}
              onPick={(id) => {
                const member = voiced.find((one) => one.id === id);
                if (member !== undefined)
                  set({
                    speakers: [...value.speakers, speakerFromCast(member, castRole(value))],
                  });
              }}
            />
            <OptionPicker
              field="voices.turnGapSeconds"
              label="Gap between turns"
              value={String(value.turnGapSeconds)}
              placeholder="Pick a gap"
              options={turnGapSteps.map((step) => ({ value: String(step), label: `${step} s` }))}
              problem={problem?.("voices.turnGapSeconds")}
              onPick={(gap) => set({ turnGapSeconds: Number(gap) })}
            />
          </div>
          <div className="flex flex-col items-start gap-2">
            <Switch
              label="Speaker names on captions"
              checked={value.nameTags}
              onChange={(nameTags) => set({ nameTags })}
            />
            <Switch
              label="One request for consecutive turns where the voice provider can (ElevenLabs v3)"
              checked={value.nativeDialogue}
              onChange={(nativeDialogue) => set({ nativeDialogue })}
            />
            <Switch
              label="Also make MP3 and M4B files with chapter markers"
              checked={value.audioFiles}
              onChange={(audioFiles) => set({ audioFiles })}
            />
          </div>
          {value.format === "podcast" || value.format === "interview" ? (
            <p className="text-small text-ink-2">
              The speaker panel (a tile per speaker, the one talking lit, their name below) is drawn
              with the captions: set Captions to Burn in under Style to see it in the video.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

// The role a cast member usually takes in the format.
function castRole(value: VoicesSettings): SpeakerRole {
  if (value.format === "podcast") return "host";
  if (value.format === "interview")
    return value.speakers.some((speaker) => speaker.role === "host") ? "guest" : "host";
  return value.speakers.some((speaker) => speaker.role === "narrator") ? "character" : "narrator";
}

function newSpeaker(speakers: readonly Speaker[]): Speaker {
  let n = speakers.length + 1;
  while (speakers.some((one) => one.id === `speaker-${String(n)}`)) n += 1;
  return {
    id: `speaker-${String(n)}`,
    name: `Speaker ${String(n)}`,
    role: "character",
    voice: { provider: "", model: "", voice: "" },
  };
}

function SpeakerRow({
  index,
  speaker,
  line,
  providers,
  voices,
  language,
  problem,
  onChange,
  onRemove,
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
}): ReactElement {
  const field = `voices.speakers.${String(index)}`;
  const voice = speaker.voice;
  const ofProvider = voices.filter((one) => one.provider === voice.provider);
  const byLanguage = useVoicesForLanguage(ofProvider, language, voice.voice || undefined);
  const mine = language === undefined ? ofProvider : byLanguage.listed;
  return (
    <li className="grid grid-cols-1 gap-3 py-3 min-[700px]:grid-cols-2" data-play-field={field}>
      <div className="flex min-w-0 items-end gap-2">
        <span
          aria-hidden="true"
          className="mb-2 size-3 shrink-0 rounded-full"
          style={{ background: `var(--color-speaker-${String((index % 6) + 1)})` }}
        />
        <Field label="Speaker name" error={problem?.(`${field}.name`)} className="min-w-0 flex-1">
          <Input
            value={speaker.name}
            maxLength={40}
            onChange={(event) => onChange({ ...speaker, name: event.target.value })}
          />
        </Field>
      </div>
      <OptionPicker
        label="Role"
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
        family="tts"
        providers={providers}
        value={voice.provider}
        problem={problem?.(`${field}.voice`)}
        onPick={(provider) => onChange({ ...speaker, voice: { provider, model: "", voice: "" } })}
      />
      <ModelPicker
        label="Voice model"
        provider={voice.provider}
        value={voice.model}
        problem={undefined}
        onPick={(model) => onChange({ ...speaker, voice: { ...voice, model } })}
      />
      <OptionPicker
        field={`${field}.voice.voice`}
        label="Voice"
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
      <details className="col-span-full text-small">
        <summary className="flex min-h-8 cursor-pointer items-center gap-2 text-ink-2">
          Pronunciations for {speaker.name.trim() || "this speaker"}
          {speaker.pronunciations?.trim() ? " · set" : ""}
          <InfoTip label="speaker pronunciations">
            <p>
              One <code>Term: /IPA/</code> per line, like the article's Pronunciation Glossary. Used
              for this speaker only, on Inworld TTS-2 voices, ahead of the glossary.
            </p>
          </InfoTip>
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
      <div className="col-span-full flex flex-wrap items-center gap-3">
        <Audition speaker={speaker} line={line} />
        <span className="flex-1" />
        {onRemove === undefined ? null : (
          <Button type="button" variant="quiet" onClick={onRemove}>
            Remove {speaker.name.trim() || "speaker"}
          </Button>
        )}
      </div>
    </li>
  );
}

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 4,
});

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
      <Button
        type="button"
        disabled={!ready || speak.isPending}
        onClick={() => speak.mutate()}
        title={`Reads: ${line}`}
      >
        {speak.isPending ? "Speaking…" : `Audition${price === undefined ? "" : ` · ${price}`}`}
      </Button>
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

export function voiceFormatLabel(format: VoiceFormat | undefined): string {
  return format === undefined ? "Narration" : voiceFormatLabels[format];
}
