import { Label as LabelPrimitive } from "radix-ui";
import type * as React from "react";
import { cn } from "@/lib/utils";

// shadcn/ui's label, restyled as this app's engraved label. Every input carries one above
// it.
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
