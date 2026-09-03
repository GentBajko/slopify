import type * as React from "react";
import { cn } from "@/lib/utils";

// shadcn/ui's input, restyled to uiux/02-system.md: --panel2 fill, --line2 border,
// radius 4, --ink3 placeholder. `aria-invalid` carries the error border; the message
// belongs below the field, which is the caller's job.
function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-control border border-line2 bg-panel2 px-[10px] text-small text-ink",
        "placeholder:text-ink3 aria-invalid:border-red",
        className,
      )}
      {...props}
    />
  );
}

// The same skin over a textarea: the pasted article is the one multi-line field S6 has.
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "w-full min-w-0 rounded-control border border-line2 bg-panel2 px-[10px] py-2 text-small text-ink",
        "placeholder:text-ink3 aria-invalid:border-red",
        className,
      )}
      {...props}
    />
  );
}

export { Input, Textarea };
