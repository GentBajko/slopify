import type { ReactElement, ReactNode } from "react";
import { cn } from "@/lib/utils";

// Nothing here yet: a title saying what will be here, one line on how it gets here, and the
// action that makes the first one. No illustrations.
export function EmptyState({
  title,
  children,
  actions,
  className,
}: {
  readonly title: string;
  readonly children?: ReactNode;
  readonly actions?: ReactNode;
  readonly className?: string;
}): ReactElement {
  return (
    <div className={cn("sl-empty", className)} data-slot="empty-state">
      <h2 className="sl-section-head__title">{title}</h2>
      {children === undefined ? null : <p>{children}</p>}
      {actions === undefined ? null : <div className="sl-btn-row">{actions}</div>}
    </div>
  );
}
