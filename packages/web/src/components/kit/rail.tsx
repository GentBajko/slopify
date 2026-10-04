import { Link } from "@tanstack/react-router";
import type { ReactElement, ReactNode } from "react";
import { cn } from "@/lib/utils";

// A vertical list of places: the app's main navigation, a project's sections. Items are links
// (they go somewhere); the current one is marked with aria-current, which is also what lights
// it. Icons are 18px here.
export function Rail({
  label,
  className,
  children,
}: {
  readonly label: string;
  readonly className?: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <nav aria-label={label} className={cn("sl-rail", className)}>
      {children}
    </nav>
  );
}

function Inner({
  icon,
  meta,
  children,
}: {
  icon?: ReactNode;
  meta?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      {icon}
      <span className="min-w-0 truncate">{children}</span>
      {meta === undefined ? null : <span className="sl-rail__meta">{meta}</span>}
    </>
  );
}

export function RailLink({
  to,
  search,
  icon,
  meta,
  current,
  exact = false,
  resetScroll,
  className,
  children,
  "data-tour": tour,
}: {
  readonly to: string;
  readonly search?: Readonly<Record<string, string>>;
  // False for a section of the same page: the page stays where it was scrolled to.
  readonly resetScroll?: boolean;
  // The interactive tutorial's target name.
  readonly "data-tour"?: string;
  readonly icon?: ReactNode;
  // A count or state on the right: "14", "2 wait".
  readonly meta?: ReactNode;
  // Forces the mark; left out, the router decides from the URL.
  readonly current?: boolean | "page" | "step";
  readonly exact?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}): ReactElement {
  const forced =
    current === undefined
      ? undefined
      : current === false
        ? undefined
        : current === true
          ? "page"
          : current;
  return (
    <Link
      to={to}
      {...(search ? { search } : {})}
      {...(resetScroll === undefined ? {} : { resetScroll })}
      data-tour={tour}
      className={cn("sl-rail__item", className)}
      {...(current === undefined
        ? {
            activeOptions: { exact, includeSearch: false },
            activeProps: { "aria-current": "page" as const },
          }
        : { "aria-current": forced })}
    >
      <Inner icon={icon} meta={meta}>
        {children}
      </Inner>
    </Link>
  );
}

// A rail item that changes what the page shows without leaving it (a section rail in a
// workspace whose sections are not routes).
export function RailButton({
  icon,
  meta,
  current = false,
  onClick,
  className,
  children,
  "data-tour": tour,
}: {
  readonly icon?: ReactNode;
  readonly meta?: ReactNode;
  readonly current?: boolean;
  readonly onClick: () => void;
  readonly className?: string;
  readonly children: ReactNode;
  // The interactive tutorial's target name.
  readonly "data-tour"?: string;
}): ReactElement {
  return (
    <button
      type="button"
      data-tour={tour}
      aria-current={current ? "true" : undefined}
      onClick={onClick}
      className={cn(
        "sl-rail__item w-full border-0 bg-transparent text-left font-[inherit]",
        current && "bg-accent-tint font-semibold text-ink",
        className,
      )}
    >
      <Inner icon={icon} meta={meta}>
        {children}
      </Inner>
    </button>
  );
}
