import { Link, useLocation } from "@tanstack/react-router";
import { type KeyboardEvent, type ReactElement, type ReactNode, useRef } from "react";
import { cn } from "@/lib/utils";
import { useScrollEdges } from "./scroll-edges.js";

export interface TabItem<Id extends string> {
  readonly id: Id;
  readonly label: ReactNode;
  // A count or state beside the label: "Checkpoints · 2", "Edit · 3 changes".
  readonly badge?: ReactNode;
  readonly disabled?: boolean;
}

// The 3.0 tab: ink-2 until selected, then ink with the accent underline (kit.css `.sl-tab`).
const tabClass = "sl-tab inline-flex items-center gap-[6px]";

// Secondary surfaces are tabs under the page bar, never blocks inserted above the primary one.
// Arrow keys, Home and End move between tabs and select them (roving focus: only the
// selected tab is in the tab order); the panel belongs to the caller, so a tab can keep its panel
// mounted while hidden.
export function Tabs<Id extends string>({
  items,
  value,
  onChange,
  label,
  idPrefix,
  trailing,
  className,
}: {
  readonly items: readonly TabItem<Id>[];
  readonly value: Id;
  readonly onChange: (id: Id) => void;
  readonly label: string;
  // Ties each tab to its panel: tab `${idPrefix}-tab-${id}` controls `${idPrefix}-panel-${id}`.
  readonly idPrefix: string;
  readonly trailing?: ReactNode;
  readonly className?: string;
}): ReactElement {
  const list = useRef<HTMLDivElement>(null);
  useScrollEdges(list, value);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const enabled = items.filter((item) => !item.disabled);
    const at = enabled.findIndex((item) => item.id === value);
    const next =
      event.key === "ArrowRight"
        ? enabled[(at + 1) % enabled.length]
        : event.key === "ArrowLeft"
          ? enabled[(at - 1 + enabled.length) % enabled.length]
          : event.key === "Home"
            ? enabled[0]
            : event.key === "End"
              ? enabled[enabled.length - 1]
              : undefined;
    if (!next) return;
    event.preventDefault();
    onChange(next.id);
    list.current?.querySelector<HTMLElement>(`#${idPrefix}-tab-${next.id}`)?.focus();
  };
  return (
    <div
      className={cn("flex min-w-0 items-end gap-3 border-b border-line", className)}
      data-slot="tabs"
    >
      <div
        ref={list}
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="sl-tabs min-w-0 flex-1 border-b-0"
      >
        {items.map((item) => (
          <button
            key={item.id}
            id={`${idPrefix}-tab-${item.id}`}
            type="button"
            role="tab"
            aria-selected={item.id === value}
            aria-controls={`${idPrefix}-panel-${item.id}`}
            tabIndex={item.id === value ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onChange(item.id)}
            className={tabClass}
          >
            {item.label}
            {item.badge === undefined ? null : (
              <span className="sl-tab__count ml-0">{item.badge}</span>
            )}
          </button>
        ))}
      </div>
      {trailing ? <div className="flex shrink-0 items-center gap-2 pb-1">{trailing}</div> : null}
    </div>
  );
}

// The same bar for tabs that are routes: each one is a link, the current one marked.
export function TabLinks({
  items,
  label,
  className,
}: {
  readonly items: readonly {
    readonly to: string;
    readonly label: ReactNode;
    readonly search?: Readonly<Record<string, string>>;
  }[];
  readonly label: string;
  readonly className?: string;
}): ReactElement {
  const row = useRef<HTMLElement>(null);
  const pathname = useLocation({ select: (location) => location.pathname });
  useScrollEdges(row, pathname);
  return (
    <nav ref={row} aria-label={label} className={cn("sl-tabs min-w-0", className)}>
      {items.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          {...(item.search ? { search: item.search } : {})}
          activeOptions={{ exact: false, includeSearch: false }}
          className={tabClass}
          activeProps={{ "aria-current": "page" }}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function TabPanel({
  idPrefix,
  id,
  active,
  children,
  className,
}: {
  readonly idPrefix: string;
  readonly id: string;
  readonly active: boolean;
  readonly children: ReactNode;
  readonly className?: string;
}): ReactElement {
  return (
    <div
      id={`${idPrefix}-panel-${id}`}
      role="tabpanel"
      aria-labelledby={`${idPrefix}-tab-${id}`}
      hidden={!active}
      className={className}
    >
      {children}
    </div>
  );
}
