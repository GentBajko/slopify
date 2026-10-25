import { useLinkProps } from "@tanstack/react-router";
import type { ReactElement, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Lamp, type Tone } from "./status.js";

// A vertical list of places: the app's main navigation, a project's sections. Items are links
// (they go somewhere); the current one is marked with aria-current, which is also what lights
// it. Icons are 18px here. An item with a `tone` is a stage: its lamp sits in the icon column
// and its state word on the right, and in a rail where some items have a lamp the others keep
// the lamp's column empty, so every name starts at the same place (kit.css).
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

// A stage's standing on a rail item: the lamp and, always beside it, its word ("Done", "Running",
// "Not started"). Neither comes without the other.
type Standing =
  | { readonly tone: Tone; readonly state: string }
  | { readonly tone?: undefined; readonly state?: undefined };

function Inner({
  icon,
  meta,
  tone,
  state,
  children,
}: {
  readonly icon?: ReactNode;
  readonly meta?: ReactNode;
  readonly tone?: Tone | undefined;
  readonly state?: string | undefined;
  readonly children: ReactNode;
}) {
  return (
    <>
      {tone === undefined ? icon : <Lamp tone={tone} className="sl-rail__lamp" />}
      <span className="min-w-0 truncate">{children}</span>
      {state === undefined && meta === undefined ? null : (
        <span className="sl-rail__meta">
          {state === undefined ? null : (
            <>
              <span className="sr-only">, </span>
              <span className="sl-rail__state" data-tone={tone}>
                {state}
              </span>
            </>
          )}
          {state === undefined || meta === undefined ? null : " · "}
          {meta}
        </span>
      )}
    </>
  );
}

export function RailLink({
  to,
  search,
  icon,
  meta,
  tone,
  state,
  current,
  exact = false,
  resetScroll,
  className,
  onClick,
  children,
  "data-tour": tour,
}: {
  readonly to: string;
  readonly search?: Readonly<Record<string, string>>;
  // Runs before the router follows the link: Prompts' kinds end a search this way, even the
  // kind already on show.
  readonly onClick?: (() => void) | undefined;
  // False for a section of the same page: the page stays where it was scrolled to.
  readonly resetScroll?: boolean;
  // The interactive tutorial's target name.
  readonly "data-tour"?: string;
  readonly icon?: ReactNode;
  // A count on the right: "14", "2 outdated". After the state word when there is one.
  readonly meta?: ReactNode;
  // Forces the mark; left out, the router decides from the URL.
  readonly current?: boolean | "page" | "step";
  readonly exact?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
} & Standing): ReactElement {
  const link = useLinkProps({
    to,
    ...(search ? { search } : {}),
    ...(resetScroll === undefined ? {} : { resetScroll }),
    // The router runs it before it follows the link.
    ...(onClick === undefined ? {} : { onClick }),
    activeOptions: { exact, includeSearch: false },
    // No "active" class: aria-current is what lights an item (kit.css).
    activeProps: {},
  });
  // The router marks a link that matches the address as the page, after any prop it is given,
  // so a forced mark (`current={false}` on an item the address matches too) replaces the
  // router's on the element itself.
  const forced =
    current === undefined
      ? {}
      : {
          "aria-current": current === false ? undefined : current === true ? "page" : current,
          "data-status": undefined,
        };
  return (
    <a {...link} {...forced} data-tour={tour} className={cn("sl-rail__item", className)}>
      <Inner icon={icon} meta={meta} tone={tone} state={state}>
        {children}
      </Inner>
    </a>
  );
}

// A rail item that changes what the page shows without leaving it (a section rail in a
// workspace whose sections are not routes).
export function RailButton({
  icon,
  meta,
  tone,
  state,
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
} & Standing): ReactElement {
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
      <Inner icon={icon} meta={meta} tone={tone} state={state}>
        {children}
      </Inner>
    </button>
  );
}
