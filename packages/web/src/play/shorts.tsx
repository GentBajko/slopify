import type { Prompt, PromptKind } from "@app/slices/library/model.js";
import {
  defaultMusicVolume,
  defaultShorts,
  defaultShortsPromptName,
  fullVideoLinkMax,
  fullVideoPlaceholder,
  shortsCountMax,
  shortsCountMin,
  shortsSecondsMax,
  shortsSecondsMin,
  shortsSpeedMax,
  shortsSpeedMin,
  shortsSpeedStep,
} from "@app/slices/shorts/model.js";
import { type ReactElement, type ReactNode, useId, useState } from "react";
import { InfoTip } from "@/components/kit/info-tip";
import { Input } from "@/components/ui/input";
import { Picker } from "@/components/ui/picker";
import type { ShortsForm } from "@/play/state";

const help =
  "After subtitle timing, the text model picks the best self-contained moments of the narration. Each becomes a vertical 1080×1920 clip with new images, big word-by-word captions, and its own title, description and hashtags. It runs beside the render; the images are charged like any other.";

// The Shorts settings as a form edits them: the draft's own shape, numbers as typed. A new
// form starts with the title on screen.
export const freshShorts: ShortsForm = {
  enabled: false,
  count: String(defaultShorts.count),
  minSeconds: String(defaultShorts.minSeconds),
  maxSeconds: String(defaultShorts.maxSeconds),
  prompt: "",
  imagePrompt: "",
  titleOnScreen: true,
};

// 1.00, 1.05 … 1.25: the speeds a short may play at.
const speeds = Array.from(
  { length: Math.round((shortsSpeedMax - shortsSpeedMin) / shortsSpeedStep) + 1 },
  (_value, at) => (shortsSpeedMin + at * shortsSpeedStep).toFixed(2),
);

const moreFields = ["titleOnScreen", "speed", "musicVolume", "fullVideoLink"] as const;

// The Video stage's Shorts step, on Play and in Edit project, beside the YouTube description.
// Every control stays mounted: without narration the switch is disabled rather than removed,
// and so is the rest while the switch is off. The title, speed, music and link sit in a
// "More shorts options" disclosure whose summary names what differs from the defaults, so the
// row stays one line; `music` is the music file's control: Play's draft attachment, or Edit
// project's upload.
export function Shorts({
  value,
  prompts,
  narrated,
  problem,
  music,
  musicName,
  onChange,
}: {
  readonly value: ShortsForm;
  readonly prompts: readonly Prompt[];
  readonly narrated: boolean;
  readonly problem?: ((field: string) => string | undefined) | undefined;
  readonly music?: ReactNode;
  // The attached music file's name, which the closed disclosure's summary names.
  readonly musicName?: string | undefined;
  readonly onChange: (next: ShortsForm) => void;
}): ReactElement {
  const id = useId();
  const on = value.enabled;
  const issue = (["enabled", "count", "minSeconds", "maxSeconds", "prompt", "imagePrompt"] as const)
    .map((field) => problem?.(`shorts.${field}`))
    .find((message) => message !== undefined);
  const moreIssue = moreFields
    .map((field) => problem?.(`shorts.${field}`))
    .find((message) => message !== undefined);
  // The music control says its own problem; the disclosure only opens for it.
  const musicIssue = problem?.("shorts.music");
  const [open, setOpen] = useState(false);
  const number = (
    field: "count" | "minSeconds" | "maxSeconds",
    label: string,
    min: number,
    max: number,
  ) => (
    <Input
      id={`${id}-${field}`}
      data-play-field={`shorts.${field}`}
      type="text"
      inputMode="numeric"
      aria-label={label}
      aria-invalid={problem?.(`shorts.${field}`) !== undefined}
      aria-describedby={issue ? `${id}-error` : undefined}
      title={`${String(min)}-${String(max)}`}
      className="w-[64px] tabular-nums"
      disabled={!on}
      value={value[field]}
      onChange={(event) => onChange({ ...value, [field]: event.target.value })}
    />
  );
  const speed = value.speed?.trim() ? value.speed : speeds[0];
  const volume = value.musicVolume ?? "";
  const summary = [
    value.titleOnScreen === true ? "Title on screen" : "No title on screen",
    speed === speeds[0] ? undefined : `${speed ?? ""}×`,
    musicName === undefined ? undefined : `Music: ${musicName}`,
    volume.trim() === "" || volume === String(defaultMusicVolume)
      ? undefined
      : `Music at ${volume}%`,
    value.fullVideoLink?.trim() ? "Full video linked" : undefined,
  ]
    .filter((part) => part !== undefined)
    .join(" · ");
  return (
    <div className="col-span-full flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
      <label
        htmlFor={`${id}-switch`}
        className="flex min-h-10 items-center gap-3 text-small font-semibold max-[1099px]:min-h-11"
      >
        <input
          id={`${id}-switch`}
          type="checkbox"
          data-play-field="shorts.enabled"
          checked={on}
          disabled={!narrated && !on}
          aria-describedby={`${id}-help${issue ? ` ${id}-error` : ""}`}
          className="size-4 accent-accent"
          onChange={(event) => onChange({ ...value, enabled: event.currentTarget.checked })}
        />
        Shorts
        <InfoTip label="Shorts">
          <p>{help}</p>
        </InfoTip>
      </label>
      <label htmlFor={`${id}-count`} className="flex items-center gap-2 text-small">
        How many
        {number("count", "How many shorts", shortsCountMin, shortsCountMax)}
      </label>
      <span className="flex items-center gap-2 text-small">
        <label htmlFor={`${id}-minSeconds`}>Length</label>
        {number("minSeconds", "Shortest short, in seconds", shortsSecondsMin, shortsSecondsMax)}
        <span aria-hidden="true">to</span>
        {number("maxSeconds", "Longest short, in seconds", shortsSecondsMin, shortsSecondsMax)}
        <span className="text-ink3">seconds</span>
      </span>
      <PromptPicker
        id={`${id}-prompt`}
        field="shorts.prompt"
        label="Shorts prompt"
        kind="shorts"
        value={value.prompt}
        prompts={prompts}
        disabled={!on}
        onChange={(prompt) => onChange({ ...value, prompt })}
      />
      <PromptPicker
        id={`${id}-image`}
        field="shorts.imagePrompt"
        label="Image style"
        kind="image"
        value={value.imagePrompt}
        prompts={prompts}
        disabled={!on}
        onChange={(imagePrompt) => onChange({ ...value, imagePrompt })}
      />
      <p id={`${id}-help`} className="sr-only">
        {help}
      </p>
      {issue ? (
        <p id={`${id}-error`} className="basis-full text-small text-red">
          {issue}
        </p>
      ) : !narrated ? (
        <p className="basis-full text-label text-ink3">Needs narration.</p>
      ) : null}
      <details
        className="basis-full rounded-control border border-line px-3"
        open={open || moreIssue !== undefined || musicIssue !== undefined}
        onToggle={(event) => setOpen(event.currentTarget.open)}
      >
        <summary className="flex min-h-9 cursor-pointer items-center text-small text-ink2">
          More shorts options · {summary}
        </summary>
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3 pt-2 pb-3">
          <label htmlFor={`${id}-title`} className="flex min-h-9 items-center gap-2 text-small">
            <input
              id={`${id}-title`}
              type="checkbox"
              data-play-field="shorts.titleOnScreen"
              checked={value.titleOnScreen === true}
              disabled={!on}
              className="size-4 accent-accent"
              onChange={(event) =>
                onChange({ ...value, titleOnScreen: event.currentTarget.checked })
              }
            />
            Title on screen
            <InfoTip label="Title on screen">
              <p>
                The short's title stays at the top for the whole clip, large and bold in the caption
                font, below where the apps draw their own buttons.
              </p>
            </InfoTip>
          </label>
          <label htmlFor={`${id}-speed`} className="flex items-center gap-2 text-small">
            Speed
            <Picker
              id={`${id}-speed`}
              data-play-field="shorts.speed"
              className="w-auto min-w-[88px]"
              value={speeds.includes(speed ?? "") ? speed : ""}
              aria-invalid={problem?.("shorts.speed") !== undefined}
              disabled={!on}
              onChange={(event) => onChange({ ...value, speed: event.target.value })}
            >
              {speeds.includes(speed ?? "") ? null : <option value="">Choose a speed</option>}
              {speeds.map((one) => (
                <option key={one} value={one}>
                  {one === speeds[0] ? "1.00× (normal)" : `${one}×`}
                </option>
              ))}
            </Picker>
          </label>
          <label htmlFor={`${id}-volume`} className="flex items-center gap-2 text-small">
            Music volume
            <Input
              id={`${id}-volume`}
              data-play-field="shorts.musicVolume"
              type="text"
              inputMode="numeric"
              title="0-100"
              placeholder={String(defaultMusicVolume)}
              aria-invalid={problem?.("shorts.musicVolume") !== undefined}
              className="w-[64px] tabular-nums"
              disabled={!on}
              value={volume}
              onChange={(event) => onChange({ ...value, musicVolume: event.target.value })}
            />
            <span className="text-ink3">%</span>
          </label>
          <label htmlFor={`${id}-link`} className="flex min-w-0 grow items-center gap-2 text-small">
            Full video link
            <Input
              id={`${id}-link`}
              data-play-field="shorts.fullVideoLink"
              type="url"
              inputMode="url"
              maxLength={fullVideoLinkMax}
              placeholder="https://youtu.be/…"
              aria-invalid={problem?.("shorts.fullVideoLink") !== undefined}
              className="min-w-[200px] flex-1"
              disabled={!on}
              value={value.fullVideoLink ?? ""}
              onChange={(event) => onChange({ ...value, fullVideoLink: event.target.value })}
            />
          </label>
          <p className="basis-full text-label text-ink3">
            Each short's description ends with a line to the full video; without a link it says{" "}
            {fullVideoPlaceholder} for you to fill in.
          </p>
          {music}
          {moreIssue ? (
            <p role="alert" className="basis-full text-small text-red">
              {moreIssue}
            </p>
          ) : null}
        </div>
      </details>
    </div>
  );
}

// One Library prompt of a kind, or Built-in; a name the Library no longer holds stays
// choosable as the saved choice, like the description's.
function PromptPicker({
  id,
  field,
  label,
  kind,
  value,
  prompts,
  disabled,
  onChange,
}: {
  readonly id: string;
  readonly field: string;
  readonly label: string;
  readonly kind: PromptKind;
  readonly value: string;
  readonly prompts: readonly Prompt[];
  readonly disabled: boolean;
  readonly onChange: (name: string) => void;
}): ReactElement {
  const choices = prompts.filter((one) => one.kind === kind);
  const saved = value !== "" && !choices.some((one) => one.name === value);
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-small">
      {label}
      <Picker
        id={id}
        data-play-field={field}
        className="w-auto min-w-[120px]"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{defaultShortsPromptName}</option>
        {saved ? <option value={value}>{value} (saved choice)</option> : null}
        {choices.map((one) => (
          <option key={one.id} value={one.name}>
            {one.name}
          </option>
        ))}
      </Picker>
    </label>
  );
}
