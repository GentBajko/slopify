import { Link } from "@tanstack/react-router";
import type { ReactElement, ReactNode } from "react";
import { ButtonRow } from "@/components/kit/button";
import { hitArea } from "@/components/kit/list-row";
import { cn } from "@/lib/utils";

// One row of a Home list: the picture, the title, then one line with the state in words and
// what the row is about, and the actions on the right. Rows sit between hairlines, dense enough
// to show eight or more in a screen. Where the column is too narrow for the text and the
// actions side by side, the actions wrap under the text instead of squeezing it.
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
      <div className="sl-home-item__body">
        <div className="sl-home-item__text flex flex-col gap-0.5">
          {/* A long title wraps rather than ending in an ellipsis, on a phone too. */}
          <div className="sl-row__title whitespace-normal">{title}</div>
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-small text-ink-2">
            {status}
            {detail === undefined ? null : <span className="min-w-0">{detail}</span>}
          </div>
        </div>
        <ButtonRow className="sl-home-item__action">{action}</ButtonRow>
      </div>
    </li>
  );
}

// A row's title: the project, opening its page.
export function projectLink(project: {
  readonly id: string;
  readonly title: string;
}): ReactElement {
  return (
    <Link to="/projects/$projectId" params={{ projectId: project.id }}>
      {project.title}
    </Link>
  );
}
