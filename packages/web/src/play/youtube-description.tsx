import type { Prompt } from "@app/slices/library/model.js";
import { defaultDescriptionPromptName } from "@app/slices/youtube/model.js";
import { type ReactElement, useId } from "react";
import { Picker } from "@/components/ui/picker";
import { GridField } from "./grid-field";
import { OutputTick } from "./output-tick";

// The Video stage's optional step, on Play's Outputs checklist and in Edit project: a tick, and
// the prompt once it is ticked. Without narration there is nothing to describe, so the tick is
// greyed with the reason under it.
export function YoutubeDescription({
  enabled,
  prompt,
  prompts,
  narrated,
  problem,
  onChange,
}: {
  readonly enabled: boolean;
  // The Description prompt's name; "" is the built-in one.
  readonly prompt: string;
  readonly prompts: readonly Prompt[];
  readonly narrated: boolean;
  readonly problem?: ((field: string) => string | undefined) | undefined;
  readonly onChange: (next: {
    readonly youtubeDescription: boolean;
    readonly descriptionPrompt: string;
  }) => void;
}): ReactElement {
  const id = useId();
  const choices = prompts.filter((one) => one.kind === "description");
  const saved = prompt !== "" && !choices.some((one) => one.name === prompt);
  const issue = problem?.("youtubeDescription") ?? problem?.("descriptionPrompt");
  return (
    <OutputTick
      field="youtubeDescription"
      label="YouTube description"
      help={
        narrated || enabled
          ? "The AI writes it from the narration, with chapters at their real times and tags · 1 AI call."
          : "Needs narration."
      }
      checked={enabled}
      disabled={!narrated && !enabled}
      onChange={(checked) => onChange({ youtubeDescription: checked, descriptionPrompt: prompt })}
    >
      <div className="sl-fields">
        <GridField
          htmlFor={`${id}-prompt`}
          label="Description prompt"
          tip="play.description-prompt"
        >
          <Picker
            id={`${id}-prompt`}
            data-play-field="descriptionPrompt"
            value={prompt}
            onChange={(event) =>
              onChange({ youtubeDescription: enabled, descriptionPrompt: event.target.value })
            }
          >
            <option value="">{defaultDescriptionPromptName}</option>
            {saved ? <option value={prompt}>{prompt} (saved choice)</option> : null}
            {choices.map((one) => (
              <option key={one.id} value={one.name}>
                {one.name}
              </option>
            ))}
          </Picker>
        </GridField>
      </div>
      {issue ? <p className="m-0 text-small text-danger">{issue}</p> : null}
    </OutputTick>
  );
}
