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

// Remove breaths (`slices/narration/breaths-model.ts`), beside the pauses: Play keeps it on its
// draft, Edit project on the config, and both only while it is on.
export function RemoveBreathsSwitch({
  value,
  onChange,
}: {
  readonly value: boolean;
  readonly onChange: (next: boolean) => void;
}): ReactElement {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <Switch
        checked={value}
        label="Remove breaths"
        tip="project.remove-breaths"
        describedBy={`${id}-line`}
        onChange={onChange}
      />
      <p id={`${id}-line`} className="m-0 text-label text-ink-3">
        Mutes the audible breaths between sentences. Words and timing stay the same.
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
