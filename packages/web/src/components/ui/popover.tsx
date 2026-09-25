import { Popover as PopoverPrimitive } from "radix-ui";
import type * as React from "react";
import { cn } from "@/lib/utils";

// Radix's popover in this app's surface: --panel at radius 6 with the dialog's tinted shadow,
// rendered in a portal so it escapes the row it was opened from. Popovers carry detail that
// would otherwise push the page: help text, a located folder path, the batch queue.
const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverAnchor = PopoverPrimitive.Anchor;

function PopoverContent({
  className,
  align = "start",
  sideOffset = 6,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        collisionPadding={12}
        className={cn(
          "z-50 w-[min(340px,calc(100vw-24px))] rounded-panel border border-line bg-panel p-3 text-small text-ink2",
          "shadow-[0_8px_24px_var(--color-shadow)] outline-hidden",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverAnchor, PopoverContent, PopoverTrigger };
