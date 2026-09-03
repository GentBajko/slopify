import { useId } from "react";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

// The segmented switch as the rails wear it: the label on the same line as the strip
// rather than above it, which is how the reference sheet draws every switch on Play.
// `components/labelled-switch.tsx` keeps the stacked form the editors use.
//
// Radix hands `onValueChange` an empty string when a press deselects, so the lookup that
// guards the union lives here and the callback only ever sees a listed value.
export function InlineSwitch<T extends string>({
  label,
  hideLabel = false,
  value,
  options,
  className,
  onPick,
}: {
  readonly label: string;
  // The stage rails name the stage in the row already, so repeating it beside the strip
  // would say it twice; the label stays in the accessibility tree either way.
  readonly hideLabel?: boolean | undefined;
  readonly value: T;
  readonly options: readonly { readonly value: T; readonly label: string }[];
  readonly className?: string | undefined;
  readonly onPick: (next: T) => void;
}) {
  const labelId = useId();

  return (
    <span className={cn("inline-flex items-center gap-[10px]", className)}>
      <Label id={labelId} className={hideLabel ? "sr-only" : "shrink-0"}>
        {label}
      </Label>
      <ToggleGroup
        type="single"
        value={value}
        aria-labelledby={labelId}
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
    </span>
  );
}
