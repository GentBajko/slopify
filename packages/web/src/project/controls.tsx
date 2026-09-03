import type { ReactNode } from "react";
import { useState } from "react";
import { ConfirmDialog } from "@/components/confirm";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Destructive } from "./confirmations.js";
import { confirmationFor } from "./confirmations.js";

// A control that stops and confirms. Every destructive action on this page goes through it, so
// none of them can be wired straight to a click by accident.

export function ConfirmedButton({
  action,
  run,
  disabled = false,
  pending = false,
  variant = "outline",
  className,
  children,
}: {
  readonly action: Destructive;
  readonly run: () => void;
  readonly disabled?: boolean;
  readonly pending?: boolean;
  readonly variant?: "outline" | "ghost";
  readonly className?: string;
  readonly children: ReactNode;
}) {
  const [asking, setAsking] = useState(false);
  const copy = confirmationFor(action);

  return (
    <>
      <Button
        type="button"
        variant={variant}
        disabled={disabled}
        className={cn(variant === "ghost" ? "px-2 text-small" : undefined, className)}
        onClick={() => {
          setAsking(true);
        }}
      >
        {children}
      </Button>
      <ConfirmDialog
        open={asking}
        title={copy.title}
        consequence={copy.consequence}
        verb={copy.verb}
        dismiss={copy.dismiss}
        pending={pending}
        onConfirm={() => {
          setAsking(false);
          run();
        }}
        onCancel={() => {
          setAsking(false);
        }}
      />
    </>
  );
}
