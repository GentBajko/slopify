import type * as React from "react";
import { cn } from "@/lib/utils";

// The dropdown the reference sheet draws: a --panel2 box at radius 4 with a chevron at its
// right edge. It is the platform's own `select` rather than the Radix one beside it, because
// Play's job here is to show a provider it will not let you pick - greyed, with the reason
// beside its name - and `option[disabled]` is announced, unselectable and greyed by the browser
// itself. The overlay picker stays where a rich row is wanted; this is for the eight plain
// lists of one screen.
function Picker({ className, children, ...props }: React.ComponentProps<"select">) {
  // The kit's select, height and arrow and all (`.sl-select`), so every dropdown on a screen is
  // the same size. `className` sizes it: by default it fills its field's column.
  return (
    <span className={cn("relative flex w-full min-w-0", className)}>
      <select data-slot="picker" className="sl-select" {...props}>
        {children}
      </select>
    </span>
  );
}

export { Picker };
