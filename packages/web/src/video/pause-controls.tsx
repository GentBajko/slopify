import {
  defaultSentencePauseSeconds,
  pauseSecondsMax,
  pauseSecondsStep,
} from "@app/slices/narration/pauses-model.js";
import type { ReactElement } from "react";
import { Field, Input } from "@/components/kit/field";

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
    <div className="flex min-w-0 flex-wrap gap-4">
      <Field
        label="Pause between sentences (seconds)"
        tip="project.pause.sentence"
        help={`${range}; ${String(defaultSentencePauseSeconds)} is the default. 0 leaves the voice's own.`}
        error={problem("sentencePauseSeconds")}
      >
        <Input
          type="text"
          inputMode="decimal"
          className="w-[90px] tabular-nums"
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
          className="w-[90px] tabular-nums"
          data-play-field="paragraphPauseSeconds"
          value={paragraph}
          onChange={(event) => onChange("paragraphPauseSeconds", event.target.value)}
        />
      </Field>
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
