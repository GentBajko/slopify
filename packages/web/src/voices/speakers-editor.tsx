import type { ProviderStatus } from "@app/slices/settings/model.js";
import { auditionLine } from "@app/slices/voices/audition.js";
import { castHosts, speakerFromCast } from "@app/slices/voices/cast.js";
import {
  bookChapterMax,
  bookTitleMax,
  defaultVoicesSettings,
  type Speaker,
  type SpeakerRole,
  speakerNameMax,
  speakersMax,
  turnGapSteps,
  type VoiceFormat,
  type VoicesSettings,
  voiceFormatLabels,
  voiceFormats,
} from "@app/slices/voices/model.js";
import { parseScript } from "@app/slices/voices/script.js";
import { type ReactElement, useMemo } from "react";
import type { Voice } from "@/api";
import type { CastMember } from "@/channels/api";
import { Button } from "@/components/kit/button";
import { Field, Input } from "@/components/kit/field";
import { Switch } from "@/components/kit/switch";
import { OptionPicker } from "@/play/pickers";
import { copyName, moveItem } from "./row-order.js";
import { SpeakerSelectionBar, useSpeakerRemoval } from "./speaker-removal.js";
import { SpeakerRow } from "./speaker-row.js";

// Multiple voices, the same control on Play and in Edit project: the format, where the script
// comes from, and the speakers with their voices, pace, pronunciations and an Audition button.
// Narration (no speakers) is the format every run had before, and choosing it removes the
// settings entirely so nothing about such a run changes.

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
  // The project language. It filters each speaker's voice list and decides which IPA a
  // speaker's pronunciations may use. Absent (a caller that doesn't know it) lists every voice
  // and checks only what no language accepts, so a French project's rows are never reported
  // for sounds English lacks.
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
        ? // A new podcast or interview starts with the channel's hosts.
          defaultVoicesSettings(next, castHosts(cast))
        : {
            ...value,
            format: next,
            // An audiobook can split the article; the talking formats can adapt it.
            source:
              next === "audiobook"
                ? value.source === "adapt"
                  ? "script"
                  : value.source
                : value.source === "adapt"
                  ? "adapt"
                  : "script",
          },
    );
  };
  const set = (patch: Partial<VoicesSettings>): void => {
    if (value !== undefined) onChange({ ...value, ...patch });
  };
  const removal = useSpeakerRemoval(value, onChange);
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
          tip="play.speakers.format"
          value={value?.format ?? ""}
          placeholder="Narration (one voice)"
          options={voiceFormats.map((format) => ({
            value: format,
            label: voiceFormatLabels[format],
          }))}
          problem={problem?.("voices.format")}
          onPick={pick}
        />
        {value === undefined ? null : (
          <OptionPicker
            field="voices.source"
            label="Script"
            tip="play.speakers.script"
            value={value.source}
            placeholder="Pick where the script comes from"
            options={[
              { value: "script", label: "Write a script (Script prompt)" },
              value.format === "audiobook"
                ? { value: "attribute", label: "Split the article into speakers" }
                : { value: "adapt", label: "Adapt the article into a conversation" },
            ]}
            problem={problem?.("voices.source")}
            onPick={(source) =>
              set({
                source:
                  source === "attribute" ? "attribute" : source === "adapt" ? "adapt" : "script",
              })
            }
          />
        )}
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
              : value.source === "adapt"
                ? "The article is written or pasted as usual and stays as it is; the text model then rewrites it as a conversation for the speakers to read."
                : "The article is written or pasted as usual; the text model then hands its narration and dialogue to the speakers."}
          </p>
          {problem?.("voices.speakers") === undefined ? null : (
            <p className="text-label text-danger">{problem("voices.speakers")}</p>
          )}
          <SpeakerSelectionBar removal={removal} total={value.speakers.length} />
          <ol
            aria-label="Speakers"
            className="divide-y divide-line border-y border-line"
            onKeyDown={removal.selection?.onKeyDown}
          >
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
                selection={removal.selection}
                onRemove={
                  value.speakers.length > 1 ? () => removal.remove([speaker.id]) : undefined
                }
                onMoveUp={
                  index > 0
                    ? () => set({ speakers: moveItem(value.speakers, index, -1) })
                    : undefined
                }
                onMoveDown={
                  index < value.speakers.length - 1
                    ? () => set({ speakers: moveItem(value.speakers, index, 1) })
                    : undefined
                }
                onDuplicate={
                  value.speakers.length < speakersMax
                    ? () => set({ speakers: withCopy(value.speakers, index) })
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
              tip="play.speakers.add-from-cast"
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
              tip="play.speakers.turn-gap"
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
              tip="play.speakers.name-tags"
              checked={value.nameTags}
              onChange={(nameTags) => set({ nameTags })}
            />
            <Switch
              label="One request for consecutive turns where the voice provider can (ElevenLabs v3, Gemini)"
              tip="play.speakers.native-dialogue"
              checked={value.nativeDialogue}
              onChange={(nativeDialogue) => set({ nativeDialogue })}
            />
            <Switch
              label="Also make MP3 and M4B files with chapter markers"
              tip="play.speakers.audio-files"
              checked={value.audioFiles}
              onChange={(audioFiles) => set({ audioFiles })}
            />
          </div>
          {value.format === "audiobook" ? (
            <BookFields value={value} onChange={onChange} problem={problem} />
          ) : null}
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

// An audiobook can be a chapter of a book: its MP3 and M4B are tagged with the book and the
// chapter, and a finished chapter offers Make the next chapter.
function BookFields({
  value,
  onChange,
  problem,
}: {
  readonly value: VoicesSettings;
  readonly onChange: (next: VoicesSettings) => void;
  readonly problem?: ((field: string) => string | undefined) | undefined;
}): ReactElement {
  const book = value.book;
  const set = (patch: Partial<VoicesSettings>): void => onChange({ ...value, ...patch });
  return (
    <div className="flex flex-col gap-3">
      <Switch
        label="A chapter of a book"
        tip="play.speakers.book"
        checked={book !== undefined}
        onChange={(on) => {
          if (on) set({ book: { title: "", chapter: 1 } });
          else {
            const { book: _book, ...rest } = value;
            onChange(rest);
          }
        }}
      />
      {book === undefined ? null : (
        <div className="grid grid-cols-1 gap-3 min-[700px]:grid-cols-[minmax(0,1fr)_160px]">
          <Field
            label="Book title"
            tip="play.speakers.book-title"
            error={problem?.("voices.book.title")}
          >
            <Input
              value={book.title}
              maxLength={bookTitleMax}
              onChange={(event) => set({ book: { ...book, title: event.target.value } })}
            />
          </Field>
          <Field
            label="Chapter"
            tip="play.speakers.book-chapter"
            error={problem?.("voices.book.chapter")}
          >
            <Input
              type="number"
              min={1}
              max={bookChapterMax}
              step={1}
              value={book.chapter === 0 ? "" : String(book.chapter)}
              onChange={(event) =>
                set({ book: { ...book, chapter: Number(event.target.value) || 0 } })
              }
            />
          </Field>
        </div>
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

// A copy of a speaker just under it: the same role, voice, pace and pronunciations under a new
// id and name. It is not tied to the cast member the original came from.
function withCopy(speakers: readonly Speaker[], index: number): Speaker[] {
  const original = speakers[index];
  if (original === undefined) return [...speakers];
  const { castId: _cast, portrait: _portrait, ...rest } = original;
  const fresh = newSpeaker(speakers);
  const copy: Speaker = {
    ...rest,
    id: fresh.id,
    name: copyName(
      original.name,
      speakers.map((one) => one.name),
      speakerNameMax,
    ),
  };
  return [...speakers.slice(0, index + 1), copy, ...speakers.slice(index + 1)];
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

export function voiceFormatLabel(format: VoiceFormat | undefined): string {
  return format === undefined ? "Narration" : voiceFormatLabels[format];
}
