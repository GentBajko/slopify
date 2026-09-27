import { Popover as PopoverPrimitive } from "radix-ui";
import type { ComponentProps, ReactElement } from "react";
import { cn } from "@/lib/utils";

// Detail that would otherwise push the page (help text, a located folder path, a queue), raised
// and floating, in a portal so it escapes the row it was opened from.
export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;

export function PopoverContent({
  className,
  align = "start",
  sideOffset = 6,
  ...props
}: ComponentProps<typeof PopoverPrimitive.Content>): ReactElement {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        collisionPadding={12}
        className={cn(
          "z-50 w-[min(340px,calc(100vw-24px))] rounded-control border border-line bg-raised p-3 text-small text-ink-2",
          "shadow-[var(--shadow-pop)] outline-hidden",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}
