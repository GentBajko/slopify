import type { ReactElement, ReactNode } from "react";
import { cn } from "@/lib/utils";

// The three page shapes of the app (docs/design-system.md, Layout). Each uses the full width
// up to content-max and collapses to one column on phones.

// A page title row: crumb, `title-1` (once per page), one meta line, and the page's actions
// on the right.
export function PageHeader({
  title,
  crumb,
  meta,
  actions,
  display = false,
  row = false,
  className,
}: {
  readonly title: ReactNode;
  readonly crumb?: ReactNode;
  readonly meta?: ReactNode;
  readonly actions?: ReactNode;
  // The home greeting: the `display` size, once per screen at most.
  readonly display?: boolean;
  // One row: the way back, the title, the meta line and the actions side by side, for a
  // working page whose height is better spent on its content (a project's page). Wraps on a
  // narrow window.
  readonly row?: boolean;
  readonly className?: string;
}): ReactElement {
  if (row)
    return (
      <header
        className={cn(
          "sl-page-header-row mb-4 flex flex-wrap items-center gap-x-4 gap-y-2",
          className,
        )}
        data-slot="page-header"
      >
        {crumb === undefined ? null : <div className="sl-crumb shrink-0">{crumb}</div>}
        <h1 className="sl-title-1 min-w-0 break-words">{title}</h1>
        {meta === undefined ? null : <p className="m-0 min-w-0 text-small text-ink-2">{meta}</p>}
        {actions === undefined ? null : <div className="sl-btn-row ml-auto">{actions}</div>}
      </header>
    );
  return (
    <header
      className={cn("mb-6 flex flex-wrap items-end justify-between gap-4", className)}
      data-slot="page-header"
    >
      <div className="min-w-0">
        {crumb === undefined ? null : <div className="sl-crumb">{crumb}</div>}
        <h1 className={cn(display ? "sl-display" : "sl-title-1", "mt-1 break-words")}>{title}</h1>
        {meta === undefined ? null : <p className="m-0 mt-1 text-small text-ink-2">{meta}</p>}
      </div>
      {actions === undefined ? null : <div className="sl-btn-row">{actions}</div>}
    </header>
  );
}

// Workspace (project, Play): a left rail for sections or steps, a fluid main column, and a
// right rail for the next action, costs and status. Either rail can be left out.
export function Workspace({
  sections,
  aside,
  asideLabel = "Status and next action",
  children,
  className,
}: {
  readonly sections?: ReactNode;
  readonly aside?: ReactNode;
  readonly asideLabel?: string;
  readonly children: ReactNode;
  readonly className?: string;
}): ReactElement {
  return (
    <div
      className={cn(
        "sl-workspace",
        sections === undefined && "sl-workspace--no-sections",
        aside === undefined && "sl-workspace--no-aside",
        sections === undefined && aside === undefined && "!grid-cols-1",
        className,
      )}
    >
      {sections === undefined ? null : <div className="sl-workspace__sections">{sections}</div>}
      <div className="sl-workspace__main">{children}</div>
      {aside === undefined ? null : (
        <aside aria-label={asideLabel} className="sl-workspace__aside">
          {aside}
        </aside>
      )}
    </div>
  );
}

// List and detail (Library, channels, schedules): the list column beside the detail column,
// which edits in place.
export function ListDetail({
  list,
  detail,
  className,
}: {
  readonly list: ReactNode;
  readonly detail: ReactNode;
  readonly className?: string;
}): ReactElement {
  return (
    <div className={cn("sl-listdetail", className)}>
      <div className="sl-listdetail__list">{list}</div>
      <div className="sl-listdetail__detail">{detail}</div>
    </div>
  );
}

// A section divider inside a surface: space and a hairline, never another surface.
export function Rule({ className }: { readonly className?: string }): ReactElement {
  return <hr className={cn("sl-rule", className)} />;
}
