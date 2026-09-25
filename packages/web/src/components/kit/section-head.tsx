import type { ReactElement, ReactNode } from "react";
import { InfoTip } from "./info-tip.js";

// The heading of one section inside a page: its title, the help behind an info button, and the
// section's own actions at the right end of the same row.
export function SectionHead({
  title,
  info,
  children,
}: {
  readonly title: string;
  readonly info?: string;
  readonly children?: ReactNode;
}): ReactElement {
  return (
    <div className="mb-4 flex min-h-8 flex-wrap items-center gap-2">
      <h2 className="text-row font-semibold">{title}</h2>
      {info === undefined ? null : (
        <InfoTip label={title}>
          <p>{info}</p>
        </InfoTip>
      )}
      {children === undefined ? null : (
        <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>
      )}
    </div>
  );
}
