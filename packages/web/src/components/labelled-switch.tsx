import { useId } from "react";
import { Label } from "@/components/ui/label";
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
  onPick,
}: {
  readonly label: string;
  readonly value: T;
  readonly options: readonly { readonly value: T; readonly label: string }[];
  readonly describedBy?: string;
  readonly onPick: (next: T) => void;
}) {
  const labelId = useId();

  return (
    <div>
      <Label id={labelId} className="mb-[5px]">
        {label}
      </Label>
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
