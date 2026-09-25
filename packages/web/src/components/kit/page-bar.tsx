import { Link } from "@tanstack/react-router";
import type { ReactElement, ReactNode } from "react";
import { cn } from "@/lib/utils";

// One row per page: back link, lamp, title, a short meta line and the page's own actions.
// Every route uses it, so a title never has a treatment of its own and a page's actions sit
// in the same place on every screen. `status` is a fixed-width slot for a save state word:
// its width is reserved whether or not it has text, so the title never shifts.
export function PageBar({
  title,
  back,
  lead,
  meta,
  status,
  actions,
  className,
}: {
  readonly title: ReactNode;
  readonly back?: {
    readonly to: string;
    readonly label: string;
    readonly search?: Readonly<Record<string, string>>;
  };
  // Drawn before the title: a lamp, an icon.
  readonly lead?: ReactNode;
  readonly meta?: ReactNode;
  readonly status?: ReactNode;
  readonly actions?: ReactNode;
  readonly className?: string;
}): ReactElement {
  return (
    <div
      data-slot="page-bar"
      className={cn(
        "flex min-h-12 flex-wrap items-center justify-between gap-x-5 gap-y-2 pb-3",
        className,
      )}
    >
      <div className="flex min-w-[min(100%,260px)] flex-1 flex-wrap items-center gap-x-3 gap-y-1">
        {back ? (
          <Link
            to={back.to}
            {...(back.search ? { search: back.search } : {})}
            className="shrink-0 text-small text-ink2 hover:text-ink"
          >
            &lt; {back.label}
          </Link>
        ) : null}
        {lead}
        <h1 className="min-w-0 break-words text-title font-bold tracking-[-0.01em]">{title}</h1>
        {status === undefined ? null : (
          <span className="inline-flex min-w-[88px] items-center">{status}</span>
        )}
        {meta ? <span className="min-w-0 text-small text-ink2">{meta}</span> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
