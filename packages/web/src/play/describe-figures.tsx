import { type ReactElement, useId } from "react";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import type { HelpId } from "@/help/catalog";

// "Describe tables and figures in the narration": the text model writes a short spoken passage
// for each table, figure, equation and code block, which the narration says in its place.
// "Leave code out" drops code blocks from the narration instead of summarising them. Both are
// stored only when on (`play-drafts/convert.ts`).
export function DescribeFiguresToggle({
  value,
  skipCode,
  onChange,
  tip = "play.describe-figures",
}: {
  readonly value: boolean | undefined;
  readonly skipCode: boolean | undefined;
  readonly onChange: (value: { describeFigures: boolean; skipCode: boolean }) => void;
  // Edit project explains what turning it on redoes.
  readonly tip?: HelpId;
}): ReactElement {
  const id = useId();
  const on = value === true;
  return (
    <div className="col-span-full min-w-0 space-y-1">
      <span className="flex items-center gap-1" {...helpScope}>
        <label
          htmlFor={id}
          className="flex min-h-10 items-center gap-3 text-small font-semibold max-[1099px]:min-h-11"
        >
          <input
            id={id}
            type="checkbox"
            data-play-field="audio.describeFigures"
            checked={on}
            className="size-4 accent-accent"
            onChange={(event) =>
              onChange({
                describeFigures: event.currentTarget.checked,
                skipCode: skipCode === true,
              })
            }
          />
          Describe tables and figures in the narration
        </label>
        <InfoTip id={tip} />
      </span>
      {on ? (
        <span className="flex items-center gap-1 pl-7" {...helpScope}>
          <label
            htmlFor={`${id}-code`}
            className="flex min-h-10 items-center gap-3 text-small max-[1099px]:min-h-11"
          >
            <input
              id={`${id}-code`}
              type="checkbox"
              data-play-field="audio.skipCode"
              checked={skipCode === true}
              className="size-4 accent-accent"
              onChange={(event) =>
                onChange({ describeFigures: true, skipCode: event.currentTarget.checked })
              }
            />
            Leave code out
          </label>
          <InfoTip id="play.skip-code" />
        </span>
      ) : null}
    </div>
  );
}
