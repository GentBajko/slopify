import type { ReactElement, ReactNode } from "react";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import type { HelpId } from "@/help/catalog";
import { cn } from "@/lib/utils";

// One field in the kit's field grid (`.sl-fields`): its label above with the info button, then
// the control, and anything that goes with it (a unit, a "to" and a second number) on one line.
// A select fills the column; a number keeps the kit's number width. `wide` spans the row.
export function GridField({
  htmlFor,
  label,
  tip,
  wide = false,
  children,
}: {
  readonly htmlFor: string;
  readonly label: string;
  readonly tip: HelpId;
  readonly wide?: boolean;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div className={cn("sl-field", wide && "sl-fields__wide")} {...helpScope}>
      <span className="flex min-w-0 items-center gap-1">
        <label htmlFor={htmlFor} className="sl-field__label">
          {label}
        </label>
        <InfoTip id={tip} label={label.toLowerCase()} className="-my-1" />
      </span>
      <div className="flex min-w-0 items-center gap-2 text-small [&>select]:min-w-0 [&>select]:flex-1 [&>input:not(.sl-input--number)]:min-w-0 [&>input:not(.sl-input--number)]:flex-1">
        {children}
      </div>
    </div>
  );
}
