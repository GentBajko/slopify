import type { ReactElement, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Status, type Tone } from "./status.js";

// The next action rule: a project shows exactly one primary action for its situation, in the
// right rail. The status says where things stand, the title what is ready, `why` what the
// action will do, and the action is one primary button named for its result. States that
// need no action render no NextAction at all.
export function NextAction({
  tone,
  status,
  title,
  why,
  action,
  className,
}: {
  readonly tone: Tone;
  readonly status: string;
  readonly title: ReactNode;
  readonly why?: ReactNode;
  readonly action?: ReactNode;
  readonly className?: string;
}): ReactElement {
  return (
    <section aria-label="Next action" className={cn("sl-next", className)}>
      <Status tone={tone}>{status}</Status>
      <p className="sl-next__title">{title}</p>
      {why === undefined ? null : <p className="sl-next__why">{why}</p>}
      {action === undefined ? null : <div className="flex flex-col [&>*]:w-full">{action}</div>}
    </section>
  );
}
