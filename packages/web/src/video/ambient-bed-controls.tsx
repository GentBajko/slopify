import {
  type AmbientBedField,
  type AmbientBedForm,
  type AmbientBedSource,
  ambientBedLabels,
  ambientFadeMax,
  ambientLevelMax,
  ambientLevelMin,
  ambientTailMax,
  defaultAmbientBed,
} from "@app/slices/video/ambient-bed.js";
import type { ReactElement, ReactNode } from "react";
import { Field, Input, Select } from "@/components/kit/field";

const help =
  "Rain, a fireplace or wind, made on this computer, or your own audio file, under the whole narration of the long video. It dips while the narrator speaks, fades in at the start and keeps playing for the tail after the narration ends; a tail longer than the silence at the end makes the video that much longer. Shorts don't get it.";

// The ambient bed's settings: Play's (with None and My own file) and the channel brand kit's
// (the built-in beds only). `value` undefined is the inherited choice `inherit` names: the
// channel's bed on Play, nothing on the channel. The numbers stay as typed; the shared rule's
// words come back through `problem`.
export function AmbientBedControls({
  value,
  inherit,
  sources,
  offerNone,
  problem,
  file,
  fieldPrefix = "ambientBed",
  onChange,
}: {
  readonly value: AmbientBedForm | undefined;
  readonly inherit: string;
  readonly sources: readonly AmbientBedSource[];
  readonly offerNone: boolean;
  readonly problem: (field: AmbientBedField | "file") => string | undefined;
  // The upload control for My own file.
  readonly file?: ReactNode;
  readonly fieldPrefix?: string;
  readonly onChange: (next: AmbientBedForm | undefined) => void;
}): ReactElement {
  const playing = value !== undefined && value.source !== "none";
  const numbers = {
    level: value?.level ?? String(defaultAmbientBed.levelDb),
    fadeIn: value?.fadeIn ?? String(defaultAmbientBed.fadeInSeconds),
    tail: value?.tail ?? String(defaultAmbientBed.tailSeconds),
  };
  const pick = (picked: string): void => {
    if (picked === "") onChange(undefined);
    else if (picked === "none") onChange({ source: "none", ...numbers });
    else {
      const source = sources.find((one) => one === picked);
      if (source !== undefined) onChange({ source, ...numbers });
    }
  };
  const number = (
    field: "level" | "fadeIn" | "tail",
    label: string,
    hint: string,
  ): ReactElement | null =>
    value === undefined || !playing ? null : (
      <Field label={label} help={hint} error={problem(field)}>
        <Input
          data-play-field={`${fieldPrefix}.${field}`}
          type="text"
          inputMode="decimal"
          className="w-[90px] tabular-nums"
          value={value[field]}
          onChange={(event) => onChange({ ...value, [field]: event.target.value })}
        />
      </Field>
    );
  return (
    <div className="grid min-w-0 grid-cols-1 gap-3">
      <Field label="Ambient sound" help={help} error={problem("source")}>
        <Select
          data-play-field={`${fieldPrefix}.source`}
          className="w-auto min-w-[180px]"
          value={value?.source ?? ""}
          onChange={(event) => pick(event.target.value)}
        >
          <option value="">{inherit}</option>
          {offerNone ? <option value="none">None</option> : null}
          {sources.map((source) => (
            <option key={source} value={source}>
              {ambientBedLabels[source]}
            </option>
          ))}
        </Select>
      </Field>
      {value?.source === "upload" ? file : null}
      {playing ? (
        <div className="flex min-w-0 flex-wrap gap-4">
          {number(
            "level",
            "Level (dB)",
            `${String(ambientLevelMin)} to ${String(ambientLevelMax)}; 0 is about as loud as the voice.`,
          )}
          {number("fadeIn", "Fade in (seconds)", `0 to ${String(ambientFadeMax)}.`)}
          {number(
            "tail",
            "Tail after the narration (seconds)",
            `0 to ${String(ambientTailMax)}, fading out.`,
          )}
        </div>
      ) : null}
    </div>
  );
}
