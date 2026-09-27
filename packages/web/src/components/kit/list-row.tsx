import type { ReactElement, ReactNode } from "react";
import { cn } from "@/lib/utils";

// A list of rows separated by hairlines, never boxed. Row actions (Edit, Duplicate, Use in
// Play, History, Delete) are visible on the row, not hidden in a menu.
export function List({
  label,
  className,
  children,
}: {
  readonly label: string;
  readonly className?: string;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <ul aria-label={label} className={cn("sl-list m-0 list-none p-0", className)}>
      {children}
    </ul>
  );
}

export function ListRow({
  title,
  meta,
  lead,
  actions,
  selected = false,
  onSelect,
  className,
}: {
  // Plain text, or a router Link when the row opens a page.
  readonly title: ReactNode;
  readonly meta?: ReactNode;
  // A thumbnail, lamp or icon before the text.
  readonly lead?: ReactNode;
  readonly actions?: ReactNode;
  // The row shown in the detail column of a list-and-detail page.
  readonly selected?: boolean;
  // Makes the title a button that selects the row (list and detail).
  readonly onSelect?: () => void;
  readonly className?: string;
}): ReactElement {
  return (
    <li
      data-selected={selected ? "true" : undefined}
      aria-current={selected ? "true" : undefined}
      className={cn("sl-row", className)}
    >
      <div className="sl-row__lead">
        {lead}
        <div className="sl-row__text">
          {onSelect === undefined ? (
            <span className="sl-row__title">{title}</span>
          ) : (
            <button
              type="button"
              onClick={onSelect}
              className="sl-row__title border-0 bg-transparent p-0 text-left text-ink"
            >
              {title}
            </button>
          )}
          {meta === undefined ? null : <span className="sl-row__meta">{meta}</span>}
        </div>
      </div>
      {actions === undefined ? null : <div className="sl-row__actions">{actions}</div>}
    </li>
  );
}
