import type { Prompt } from "@app/slices/library/model.js";
import { defaultDescriptionPromptName } from "@app/slices/youtube/model.js";
import { type ReactElement, useId } from "react";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import { Picker } from "@/components/ui/picker";

// The Video stage's optional step, on Play and in Edit project. Both controls stay mounted:
// without narration the switch is disabled rather than removed, and so is the prompt while the
// switch is off.
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
    <div className="col-span-full flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
      <span className="flex items-center gap-1" {...helpScope}>
        <label
          htmlFor={`${id}-switch`}
          className="flex min-h-10 items-center gap-3 text-small font-semibold max-[1099px]:min-h-11"
        >
          <input
            id={`${id}-switch`}
            type="checkbox"
            data-play-field="youtubeDescription"
            checked={enabled}
            disabled={!narrated && !enabled}
            aria-describedby={issue ? `${id}-error` : undefined}
            className="size-4 accent-accent"
            onChange={(event) =>
              onChange({
                youtubeDescription: event.currentTarget.checked,
                descriptionPrompt: prompt,
              })
            }
          />
          YouTube description
        </label>
        <InfoTip id="play.youtube-description" />
      </span>
      <span className="flex items-center gap-1" {...helpScope}>
        <label htmlFor={`${id}-prompt`} className="flex items-center gap-2 text-small">
          Description prompt
          <Picker
            id={`${id}-prompt`}
            data-play-field="descriptionPrompt"
            className="w-auto min-w-[120px]"
            value={prompt}
            disabled={!enabled}
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
        </label>
        <InfoTip id="play.description-prompt" />
      </span>
      {issue ? (
        <p id={`${id}-error`} className="basis-full text-small text-danger">
          {issue}
        </p>
      ) : !narrated ? (
        <p className="basis-full text-label text-ink-3">Needs narration.</p>
      ) : null}
    </div>
  );
}
