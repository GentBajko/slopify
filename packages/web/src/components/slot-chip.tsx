import { cn } from "@/lib/utils";

// One `{{name}}` found in a body, drawn as the engraved chip of the reference sheet: a --panel2
// fill inside a --line2 border at radius 4. The braces are not repeated on the chip; the panel
// it sits under says what these are.
//
// The 150 ms fade is the chip's own arrival. `tick-in` is the project's fade-from-nothing
// keyframe and this is the second thing to need it, so it is shared rather than duplicated
// under a new name. Reduced motion cuts.
export function SlotChip({
  name,
  className,
}: {
  readonly name: string;
  readonly className?: string;
}) {
  return (
    <span
      data-slot-chip={name}
      className={cn(
        "engraved animate-tick-in rounded-control border border-line2 bg-panel2 px-[7px] py-[2px] text-ink2 motion-reduce:animate-none",
        className,
      )}
    >
      {name}
    </span>
  );
}
