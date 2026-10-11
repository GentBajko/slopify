import {
  defaultSentencePauseSeconds,
  pauseSecondsMax,
  pauseSecondsStep,
} from "@app/slices/narration/pauses-model.js";
import { type ReactElement, useId } from "react";
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
        tip="project.pause.sentence"
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
        tip="project.pause.paragraph"
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
      tip="project.remove-breaths"
      line="Turns the audible breaths between sentences down. Words and timing stay the same."
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
      tip="project.soften-s"
      line="Takes the sharp edge off s and sh sounds; very light, the voice keeps its brightness."
    />
  );
}

function CleanSwitch({
  value,
  onChange,
  label,
  tip,
  line,
}: {
  readonly value: boolean;
  readonly onChange: (next: boolean) => void;
  readonly label: string;
  readonly tip: "project.remove-breaths" | "project.soften-s";
  readonly line: string;
}): ReactElement {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <Switch
        checked={value}
        label={label}
        tip={tip}
        describedBy={`${id}-line`}
        onChange={onChange}
      />
      <p id={`${id}-line`} className="m-0 text-label text-ink-3">
        {line}
      </p>
    </div>
  );
}

// Typed text as seconds, or undefined while it is not a number.
export function typedSeconds(text: string): number | undefined {
  const trimmed = text.trim().replace(",", ".");
  if (trimmed === "") return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : undefined;
}
