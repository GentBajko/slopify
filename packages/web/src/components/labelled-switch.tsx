import { type ReactNode, useId } from "react";
import { HelpLine } from "@/components/kit/field";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { HelpId } from "@/help/catalog";

// A segmented switch with its label above it, in the same sentence-case field label as the Name
// and the text box beside it: the prompt editor's Kind, and the entry editor's Category and
// Mode. Every input in this app carries a label above it. On a phone the choices stand one under
// the other, the full width, so a long one ("Let the AI write it from these instructions") is
// never cut at the screen's edge.
//
// Radix hands `onValueChange` the raw string of the pressed item and an empty string when
// a press deselects, so every call site had the same lookup guarding the same union. It
// lives here now, and the callback is only reached with a value from `options`.
export function LabelledSwitch<T extends string>({
  label,
  value,
  options,
  describedBy,
  help,
  tip,
  onPick,
}: {
  readonly label: string;
  readonly value: T;
  readonly options: readonly { readonly value: T; readonly label: string }[];
  readonly describedBy?: string;
  // One short sentence under the choice: what it changes. Its explanation, visible.
  readonly help?: ReactNode;
  // The info button after the label, only for a consequence that needs a paragraph.
  readonly tip?: HelpId;
  readonly onPick: (next: T) => void;
}) {
  const labelId = useId();
  const helpId = useId();
  const described =
    [describedBy, help === undefined ? undefined : helpId].filter(Boolean).join(" ") || undefined;

  return (
    <div {...helpScope}>
      <div className="mb-1 flex items-center gap-1">
        <span id={labelId} className="sl-field__label">
          {label}
        </span>
        {tip === undefined ? null : <InfoTip id={tip} label={label} className="-my-1" />}
      </div>
      <ToggleGroup
        type="single"
        value={value}
        className="max-sm:w-full max-sm:flex-col"
        aria-labelledby={labelId}
        aria-describedby={described}
        onValueChange={(next) => {
          const picked = options.find((option) => option.value === next);
          if (picked !== undefined) {
            onPick(picked.value);
          }
        }}
      >
        {options.map((option) => (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            className="max-sm:border-r-0 max-sm:border-b max-sm:text-left max-sm:last:border-b-0"
          >
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {help === undefined ? null : (
        <HelpLine id={helpId} className="mt-1">
          {help}
        </HelpLine>
      )}
    </div>
  );
}
