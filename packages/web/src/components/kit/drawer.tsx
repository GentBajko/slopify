import { XIcon } from "lucide-react";
import { type ReactElement, type ReactNode, type RefObject, useEffect, useId, useRef } from "react";
import { cn } from "@/lib/utils";

// A right-hand panel that opens over the page without moving it. It is deliberately not a
// modal: the page behind stays readable and operable, the guided tour can still point into it
// (the spotlight steps aside only for modal dialogs), and Escape or the close button returns
// focus to whatever opened it. The footer is pinned, so the drawer's action never scrolls away.
export function Drawer({
  open,
  title,
  onClose,
  children,
  footer,
  width = "wide",
  headingRef,
  className,
}: {
  readonly open: boolean;
  readonly title: ReactNode;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  readonly width?: "narrow" | "wide";
  // Lets a caller that manages focus itself reach the title.
  readonly headingRef?: RefObject<HTMLHeadingElement | null>;
  readonly className?: string;
}): ReactElement | null {
  const titleId = useId();
  const ownHeading = useRef<HTMLHeadingElement>(null);
  const heading = headingRef ?? ownHeading;
  const opener = useRef<Element | null>(null);
  const panel = useRef<HTMLElement>(null);
  const latestClose = useRef(onClose);
  useEffect(() => {
    latestClose.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    // A caller that already moved focus inside (to a field it is revealing) keeps it.
    if (!panel.current?.contains(document.activeElement))
      heading.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      // A modal dialog opened from inside the drawer owns its own Escape.
      if (document.querySelector('[data-slot="dialog-content"][data-state="open"]')) return;
      latestClose.current();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      const back = opener.current;
      if (back instanceof HTMLElement && back.isConnected) back.focus({ preventScroll: true });
    };
  }, [open, heading]);

  if (!open) return null;
  return (
    <aside
      ref={panel}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      data-slot="drawer"
      className={cn(
        "fixed top-12 right-0 bottom-0 z-30 flex w-full flex-col border-l border-line2 bg-panel shadow-[-12px_0_28px_-12px_var(--color-shadow)]",
        width === "wide" ? "sm:w-[min(560px,100vw)]" : "sm:w-[min(440px,100vw)]",
        "data-[state=open]:animate-tick-in motion-reduce:animate-none",
        className,
      )}
      data-state="open"
    >
      <div className="flex min-h-12 shrink-0 items-center gap-3 border-b border-line px-4">
        <h2
          ref={heading}
          id={titleId}
          tabIndex={-1}
          className="min-w-0 flex-1 truncate text-row font-semibold focus-visible:outline-offset-[-2px]"
        >
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="inline-flex size-8 items-center justify-center rounded-control text-ink2 hover:bg-panel2 hover:text-ink"
        >
          <XIcon aria-hidden="true" className="size-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
      {footer ? (
        <div className="flex min-h-14 shrink-0 flex-wrap items-center gap-2 border-t border-line px-4 py-2 pb-[max(8px,env(safe-area-inset-bottom))]">
          {footer}
        </div>
      ) : null}
    </aside>
  );
}
