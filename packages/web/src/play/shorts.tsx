import type { Prompt, PromptKind } from "@app/slices/library/model.js";
import {
  defaultMusicVolume,
  defaultShorts,
  defaultShortsPromptName,
  fullVideoLinkMax,
  shortsCountMax,
  shortsCountMin,
  shortsSecondsMax,
  shortsSecondsMin,
  shortsSpeedMax,
  shortsSpeedMin,
  shortsSpeedStep,
} from "@app/slices/shorts/model.js";
import { type ReactElement, type ReactNode, useId, useState } from "react";
import { Input } from "@/components/kit/field";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import { Picker } from "@/components/ui/picker";
import type { HelpId } from "@/help/catalog";
import type { ShortsForm } from "@/play/state";
import type { StylePreviewSettings } from "@/video/style-preview";
import { GridField } from "./grid-field";

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

// What the Shorts preview renders: the sample as a short in the caption font, with the title
// and the speed as set. A speed not yet chosen or out of range previews at normal speed.
export function shortsPreviewOf(value: ShortsForm, fontId: string): StylePreviewSettings {
  const speed = Number(value.speed);
  return {
    format: "9:16",
    subtitles: { mode: "burn-in", fontId, fontSize: 48, position: "bottom" },
    shorts: {
      titleOnScreen: value.titleOnScreen === true,
      ...(Number.isFinite(speed) && speed >= shortsSpeedMin && speed <= shortsSpeedMax
        ? { speed }
        : {}),
    },
  };
}

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
  preview,
  onChange,
}: {
  readonly value: ShortsForm;
  readonly prompts: readonly Prompt[];
  readonly narrated: boolean;
  readonly problem?: ((field: string) => string | undefined) | undefined;
  readonly music?: ReactNode;
  // The attached music file's name, which the closed disclosure's summary names.
  readonly musicName?: string | undefined;
  // The Shorts preview, shown in the open disclosure while Shorts is on; mounted only then,
  // since each change renders a few seconds of video.
  readonly preview?: ReactNode;
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
      className="sl-input--number"
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
    <div className="col-span-full sl-fields">
      <span className="sl-fields__wide flex items-center gap-1" {...helpScope}>
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
            aria-describedby={issue ? `${id}-error` : undefined}
            className="size-4 accent-accent"
            onChange={(event) => onChange({ ...value, enabled: event.currentTarget.checked })}
          />
          Shorts
        </label>
        <InfoTip id="play.shorts" />
      </span>
      <GridField htmlFor={`${id}-count`} label="How many" tip="play.shorts.count">
        {number("count", "How many shorts", shortsCountMin, shortsCountMax)}
      </GridField>
      <GridField htmlFor={`${id}-minSeconds`} label="Length" tip="play.shorts.length">
        {number("minSeconds", "Shortest short, in seconds", shortsSecondsMin, shortsSecondsMax)}
        <span aria-hidden="true">to</span>
        {number("maxSeconds", "Longest short, in seconds", shortsSecondsMin, shortsSecondsMax)}
        <span className="text-ink-3">seconds</span>
      </GridField>
      <PromptPicker
        id={`${id}-prompt`}
        field="shorts.prompt"
        label="Shorts prompt"
        tip="play.shorts.prompt"
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
        tip="play.shorts.image-style"
        kind="image"
        value={value.imagePrompt}
        prompts={prompts}
        disabled={!on}
        onChange={(imagePrompt) => onChange({ ...value, imagePrompt })}
      />
      {issue ? (
        <p id={`${id}-error`} className="sl-fields__wide m-0 text-small text-danger">
          {issue}
        </p>
      ) : !narrated ? (
        <p className="sl-fields__wide m-0 text-label text-ink-3">Needs narration.</p>
      ) : null}
      <details
        className="sl-fields__wide rounded-control border border-line px-3"
        open={open || moreIssue !== undefined || musicIssue !== undefined}
        onToggle={(event) => setOpen(event.currentTarget.open)}
      >
        <summary className="flex min-h-9 cursor-pointer items-center text-small text-ink-2">
          More shorts options · {summary}
        </summary>
        <div className="sl-fields pt-2 pb-3">
          <span className="flex items-center gap-1" {...helpScope}>
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
            </label>
            <InfoTip id="play.shorts.title-on-screen" />
          </span>
          <GridField htmlFor={`${id}-speed`} label="Speed" tip="play.shorts.speed">
            <Picker
              id={`${id}-speed`}
              data-play-field="shorts.speed"
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
          </GridField>
          <GridField htmlFor={`${id}-volume`} label="Music volume" tip="play.shorts.music-volume">
            <Input
              id={`${id}-volume`}
              data-play-field="shorts.musicVolume"
              type="text"
              inputMode="numeric"
              title="0-100"
              placeholder={String(defaultMusicVolume)}
              aria-invalid={problem?.("shorts.musicVolume") !== undefined}
              className="sl-input--number"
              disabled={!on}
              value={volume}
              onChange={(event) => onChange({ ...value, musicVolume: event.target.value })}
            />
            <span className="text-ink-3">%</span>
          </GridField>
          <GridField
            htmlFor={`${id}-link`}
            label="Full video link"
            tip="play.shorts.full-video-link"
          >
            <Input
              id={`${id}-link`}
              data-play-field="shorts.fullVideoLink"
              type="url"
              inputMode="url"
              maxLength={fullVideoLinkMax}
              placeholder="https://youtu.be/…"
              aria-invalid={problem?.("shorts.fullVideoLink") !== undefined}
              disabled={!on}
              value={value.fullVideoLink ?? ""}
              onChange={(event) => onChange({ ...value, fullVideoLink: event.target.value })}
            />
          </GridField>
          <div className="sl-fields__wide">{music}</div>
          {open && on && preview !== undefined ? (
            <div className="sl-fields__wide">{preview}</div>
          ) : null}
          {moreIssue ? (
            <p role="alert" className="sl-fields__wide m-0 text-small text-danger">
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
  tip,
  kind,
  value,
  prompts,
  disabled,
  onChange,
}: {
  readonly id: string;
  readonly field: string;
  readonly label: string;
  readonly tip: HelpId;
  readonly kind: PromptKind;
  readonly value: string;
  readonly prompts: readonly Prompt[];
  readonly disabled: boolean;
  readonly onChange: (name: string) => void;
}): ReactElement {
  const choices = prompts.filter((one) => one.kind === kind);
  const saved = value !== "" && !choices.some((one) => one.name === value);
  return (
    <GridField htmlFor={id} label={label} tip={tip}>
      <Picker
        id={id}
        data-play-field={field}
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
    </GridField>
  );
}
