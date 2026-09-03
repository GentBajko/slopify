import { Label as LabelPrimitive } from "radix-ui";
import type * as React from "react";
import { cn } from "@/lib/utils";

// shadcn/ui's label, restyled as the engraved label of uiux/02-system.md. Every input in
// this app carries one above it (uiux/03-experience.md, accessibility floor).
function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn("engraved block select-none text-ink3", className)}
      {...props}
    />
  );
}

export { Label };
