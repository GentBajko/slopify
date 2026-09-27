import { useId } from "react";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import { Label } from "@/components/ui/label";
import type { HelpId } from "@/help/catalog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

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
  tip,
  onPick,
}: {
  readonly label: string;
  readonly value: T;
  readonly options: readonly { readonly value: T; readonly label: string }[];
  readonly describedBy?: string;
  readonly tip?: HelpId;
  readonly onPick: (next: T) => void;
}) {
  const labelId = useId();

  return (
    <div {...helpScope}>
      <div className="mb-[5px] flex items-center gap-1">
        <Label id={labelId}>{label}</Label>
        {tip === undefined ? null : <InfoTip id={tip} label={label} className="-my-1" />}
      </div>
      <ToggleGroup
        type="single"
        value={value}
        aria-labelledby={labelId}
        aria-describedby={describedBy}
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
    </div>
  );
}
