import { XIcon } from "lucide-react";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { cn } from "@/lib/utils";

// Slopify's status mark and its words. A lamp never stands alone: `Status` is the lamp with
// its word, and a bare `Lamp` is for places where the word sits elsewhere in the same row.
export type Tone = "running" | "done" | "waiting" | "failed" | "info" | "off";

export function Lamp({
  tone,
  className,
}: {
  readonly tone: Tone;
  readonly className?: string;
}): ReactElement {
  return (
    <span
      aria-hidden="true"
      data-tone={tone}
      className={cn("sl-lamp", tone !== "off" && `sl-lamp--${tone}`, className)}
    />
  );
}

// "Running", "Waiting for you", "Failed". Running and done read in accent-ink, the rest in
// their own colour; off reads in ink-2.
export function Status({
  tone,
  children,
  className,
}: {
  readonly tone: Tone;
  readonly children: ReactNode;
  readonly className?: string;
}): ReactElement {
  const word = tone === "done" ? "running" : tone;
  return (
    <span
      data-slot="status"
      className={cn("sl-status", word !== "off" && `sl-status--${word}`, className)}
    >
      <Lamp tone={tone} />
      {children}
    </span>
  );
}

export type BadgeTone = "neutral" | "running" | "waiting" | "failed" | "info";

// A pill for a state on a thing: "Generating", "Outdated", "Flagged by review".
export function Badge({
  tone = "neutral",
  className,
  ...props
}: ComponentProps<"span"> & { readonly tone?: BadgeTone }): ReactElement {
  return (
    <span
      data-slot="badge"
      className={cn("sl-badge", tone !== "neutral" && `sl-badge--${tone}`, className)}
      {...props}
    />
  );
}

// A value in a well: a keyword, a picked voice, a filter. With `onRemove` it gets a remove
// button named for what it removes.
export function Chip({
  children,
  onRemove,
  removeLabel,
  className,
}: {
  readonly children: ReactNode;
  readonly onRemove?: () => void;
  readonly removeLabel?: string;
  readonly className?: string;
}): ReactElement {
  return (
    <span data-slot="chip" className={cn("sl-chip", className)}>
      {children}
      {onRemove === undefined ? null : (
        <button
          type="button"
          aria-label={removeLabel ?? "Remove"}
          onClick={onRemove}
          className="-mr-1 inline-flex size-5 items-center justify-center rounded-control text-ink-2 hover:bg-raised hover:text-ink"
        >
          <XIcon aria-hidden="true" className="size-[14px]" strokeWidth={1.75} />
        </button>
      )}
    </span>
  );
}
