import type { Prompt } from "@app/slices/library/model.js";
import { type ReactElement, useId } from "react";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import { TextLink } from "@/components/kit/link";
import { Picker } from "@/components/ui/picker";

export function NarrationPreparation({
  value,
  prompts,
  supported,
  error,
  libraryLinks = true,
  onChange,
}: {
  readonly value: string;
  readonly prompts: readonly Prompt[];
  readonly supported: boolean;
  readonly error?: string | undefined;
  readonly libraryLinks?: boolean;
  readonly onChange: (value: string) => void;
}): ReactElement {
  const id = useId();
  const choices = prompts.filter((prompt) => prompt.kind === "narration");
  const selected = choices.find((prompt) => prompt.name === value);
  const issue =
    error ??
    (value !== "" && !supported ? "Choose Inworld TTS-2 or turn preparation Off." : undefined);
  return (
    <div className="col-span-full min-w-0 space-y-2" {...helpScope}>
      <span className="flex items-center gap-1">
        <label htmlFor={id} className="sl-field__label">
          Narration Preparation
        </label>
        <InfoTip id="play.narration-preparation" />
      </span>
      <Picker
        id={id}
        data-play-field="narrationPrompt"
        value={value}
        aria-describedby={issue ? `${id}-error` : undefined}
        aria-invalid={issue === undefined ? undefined : true}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Off</option>
        {value !== "" && selected === undefined ? (
          <option value={value}>{value} (saved selection)</option>
        ) : null}
        {choices.map((prompt) => (
          <option key={prompt.id} value={prompt.name}>
            {prompt.name}
          </option>
        ))}
      </Picker>
      {issue ? (
        <p id={`${id}-error`} className="text-small text-danger">
          {issue}
        </p>
      ) : (
        <p className="m-0 text-small text-ink-2">
          Adds delivery directions, such as a sigh or a laugh, before the voice reads. The words
          stay the same.
        </p>
      )}
      {libraryLinks ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-small">
          {selected ? (
            <TextLink to="/prompts/$promptId" params={{ promptId: selected.id }}>
              View prompt ↗
            </TextLink>
          ) : null}
          <TextLink to="/prompts/new" search={{ kind: "narration" }}>
            New prompt ↗ (opens Prompts)
          </TextLink>
        </div>
      ) : null}
    </div>
  );
}
