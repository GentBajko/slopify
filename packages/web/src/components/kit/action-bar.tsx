import type { ReactElement, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatusTone = "info" | "error" | "warning" | "success";

const tones: Readonly<Record<StatusTone, string>> = {
  info: "text-ink-2",
  error: "text-danger",
  warning: "text-waiting",
  success: "text-accent-ink",
};

// A reserved line for transient feedback. It is always rendered at the same height, empty or
// not, so a message arriving or leaving never moves the controls around it. Long text is cut
// to one line with the full text on hover and in the accessible name, unless `wrap` asks for
// every word on screen (a price or a refusal the person must read in full).
export function StatusSlot({
  children,
  tone = "info",
  className,
  id,
  wrap = false,
}: {
  readonly children?: ReactNode;
  readonly tone?: StatusTone;
  readonly className?: string;
  readonly id?: string | undefined;
  readonly wrap?: boolean;
}): ReactElement {
  const text = typeof children === "string" ? children : undefined;
  return (
    <div
      id={id}
      data-slot="status-slot"
      role={tone === "error" ? "alert" : "status"}
      title={text}
      className={cn(
        "flex min-h-8 min-w-0 flex-1 items-center gap-2 text-small",
        wrap ? "flex-wrap gap-y-0 py-1" : "overflow-hidden",
        tones[tone],
        className,
      )}
    >
      {children === undefined || children === null || children === false ? null : text ===
        undefined ? (
        children
      ) : (
        <span className={wrap ? "min-w-0" : "min-w-0 truncate"}>{text}</span>
      )}
    </div>
  );
}

// The primary action of an editing surface never leaves the screen: the bar sticks to the
// bottom of the viewport and carries the status slot beside the buttons it reports on. Placed
// straight in the page, it sits at the bottom of the window even when the page is short
// (shell.css makes such a page a column the bar is pushed to the end of).
export function ActionBar({
  status,
  children,
  className,
}: {
  readonly status?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}): ReactElement {
  return (
    <div
      data-slot="action-bar"
      className={cn(
        "sticky bottom-0 z-20 -mx-4 mt-6 flex [.sl-page>&]:mt-auto min-h-14 flex-wrap items-center gap-x-3 gap-y-2 border-t border-line bg-surface px-4 py-2 pb-[max(8px,env(safe-area-inset-bottom))] max-md:bottom-[calc(48px+max(12px,env(safe-area-inset-bottom)))] md:-mx-6 md:px-6",
        className,
      )}
    >
      {/* On a phone an empty status line takes no row of its own: the bar is one row of
          buttons until there is something to say. */}
      <div className="flex w-full min-w-0 sm:w-auto sm:flex-[1_1_18rem] max-sm:has-[[data-slot=status-slot]:empty]:hidden">
        {status ?? <StatusSlot />}
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
