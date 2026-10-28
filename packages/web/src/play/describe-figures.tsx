import { type ReactElement, useId } from "react";
import { Checkbox, HelpLine } from "@/components/kit/field";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import type { HelpId } from "@/help/catalog";

// "Describe tables and figures in the narration": the text model writes a short spoken passage
// for each table, figure, equation and code block, which the narration says in its place.
// "Leave code out" drops code blocks from the narration instead of summarising them. Both are
// stored only when on (`play-drafts/convert.ts`).
export function DescribeFiguresToggle({
  value,
  skipCode,
  onScreen,
  onChange,
  tip = "play.describe-figures",
}: {
  readonly value: boolean | undefined;
  readonly skipCode: boolean | undefined;
  // "Also show them on screen", under it while it is on, where the run makes a video to show
  // them in.
  readonly onScreen?:
    | { readonly value: boolean | undefined; readonly onChange: (value: boolean) => void }
    | undefined;
  readonly onChange: (value: { describeFigures: boolean; skipCode: boolean }) => void;
  // Edit project explains what turning it on redoes.
  readonly tip?: HelpId;
}): ReactElement {
  const id = useId();
  const on = value === true;
  return (
    <div className="col-span-full min-w-0 space-y-1">
      <div {...helpScope}>
        <span className="flex items-center gap-1">
          <label
            htmlFor={id}
            className="flex min-h-10 items-center gap-3 text-small font-semibold max-[1099px]:min-h-11"
          >
            <Checkbox
              id={id}
              data-play-field="audio.describeFigures"
              checked={on}
              aria-describedby={`${id}-cost`}
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
        {/* What it spends, on the control itself rather than only in its info button. */}
        <HelpLine id={`${id}-cost`} className="pl-7">
          One AI call for each table, figure, equation or code block.
        </HelpLine>
      </div>
      {on ? (
        <div className="pl-7" {...helpScope}>
          <label
            htmlFor={`${id}-code`}
            className="flex min-h-10 items-center gap-3 text-small max-[1099px]:min-h-11"
          >
            <Checkbox
              id={`${id}-code`}
              data-play-field="audio.skipCode"
              checked={skipCode === true}
              onChange={(event) =>
                onChange({ describeFigures: true, skipCode: event.currentTarget.checked })
              }
            />
            Leave code out
          </label>
          <HelpLine className="pl-7">Code blocks are skipped instead of summed up.</HelpLine>
        </div>
      ) : null}
      {on && onScreen !== undefined ? (
        <div className="pl-7">
          <ShowFiguresToggle
            label="Also show them on screen"
            value={onScreen.value}
            onChange={onScreen.onChange}
          />
        </div>
      ) : null}
    </div>
  );
}

// "Show tables and figures on screen": each described block is also drawn as a card the video
// shows while its description is spoken. Only offered while the narration describes them, so on
// Play it sits under Describe tables and figures.
export function ShowFiguresToggle({
  value,
  onChange,
  label = "Show tables and figures on screen",
  tip = "play.show-figures",
}: {
  readonly value: boolean | undefined;
  readonly onChange: (value: boolean) => void;
  // Under Describe tables and figures it is "Also show them on screen".
  readonly label?: string;
  readonly tip?: HelpId;
}): ReactElement {
  const id = useId();
  return (
    <span className="flex min-w-0 items-center gap-1" {...helpScope}>
      <label
        htmlFor={id}
        className="flex min-h-10 items-center gap-3 text-small font-semibold max-[1099px]:min-h-11"
      >
        <Checkbox
          id={id}
          data-play-field="showFigures"
          checked={value === true}
          onChange={(event) => onChange(event.currentTarget.checked)}
        />
        {label}
      </label>
      <InfoTip id={tip} />
    </span>
  );
}
