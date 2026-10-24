import { type ReactElement, type ReactNode, useId } from "react";
import { Checkbox, HelpLine } from "@/components/kit/field";
import { helpScope } from "@/components/kit/info-tip";
import { cn } from "@/lib/utils";
import { RailName } from "./rail-frame";

// One thing the run can make besides its main work, as a line of a checklist: a tick named for
// the thing ("Thumbnail", "PDF of the article"), one short line saying what it is and what it
// costs, and its settings only once it is ticked. Nothing greyed waits behind an unticked box.
export function OutputTick({
  field,
  label,
  help,
  checked,
  disabled = false,
  className,
  onChange,
  children,
}: {
  // The draft field the tick writes, which a refusal names to bring it into view.
  readonly field: string;
  readonly label: string;
  readonly help: ReactNode;
  readonly checked: boolean;
  // Only when the run cannot make it now and the line says why.
  readonly disabled?: boolean | undefined;
  readonly className?: string | undefined;
  readonly onChange: (next: boolean) => void;
  readonly children?: ReactNode;
}): ReactElement {
  const id = useId();
  return (
    <div
      className={cn("flex min-w-0 flex-col border-b border-line py-3 last:border-b-0", className)}
      {...helpScope}
    >
      <label
        id={`${id}-label`}
        htmlFor={id}
        className="flex min-h-9 cursor-pointer items-center gap-3 text-body font-semibold max-[1099px]:min-h-11"
      >
        <Checkbox
          id={id}
          data-play-field={field}
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.currentTarget.checked)}
        />
        {label}
      </label>
      <HelpLine className="pl-7">{help}</HelpLine>
      {checked && children !== undefined ? (
        <RailName.Provider value={`${id}-label`}>
          <div className="flex min-w-0 flex-col gap-4 pt-3 pl-7">{children}</div>
        </RailName.Provider>
      ) : null}
    </div>
  );
}
