import type { Prompt, PromptKind } from "@app/slices/library/model.js";
import {
  defaultShorts,
  defaultShortsPromptName,
  shortsCountMax,
  shortsCountMin,
  shortsSecondsMax,
  shortsSecondsMin,
} from "@app/slices/shorts/model.js";
import { type ReactElement, useId } from "react";
import { InfoTip } from "@/components/kit/info-tip";
import { Input } from "@/components/ui/input";
import { Picker } from "@/components/ui/picker";
import type { ShortsForm } from "@/play/state";

const help =
  "After subtitle timing, the text model picks the best self-contained moments of the narration. Each becomes a vertical 1080×1920 clip with new images, big word-by-word captions, and its own title, description and hashtags. It runs beside the render; the images are charged like any other.";

// The Shorts settings as a form edits them: the draft's own shape, numbers as typed.
export const freshShorts: ShortsForm = {
  enabled: false,
  count: String(defaultShorts.count),
  minSeconds: String(defaultShorts.minSeconds),
  maxSeconds: String(defaultShorts.maxSeconds),
  prompt: "",
  imagePrompt: "",
};

// The Video stage's Shorts step, on Play and in Edit project, beside the YouTube description.
// Every control stays mounted: without narration the switch is disabled rather than removed,
// and so is the rest while the switch is off.
export function Shorts({
  value,
  prompts,
  narrated,
  problem,
  onChange,
}: {
  readonly value: ShortsForm;
  readonly prompts: readonly Prompt[];
  readonly narrated: boolean;
  readonly problem?: ((field: string) => string | undefined) | undefined;
  readonly onChange: (next: ShortsForm) => void;
}): ReactElement {
  const id = useId();
  const on = value.enabled;
  const issue = (["enabled", "count", "minSeconds", "maxSeconds", "prompt", "imagePrompt"] as const)
    .map((field) => problem?.(`shorts.${field}`))
    .find((message) => message !== undefined);
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
