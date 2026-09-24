import type { Prompt } from "@app/slices/library/model.js";
import { Link } from "@tanstack/react-router";
import { type ReactElement, useId } from "react";
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
    <div className="col-span-full min-w-0 space-y-2">
      <label htmlFor={id} className="block text-small font-semibold">
        Narration Preparation
      </label>
      <Picker
        id={id}
        data-play-field="narrationPrompt"
        value={value}
        aria-describedby={`${id}-help${issue ? ` ${id}-error` : ""}`}
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
      <p id={`${id}-help`} className="text-small text-ink3">
        Optional. Uses the selected LLM once per narration chunk and entry. Supports Inworld TTS-2;
        the article and clean narration stay unchanged.
      </p>
      {issue ? (
        <p id={`${id}-error`} className="text-small text-red">
          {issue}
        </p>
      ) : null}
      {libraryLinks ? (
        <div className="flex gap-4 text-small">
          <Link to="/prompts/new" search={{ kind: "narration" }}>
            Create prompt
          </Link>
          {selected ? (
            <Link to="/prompts/$promptId" params={{ promptId: selected.id }}>
              View prompt
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
