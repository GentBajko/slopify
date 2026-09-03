import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type * as React from "react";
import { cn } from "@/lib/utils";

// shadcn/ui's button, restyled to this app's system: radius 4 on controls and 6 on the Play
// key, hover as a --panel2 lift with a --line2 border, disabled and focus handled once in
// styles/index.css. Pointer targets are at least 32 px tall.
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-sans transition-colors duration-150 ease-out motion-reduce:transition-none",
  {
    variants: {
      variant: {
        outline:
          "rounded-control border border-line2 bg-panel2 text-ink hover:bg-panel2 hover:border-ink3",
        accent: "rounded-control border border-accent bg-transparent text-run-text hover:bg-panel2",
        // The one accent fill outside the Play key: the prompt editor's Save, the only
        // filled control on its sheet. The hover darkens to the key's own edge colour
        // rather than lifting to --panel2, which a fill has no room for.
        primary:
          "rounded-control bg-accent px-[14px] font-semibold text-accent-ink hover:bg-accent-edge",
        ghost: "rounded-control text-ink2 hover:bg-panel2 hover:text-ink",
        // The action verb of a confirm dialog: the red is the border, never the fill, so
        // the label keeps --ink's contrast on both themes.
        danger: "rounded-control border border-red bg-transparent text-ink hover:bg-panel2",
        // The focal moment of the app. The base shadow compresses on press; reduced
        // motion turns the 3 px travel into an instant colour change.
        play: "rounded-panel bg-accent text-accent-ink font-extrabold tracking-[0.02em] shadow-[0_4px_0_var(--color-accent-edge)] active:translate-y-[3px] active:shadow-[0_1px_0_var(--color-accent-edge)] motion-reduce:active:translate-y-0",
      },
      size: {
        default: "h-8 px-3 text-body",
        play: "h-14 w-full px-4 text-row",
      },
    },
    defaultVariants: { variant: "outline", size: "default" },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Button, buttonVariants };
