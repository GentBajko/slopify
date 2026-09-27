import type { ReactElement, ReactNode } from "react";
import type { HelpId } from "@/help/catalog";
import { cn } from "@/lib/utils";
import { InfoTip } from "./info-tip.js";

// The heading of one section inside a page: an optional kicker above, the title, one meta
// line, the help behind an info button, and the section's own actions on the right in the
// fixed order primary, secondary, quiet, overflow (children).
export function SectionHead({
  title,
  kicker,
  meta,
  info,
  as: Heading = "h2",
  className,
  children,
}: {
  readonly title: string;
  // An uppercase-by-style label; write it in sentence case.
  readonly kicker?: ReactNode;
  readonly meta?: ReactNode;
  // The section's info button, from the help catalogue.
  readonly info?: HelpId;
  readonly as?: "h2" | "h3";
  readonly className?: string;
  readonly children?: ReactNode;
}): ReactElement {
  return (
    <div className={cn("sl-section-head", className)} data-slot="section-head">
      <div className="min-w-0">
        {kicker === undefined ? null : <div className="sl-kicker">{kicker}</div>}
        <div className="flex items-center gap-2">
          <Heading className={cn("sl-section-head__title", Heading === "h3" && "text-title-3")}>
            {title}
          </Heading>
          {info === undefined ? null : (
            <InfoTip id={info} label={title} />
          )}
        </div>
        {meta === undefined ? null : <p className="sl-section-head__meta">{meta}</p>}
      </div>
      {children === undefined ? null : (
        <div className="sl-btn-row min-w-0 shrink-0 justify-end max-md:shrink max-md:justify-start">
          {children}
        </div>
      )}
    </div>
  );
}
