import type { ReactElement, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatusTone = "info" | "error" | "warning" | "success";

const tones: Readonly<Record<StatusTone, string>> = {
  info: "text-ink2",
  error: "text-red",
  warning: "text-amber",
  success: "text-done",
};

// A reserved line for transient feedback. It is always rendered at the same height, empty or
// not, so a message arriving or leaving never moves the controls around it. Long text is cut
// to one line with the full text on hover and in the accessible name.
export function StatusSlot({
  children,
  tone = "info",
  className,
  id,
}: {
  readonly children?: ReactNode;
  readonly tone?: StatusTone;
  readonly className?: string;
  readonly id?: string | undefined;
}): ReactElement {
  const text = typeof children === "string" ? children : undefined;
  return (
    <div
      id={id}
      data-slot="status-slot"
      role={tone === "error" ? "alert" : "status"}
      title={text}
      className={cn(
        "flex min-h-8 min-w-0 flex-1 items-center gap-2 overflow-hidden text-small",
        tones[tone],
        className,
      )}
    >
      {children === undefined || children === null || children === false ? null : text ===
        undefined ? (
        children
      ) : (
        <span className="min-w-0 truncate">{text}</span>
      )}
    </div>
  );
}

// The primary action of an editing surface never leaves the screen: the bar sticks to the
// bottom of the viewport and carries the status slot beside the buttons it reports on.
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
        "sticky bottom-0 z-20 -mx-4 mt-6 flex min-h-14 flex-wrap items-center gap-x-3 gap-y-2 border-t border-line bg-panel px-4 py-2 pb-[max(8px,env(safe-area-inset-bottom))] shadow-[0_-6px_14px_-10px_var(--color-shadow)] sm:-mx-6 sm:px-6",
        className,
      )}
    >
      <div className="flex w-full min-w-0 sm:w-auto sm:flex-1">{status ?? <StatusSlot />}</div>
      <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
