import { type ReactNode, useId } from "react";
import { HelpLine } from "@/components/kit/field";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { HelpId } from "@/help/catalog";

// A segmented switch with its engraved label above it: the prompt editor's Kind, and the
// entry editor's Category and Mode. Every input in this app carries a label above it.
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
        <Label id={labelId}>{label}</Label>
        {tip === undefined ? null : <InfoTip id={tip} label={label} className="-my-1" />}
      </div>
      <ToggleGroup
        type="single"
        value={value}
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
          <ToggleGroupItem key={option.value} value={option.value}>
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
