import {
  defaultSentencePauseSeconds,
  pauseSecondsMax,
  pauseSecondsStep,
} from "@app/slices/narration/pauses-model.js";
import type { ReactElement } from "react";
import { Field, Input } from "@/components/kit/field";
import { Switch } from "@/components/kit/switch";

// Pauses between sentences and between paragraphs (`slices/narration/pauses-model.ts`), as
// typed: Play keeps the text on its draft, Edit project turns it into the config's numbers.

export type PauseField = "sentencePauseSeconds" | "paragraphPauseSeconds";

export function PauseControls({
  sentence,
  paragraph,
  problem,
  onChange,
}: {
  readonly sentence: string;
  readonly paragraph: string;
  readonly problem: (field: PauseField) => string | undefined;
  readonly onChange: (field: PauseField, text: string) => void;
}): ReactElement {
  const range = `0 to ${String(pauseSecondsMax)} in steps of ${String(pauseSecondsStep)}`;
  return (
    <div className="sl-fields">
      <Field
        label="Pause between sentences (seconds)"
        help={`${range}; ${String(defaultSentencePauseSeconds)} is the default. 0 leaves the voice's own.`}
        error={problem("sentencePauseSeconds")}
      >
        <Input
          type="text"
          inputMode="decimal"
          className="sl-input--number"
          data-play-field="sentencePauseSeconds"
          value={sentence}
          onChange={(event) => onChange("sentencePauseSeconds", event.target.value)}
        />
      </Field>
      <Field
        label="Pause between paragraphs (seconds)"
        help={`${range}; 0 (the default) keeps the sentence pause.`}
        error={problem("paragraphPauseSeconds")}
      >
        <Input
          type="text"
          inputMode="decimal"
          className="sl-input--number"
          data-play-field="paragraphPauseSeconds"
          value={paragraph}
          onChange={(event) => onChange("paragraphPauseSeconds", event.target.value)}
        />
      </Field>
    </div>
  );
}

// Soften breaths and Soften S sounds (`slices/narration/breaths-model.ts`), beside the pauses:
// Play keeps them on its draft, Edit project on the config, and both only while on.
export function SoftenBreathsSwitch({
  value,
  onChange,
}: {
  readonly value: boolean;
  readonly onChange: (next: boolean) => void;
}): ReactElement {
  return (
    <CleanSwitch
      value={value}
      onChange={onChange}
      label="Soften breaths"
      line="Turns the audible breaths between sentences down. Words and timing stay the same. Free, done on this computer."
    />
  );
}

export function SoftenSSwitch({
  value,
  onChange,
}: {
  readonly value: boolean;
  readonly onChange: (next: boolean) => void;
}): ReactElement {
  return (
    <CleanSwitch
      value={value}
      onChange={onChange}
      label="Soften S sounds"
      line="Takes the sharp edge off s and sh sounds; very light, the voice keeps its brightness. Free, done on this computer."
    />
  );
}

// Level each sentence (`slices/loudness/sentence-level.ts`), beside the softening: Play keeps it
// on its draft, Edit project on the config, and both only while on.
export function LevelSentencesSwitch({
  value,
  onChange,
}: {
  readonly value: boolean;
  readonly onChange: (next: boolean) => void;
}): ReactElement {
  return (
    <CleanSwitch
      value={value}
      onChange={onChange}
      label="Level each sentence"
      line="Holds each sentence to the ones around it, so no line jumps out or drops away. Needs Level the volume. Free, done on this computer."
    />
  );
}

// A switch whose line under it says what it does and that it costs nothing.
function CleanSwitch({
  value,
  onChange,
  label,
  line,
}: {
  readonly value: boolean;
  readonly onChange: (next: boolean) => void;
  readonly label: string;
  readonly line: string;
}): ReactElement {
  return <Switch checked={value} label={label} help={line} onChange={onChange} />;
}

// Typed text as seconds, or undefined while it is not a number.
export function typedSeconds(text: string): number | undefined {
  const trimmed = text.trim().replace(",", ".");
  if (trimmed === "") return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : undefined;
}
