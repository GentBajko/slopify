import { type ReactElement, type ReactNode, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useScrollEdges } from "./scroll-edges.js";

// The three page shapes of the app (docs/design-system.md, Layout). Each uses the full width
// up to content-max and collapses to one column on phones.

// A page's title row, one line about 40px tall: the way back (crumb) small before the title,
// the title (once per page), a short meta beside it, and the page's actions on the right. The
// page's height goes to its content, not to a title the person just clicked in the rail. On a
// narrow window the meta, then the actions, wrap under the title.
export function PageHeader({
  title,
  crumb,
  meta,
  actions,
  display = false,
  className,
}: {
  readonly title: ReactNode;
  readonly crumb?: ReactNode;
  readonly meta?: ReactNode;
  readonly actions?: ReactNode;
  // The home greeting: the `display` size, once per screen at most.
  readonly display?: boolean;
  /** @deprecated Every page header is one row now; this does nothing. Drop it from the call. */
  readonly row?: boolean;
  readonly className?: string;
}): ReactElement {
  return (
    <header className={cn("sl-page-header", className)} data-slot="page-header">
      <div className="sl-page-header__lead">
        {crumb === undefined ? null : <div className="sl-crumb">{crumb}</div>}
        <h1 className={display ? "sl-display" : "sl-title-1"}>{title}</h1>
        {meta === undefined ? null : <p className="sl-page-header__meta">{meta}</p>}
      </div>
      {actions === undefined ? null : (
        <div className="sl-btn-row sl-page-header__actions">{actions}</div>
      )}
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
      {sections === undefined ? null : <WorkspaceSections>{sections}</WorkspaceSections>}
      <div className="sl-workspace__main">{children}</div>
      {aside === undefined ? null : (
        <aside aria-label={asideLabel} className="sl-workspace__aside">
          {aside}
        </aside>
      )}
    </div>
  );
}

// On a phone the section rail is a row of tabs that scrolls sideways (shell.css): its edges
// fade where more sections hide, and the current one is kept in view.
function WorkspaceSections({ children }: { readonly children: ReactNode }): ReactElement {
  const row = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState<string | undefined>(undefined);
  useScrollEdges(row, current);
  useEffect(() => {
    const element = row.current;
    if (element === null || typeof MutationObserver !== "function") return;
    const read = () =>
      setCurrent(
        element.querySelector('[aria-current]:not([aria-current="false"])')?.textContent ??
          undefined,
      );
    read();
    const watch = new MutationObserver(read);
    watch.observe(element, { subtree: true, attributes: true, attributeFilter: ["aria-current"] });
    return () => watch.disconnect();
  }, []);
  return (
    <div ref={row} className="sl-workspace__sections">
      {children}
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
