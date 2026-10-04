import { type ReactElement, type ReactNode, useState } from "react";
import { cn } from "@/lib/utils";

// A fold of occasional settings: a bordered `<details>` whose summary names what is inside
// and, after a dot, what it is set to now ("More audio settings · Chunked, 2 voices"). With
// `remember` the fold stays open or closed as the person left it, per browser, for folds
// that get reopened on every visit.
export function Fold({
  summary,
  remember,
  defaultOpen = false,
  className,
  children,
}: {
  readonly summary: ReactNode;
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
      className={cn("rounded-control border border-line px-3", className)}
    >
      <summary className="flex min-h-9 cursor-pointer items-center text-small text-ink-2">
        {summary}
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
