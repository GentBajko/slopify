import type { Prompt } from "@app/slices/library/model.js";
import { defaultChoices } from "@app/slices/social/defaults.js";
import {
  type PostChoice,
  platformLabels,
  type SocialPlatform,
  type SocialSettings,
  socialPlatforms,
} from "@app/slices/social/model.js";
import { type ReactElement, useId } from "react";
import { Checkbox } from "@/components/kit/field";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import { PostChoiceFields } from "./post-choice-fields";

// Which sites a template's projects post to, and what each gets: Template Studio's Upload pack
// and Play's Outputs. No site on is no posting (`undefined`), as every template saved before.
export function PostSettings({
  value,
  onChange,
  prompts,
  shorts,
  compact = false,
}: {
  readonly value: SocialSettings | undefined;
  readonly onChange: (next: SocialSettings | undefined) => void;
  readonly prompts: readonly Prompt[];
  readonly shorts?: number;
  readonly compact?: boolean;
}): ReactElement {
  const labelId = useId();
  const on = socialPlatforms.filter((platform) => value?.[platform] !== undefined);
  const set = (platform: SocialPlatform, choice: PostChoice | undefined) => {
    const next: { [P in SocialPlatform]?: PostChoice } = {};
    for (const one of socialPlatforms) {
      const kept = one === platform ? choice : value?.[one];
      if (kept !== undefined) next[one] = kept;
    }
    onChange(Object.keys(next).length === 0 ? undefined : next);
  };
  return (
    <div className="flex min-w-0 flex-col gap-4" data-slot="post-settings">
      <div className="sl-field" {...helpScope}>
        <span className="flex min-w-0 items-center gap-1">
          <span className="sl-field__label" id={labelId}>
            Post to
          </span>
          <InfoTip id="social.platforms" className="-my-1" />
        </span>
        {/* biome-ignore lint/a11y/useSemanticElements: a row of chips; a fieldset's box and legend would break the row. */}
        <div role="group" aria-labelledby={labelId} className="flex flex-wrap gap-2">
          {socialPlatforms.map((platform) => (
            <label key={platform} className="sl-chip min-h-8 cursor-pointer gap-2">
              <Checkbox
                checked={value?.[platform] !== undefined}
                onChange={(event) =>
                  set(platform, event.currentTarget.checked ? defaultChoices[platform] : undefined)
                }
              />
              {platformLabels[platform]}
            </label>
          ))}
        </div>
      </div>
      {on.map((platform) => {
        const choice = value?.[platform];
        return choice === undefined ? null : (
          <section
            key={platform}
            aria-label={`${platformLabels[platform]} post`}
            className="flex min-w-0 flex-col gap-3 border-t border-line pt-3"
          >
            <h4 className="m-0 text-small font-semibold">{platformLabels[platform]}</h4>
            <PostChoiceFields
              platform={platform}
              choice={choice}
              withPrompt
              prompts={prompts}
              compact={compact}
              {...(shorts === undefined ? {} : { shorts })}
              onChange={(next) => set(platform, next)}
            />
          </section>
        );
      })}
    </div>
  );
}
