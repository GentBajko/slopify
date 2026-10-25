import type { Prompt } from "@app/slices/library/model.js";
import { type ReactElement, useId, useState } from "react";
import { Button } from "@/components/kit/button";
import { HelpLine } from "@/components/kit/field";
import { helpScope } from "@/components/kit/info-tip";
import { TextLink } from "@/components/kit/link";
import { Picker } from "@/components/ui/picker";
import { NewPromptDrawer } from "./new-prompt-drawer";

// Narration preparation: a narration prompt the AI follows to add delivery directions before
// the voice reads, or Off. The line under the select says what it adds and costs, and what it
// needs; a refusal goes under that line.
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
  const [writing, setWriting] = useState(false);
  const choices = prompts.filter((prompt) => prompt.kind === "narration");
  const selected = choices.find((prompt) => prompt.name === value);
  const issue =
    error ??
    (value !== "" && !supported ? "Choose Inworld TTS-2 or turn preparation Off." : undefined);
  return (
    <div className="col-span-full min-w-0 space-y-2" {...helpScope}>
      <label htmlFor={id} className="sl-field__label">
        Narration preparation
      </label>
      <Picker
        id={id}
        data-play-field="narrationPrompt"
        value={value}
        aria-describedby={issue ? `${id}-help ${id}-error` : `${id}-help`}
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
      <HelpLine id={`${id}-help`}>
        Adds delivery directions, such as a sigh or a laugh, before the voice reads: one AI call per
        narration piece. Needs Inworld TTS-2. The words stay the same.
      </HelpLine>
      {issue ? (
        <p id={`${id}-error`} className="m-0 text-small text-danger">
          {issue}
        </p>
      ) : null}
      {libraryLinks ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-small">
          {selected ? (
            <TextLink to="/prompts/$promptId" params={{ promptId: selected.id }}>
              View prompt ↗
            </TextLink>
          ) : null}
          <Button variant="quiet" size="small" className="-my-1" onClick={() => setWriting(true)}>
            New narration prompt
          </Button>
          <NewPromptDrawer
            kind="narration"
            open={writing}
            onClose={() => setWriting(false)}
            onSaved={(saved) => {
              setWriting(false);
              onChange(saved.name);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
