import {
  dbOfLufs,
  dbOfPercent,
  defaultLoudness,
  type LoudnessTarget,
  loudnessDbMax,
  loudnessDbMin,
  lufsOfDb,
  percentOfDb,
  recommendedLufs,
  snapDb,
  truePeakOf,
} from "@app/slices/loudness/model.js";
import { type ReactElement, useId, useState } from "react";
import { Field, Input } from "@/components/kit/field";
import { Switch } from "@/components/kit/switch";
import type { HelpId } from "@/help/catalog";
import { ResetToDefault } from "./reset-to-default";

// Level the volume (`slices/loudness/model.ts`): the switch, and the two volumes it masters to,
// each typed as dB from the recommended level or as a percentage of it. One number is kept,
// the target in LUFS; the dB and the percentage are two ways of writing it. Play, Edit project
// and Settings → General draw the same controls.

export interface LoudnessValue {
  readonly enabled: boolean;
  readonly videoLufs: number;
  readonly audioFilesLufs: number;
}

export function LoudnessControls({
  value,
  onChange,
  problem,
  switchTip = "project.loudness",
  switchLabel = "Level the volume",
  defaults = defaultLoudness,
}: {
  readonly value: LoudnessValue;
  readonly onChange: (next: LoudnessValue) => void;
  // The server's words for a refused target, by field ("videoLufs", "audioFilesLufs").
  readonly problem?: ((field: "videoLufs" | "audioFilesLufs") => string | undefined) | undefined;
  readonly switchTip?: HelpId;
  readonly switchLabel?: string;
  // What Reset puts each volume back to: the recommended levels, or on Play the Settings ones.
  readonly defaults?: Pick<LoudnessValue, "videoLufs" | "audioFilesLufs">;
}): ReactElement {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-3">
      <Switch
        checked={value.enabled}
        label={switchLabel}
        tip={switchTip}
        onChange={(enabled) => onChange({ ...value, enabled })}
      />
      {value.enabled ? (
        <div className="sl-fields">
          <VolumeField
            target="video"
            label="Video volume"
            tip="project.loudness.video"
            lufs={value.videoLufs}
            defaultLufs={defaults.videoLufs}
            error={problem?.("videoLufs")}
            onChange={(videoLufs) => onChange({ ...value, videoLufs })}
          />
          <VolumeField
            target="audioFiles"
            label="Audio files volume"
            tip="project.loudness.audio-files"
            lufs={value.audioFilesLufs}
            defaultLufs={defaults.audioFilesLufs}
            error={problem?.("audioFilesLufs")}
            onChange={(audioFilesLufs) => onChange({ ...value, audioFilesLufs })}
          />
        </div>
      ) : null}
    </div>
  );
}

const rangeMessage = `Enter a volume between ${signed(loudnessDbMin)} dB and ${signed(loudnessDbMax)} dB (${String(percentOfDb(loudnessDbMin))}% to ${String(percentOfDb(loudnessDbMax))}%).`;

// A typed dB or percentage as the dB it stands for, snapped to the control's step; undefined
// for text that is not a number in range.
export function typedDb(text: string, unit: "db" | "percent"): number | undefined {
  const trimmed = text.trim().replace("−", "-").replace(",", ".");
  if (trimmed === "") return undefined;
  const number = Number(trimmed.replace(/(dB|%)$/i, "").trim());
  if (!Number.isFinite(number)) return undefined;
  if (unit === "percent" && number <= 0) return undefined;
  const db = unit === "db" ? number : dbOfPercent(number);
  // A little past the ends still reads as the end, so 158% is +4 dB and 32% is -10 dB.
  if (db < loudnessDbMin - 0.25 || db > loudnessDbMax + 0.25) return undefined;
  return snapDb(db);
}

function VolumeField({
  target,
  label,
  tip,
  lufs,
  defaultLufs,
  error,
  onChange,
}: {
  readonly target: LoudnessTarget;
  readonly label: string;
  readonly tip: HelpId;
  readonly lufs: number;
  readonly defaultLufs: number;
  readonly error: string | undefined;
  readonly onChange: (lufs: number) => void;
}): ReactElement {
  const id = useId();
  const db = dbOfLufs(lufs, target);
  // What is being typed, until the field is left; the other field follows every valid number.
  const [typed, setTyped] = useState<{ readonly unit: "db" | "percent"; readonly text: string }>();
  const local = typed === undefined || typedDb(typed.text, typed.unit) !== undefined;
  const type = (unit: "db" | "percent", text: string): void => {
    setTyped({ unit, text });
    const next = typedDb(text, unit);
    if (next !== undefined) onChange(lufsOfDb(next, target));
  };
  const dbText = typed?.unit === "db" ? typed.text : signed(db);
  const percentText = typed?.unit === "percent" ? typed.text : String(percentOfDb(db));
  return (
    <Field
      label={label}
      tip={tip}
      help={`0 dB is the recommended ${minus(recommendedLufs(target))} LUFS; this is ${minus(lufs)} LUFS. Peaks stay under ${minus(truePeakOf(target))} dBTP.`}
      error={local ? error : rangeMessage}
    >
      <span className="flex flex-wrap items-center gap-2 text-small">
        <Input
          type="text"
          inputMode="decimal"
          className="sl-input--number"
          data-play-field={`loudness.${target === "video" ? "videoLufs" : "audioFilesLufs"}`}
          value={dbText}
          onChange={(event) => type("db", event.target.value)}
          onBlur={() => setTyped(undefined)}
        />
        <span>dB</span>
        <Input
          id={`${id}-percent`}
          aria-label={`${label} as a percentage of the recommended level`}
          type="text"
          inputMode="decimal"
          className="sl-input--number"
          value={percentText}
          onChange={(event) => type("percent", event.target.value)}
          onBlur={() => setTyped(undefined)}
        />
        <span>%</span>
      </span>
      <ResetToDefault
        changed={Math.abs(lufs - defaultLufs) > 0.01}
        defaultText={`${signed(dbOfLufs(defaultLufs, target))} dB`}
        label={label.toLowerCase()}
        onReset={() => {
          setTyped(undefined);
          onChange(defaultLufs);
        }}
      />
    </Field>
  );
}

function signed(value: number): string {
  return value > 0 ? `+${String(value)}` : minus(value);
}

function minus(value: number): string {
  return String(value).replace("-", "−");
}
