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
import type { HelpId } from "@/help/catalog";
import { ResetToDefault } from "./reset-to-default";

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
    tip: HelpId,
  ): ReactElement | null =>
    value === undefined || !playing ? null : (
      <Field label={label} help={hint} tip={tip} error={problem(field)}>
        <Input
          data-play-field={`${fieldPrefix}.${field}`}
          type="text"
          inputMode="decimal"
          className="sl-input--number"
          value={value[field]}
          onChange={(event) => onChange({ ...value, [field]: event.target.value })}
        />
        {field === "level" ? (
          <ResetToDefault
            changed={value.level.trim() !== String(defaultAmbientBed.levelDb)}
            defaultText={`${String(defaultAmbientBed.levelDb)} dB`}
            label="ambient level"
            onReset={() => onChange({ ...value, level: String(defaultAmbientBed.levelDb) })}
          />
        ) : null}
      </Field>
    );
  return (
    <div className="sl-fields">
      <Field label="Ambient sound" tip="project.ambient.source" error={problem("source")}>
        <Select
          data-play-field={`${fieldPrefix}.source`}
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
        // Its numbers are cells of the same field grid.
        <div className="contents">
          {number(
            "level",
            "Level (dB)",
            `${String(ambientLevelMin)} to ${String(ambientLevelMax)}; 0 is about as loud as the voice.`,
            "project.ambient.level",
          )}
          {number(
            "fadeIn",
            "Fade in (seconds)",
            `0 to ${String(ambientFadeMax)}.`,
            "project.ambient.fade-in",
          )}
          {number(
            "tail",
            "Tail after the narration (seconds)",
            `0 to ${String(ambientTailMax)}, fading out.`,
            "project.ambient.tail",
          )}
        </div>
      ) : null}
    </div>
  );
}
