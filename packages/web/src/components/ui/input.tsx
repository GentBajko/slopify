import type * as React from "react";
import { cn } from "@/lib/utils";

// shadcn/ui's input, restyled to this app's system: --panel2 fill, --line2 border, radius 4,
// --ink3 placeholder. `aria-invalid` carries the error border; the message belongs below
// the field, which is the caller's job.
function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-control border border-line-strong bg-raised px-3 text-small text-ink",
        "placeholder:text-ink-3 aria-invalid:border-danger",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
