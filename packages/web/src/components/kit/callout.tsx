import { AlertTriangleIcon, InfoIcon, PauseCircleIcon } from "lucide-react";
import { type ReactElement, type ReactNode, useId } from "react";
import { cn } from "@/lib/utils";

// A notice in the flow of a section, on its status tint: what happened, why, and the one thing
// that fixes it as a button (not a paragraph of instructions). Danger is a failure, waiting
// is waiting on the person or a limit, info is a review flag or outdated work.
export type CalloutTone = "danger" | "waiting" | "info";

const icons: Readonly<Record<CalloutTone, ReactElement>> = {
  danger: <AlertTriangleIcon aria-hidden="true" strokeWidth={1.75} />,
  waiting: <PauseCircleIcon aria-hidden="true" strokeWidth={1.75} />,
  info: <InfoIcon aria-hidden="true" strokeWidth={1.75} />,
};

export function Callout({
  tone = "info",
  title,
  children,
  actions,
  className,
}: {
  readonly tone?: CalloutTone;
  readonly title: ReactNode;
  readonly children?: ReactNode;
  readonly actions?: ReactNode;
  readonly className?: string;
}): ReactElement {
  const titleId = useId();
  const look = cn("sl-callout", tone !== "info" && `sl-callout--${tone}`, className);
  const parts = (
    <>
      {icons[tone]}
      <span id={titleId} className="sl-callout__title">
        {title}
      </span>
      {children === undefined ? null : <div className="sl-callout__body">{children}</div>}
      {actions === undefined ? null : <div className="sl-callout__actions">{actions}</div>}
    </>
  );
  // Named by its title, so a page with several is read one by one.
  return tone === "danger" ? (
    <div role="alert" aria-labelledby={titleId} data-tone={tone} className={look}>
      {parts}
    </div>
  ) : (
    <div role="status" aria-labelledby={titleId} data-tone={tone} className={look}>
      {parts}
    </div>
  );
}
