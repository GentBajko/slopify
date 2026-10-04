import type { ReactElement, ReactNode } from "react";
import { ButtonRow } from "@/components/kit/button";
import { hitArea } from "@/components/kit/list-row";
import { cn } from "@/lib/utils";

// One row of Home's work list: the picture, its state, the title, at most one short line and
// the actions. The list is a size container (`sl-home-list`), so a narrow column moves the
// actions under the text instead of squeezing it to a word per line.
export function WorkItem({
  lead,
  status,
  title,
  detail,
  action,
}: {
  readonly lead: ReactNode;
  readonly status: ReactNode;
  readonly title: ReactNode;
  readonly detail?: ReactNode;
  readonly action: ReactNode;
}): ReactElement {
  return (
    <li className={cn("sl-home-item", hitArea)}>
      {lead}
      <div className="flex min-w-0 flex-col gap-1">
        {status}
        <div className="sl-row__title text-[17px]">{title}</div>
        {detail === undefined ? null : <div className="text-small text-ink-2">{detail}</div>}
      </div>
      <ButtonRow className="sl-home-item__action">{action}</ButtonRow>
    </li>
  );
}
