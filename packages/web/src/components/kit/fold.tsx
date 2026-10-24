import { ChevronRightIcon } from "lucide-react";
import { type ReactElement, type ReactNode, useState } from "react";
import { cn } from "@/lib/utils";

// A fold of occasional settings, drawn as a disclosure and never as a box that could pass for
// an empty field: a chevron, what is inside in ink, what it is set to now in words ("More audio
// settings · Chunked, 2 voices"), and Show or Hide at the end of the line. What opens lines up
// under the name. With `remember` the fold stays open or closed as the person left it, per
// browser, for folds that get reopened on every visit.
export function Fold({
  summary,
  state,
  remember,
  defaultOpen = false,
  className,
  children,
}: {
  // What is inside: "More audio settings", "Earlier samples".
  readonly summary: ReactNode;
  // What it is set to or holds now, in words, after the name: "Chunked, 2 voices", "3".
  readonly state?: ReactNode;
  // A stable key, such as "play.audio-more".
  readonly remember?: string;
  readonly defaultOpen?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}): ReactElement {
  const [open, setOpen] = useState(() => remembered(remember) ?? defaultOpen);
  return (
    <details
      open={open}
      onToggle={(event) => {
        const next = event.currentTarget.open;
        if (next === open) return;
        setOpen(next);
        keep(remember, next);
      }}
      className={cn("sl-fold", className)}
      data-slot="fold"
    >
      <summary className="sl-fold__summary">
        <ChevronRightIcon aria-hidden="true" strokeWidth={2} className="sl-fold__chevron" />
        <span className="sl-fold__label">{summary}</span>
        {state === undefined || state === null ? null : (
          <span className="sl-fold__state">{state}</span>
        )}
        {/* "Show" or "Hide" (kit.css): the summary already says expanded or collapsed aloud. */}
        <span className="sl-fold__toggle" aria-hidden="true" />
      </summary>
      {children}
    </details>
  );
}

const prefix = "slopify.fold.";

function remembered(key: string | undefined): boolean | undefined {
  if (key === undefined) return undefined;
  try {
    const value = window.localStorage.getItem(prefix + key);
    return value === null ? undefined : value === "open";
  } catch {
    return undefined;
  }
}

function keep(key: string | undefined, open: boolean): void {
  if (key === undefined) return;
  try {
    window.localStorage.setItem(prefix + key, open ? "open" : "closed");
  } catch {
    // Storage blocked: the fold still works, it just isn't remembered.
  }
}
