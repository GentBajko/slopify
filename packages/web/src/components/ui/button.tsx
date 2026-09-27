import { Slot } from "radix-ui";
import type * as React from "react";
import { buttonClass } from "@/components/kit/button";
import { cn } from "@/lib/utils";

// Deprecated: the 2.x shadcn button, re-pointed at the 3.0 kit so screens not yet redesigned
// wear the new buttons. New code uses `Button`, `IconButton` and `PlayKey` from
// components/kit/button. The old variants map onto the five kinds:
// outline and accent -> secondary, primary -> primary, ghost -> quiet,
// danger -> destructive, play -> the Play key.
type LegacyVariant = "outline" | "accent" | "primary" | "ghost" | "danger" | "play";
type LegacySize = "default" | "play";

const kinds = {
  outline: "secondary",
  accent: "secondary",
  primary: "primary",
  ghost: "quiet",
  danger: "destructive",
} as const;

function buttonVariants({
  variant,
  size,
}: {
  readonly variant?: LegacyVariant | null | undefined;
  readonly size?: LegacySize | null | undefined;
} = {}): string {
  if (variant === "play" || size === "play") return "sl-key";
  return buttonClass({ variant: kinds[variant ?? "outline"] });
}

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & {
  readonly variant?: LegacyVariant | null;
  readonly size?: LegacySize | null;
  readonly asChild?: boolean;
}) {
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
