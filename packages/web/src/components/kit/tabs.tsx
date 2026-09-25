import { Link } from "@tanstack/react-router";
import { type KeyboardEvent, type ReactElement, type ReactNode, useRef } from "react";
import { cn } from "@/lib/utils";

export interface TabItem<Id extends string> {
  readonly id: Id;
  readonly label: ReactNode;
  // A count or state beside the label: "Checkpoints · 2", "Edit · 3 changes".
  readonly badge?: ReactNode;
  readonly disabled?: boolean;
}

const tabClass = (active: boolean) =>
  cn(
    "relative -mb-px inline-flex min-h-10 shrink-0 items-center gap-2 border-b-2 px-3 text-body font-semibold whitespace-nowrap",
    "transition-colors duration-150 ease-out motion-reduce:transition-none focus-visible:outline-offset-[-3px]",
    active ? "border-lamp-run text-ink" : "border-transparent text-ink2 hover:text-ink",
  );

// Secondary surfaces are tabs under the page bar, never blocks inserted above the primary one.
// Arrow keys move between tabs; the panel belongs to the caller, so a tab can keep its panel
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
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const enabled = items.filter((item) => !item.disabled);
    const at = enabled.findIndex((item) => item.id === value);
    const step = event.key === "ArrowRight" ? 1 : -1;
    const next = enabled[(at + step + enabled.length) % enabled.length];
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
        className="flex min-w-0 flex-1 items-end overflow-x-auto [scrollbar-width:none]"
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
            className={tabClass(item.id === value)}
          >
            {item.label}
            {item.badge === undefined ? null : (
              <span className="text-small font-normal text-ink3">{item.badge}</span>
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
  return (
    <nav
      aria-label={label}
      className={cn(
        "flex min-w-0 items-end overflow-x-auto border-b border-line [scrollbar-width:none]",
        className,
      )}
    >
      {items.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          {...(item.search ? { search: item.search } : {})}
          activeOptions={{ exact: false, includeSearch: false }}
          className={tabClass(false)}
          activeProps={{
            className: "!border-lamp-run !text-ink",
            "aria-current": "page",
          }}
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
