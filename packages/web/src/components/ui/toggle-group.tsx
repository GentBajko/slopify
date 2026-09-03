import { ToggleGroup as ToggleGroupPrimitive } from "radix-ui";
import type * as React from "react";
import { cn } from "@/lib/utils";

// shadcn/ui's toggle group, restyled as the segmented switch of uiux/02-system.md: one
// bordered strip at radius 4 with shared edges, the selected segment a --panel2 fill
// with a 2 px inset bottom line in --lamp-run. Radix keeps the roving tabindex and the
// arrow-key movement; the standalone Toggle it usually ships beside is unused here.

function ToggleGroup({
  className,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Root>) {
  return (
    <ToggleGroupPrimitive.Root
      data-slot="toggle-group"
      className={cn(
        "inline-flex w-fit items-stretch overflow-hidden rounded-control border border-line2",
        className,
      )}
      {...props}
    />
  );
}

function ToggleGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof ToggleGroupPrimitive.Item>) {
  return (
    <ToggleGroupPrimitive.Item
      data-slot="toggle-group-item"
      className={cn(
        "min-h-8 shrink-0 border-r border-line2 px-[10px] py-[5px] text-label text-ink2 last:border-r-0",
        "transition-colors duration-150 ease-out motion-reduce:transition-none hover:bg-panel2 hover:text-ink",
        "data-[state=on]:bg-panel2 data-[state=on]:text-ink data-[state=on]:shadow-[inset_0_-2px_0_var(--color-lamp-run)]",
        className,
      )}
      {...props}
    />
  );
}

export { ToggleGroup, ToggleGroupItem };
