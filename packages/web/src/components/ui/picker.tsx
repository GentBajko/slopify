import { ChevronDownIcon } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

// The dropdown the reference sheet draws: a --panel2 box at radius 4 with a chevron at its
// right edge. It is the platform's own `select` rather than the Radix one beside it, because
// Play's job here is to show a provider it will not let you pick - greyed, with the reason
// beside its name - and `option[disabled]` is announced, unselectable and greyed by the browser
// itself. The overlay picker stays where a rich row is wanted; this is for the eight plain
// lists of one screen.
function Picker({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <span className="relative inline-flex min-w-0 items-center">
      <select
        data-slot="picker"
        className={cn(
          "h-8 w-full min-w-0 appearance-none rounded-control border border-line2 bg-panel2",
          "py-[5px] pr-[26px] pl-[10px] text-small text-ink aria-invalid:border-red",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDownIcon
        aria-hidden="true"
        className="pointer-events-none absolute right-[8px] size-[14px] text-ink2"
      />
    </span>
  );
}

export { Picker };
