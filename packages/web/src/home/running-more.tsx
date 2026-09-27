import type { ProjectListing } from "@app/slices/admission/model.js";
import type { ReactElement } from "react";
import { TextLink } from "@/components/kit/link";

// Started but not begun: waiting its turn behind the runs ahead of it (a batch or a schedule
// queues its runs one after another). A run that has made progress and stopped is waiting for
// the person instead (`isWaiting` in needs-you.tsx).
export function isQueued(project: ProjectListing): boolean {
  return project.status === "pending" && project.progress === 0;
}

// How many queued titles the line names before it says "and 3 more".
const namedQueued = 2;

// Under Running now: a link to every running project when Home shows only the first three,
// and one line for the runs queued behind them, which otherwise show nowhere on Home.
export function RunningMore({
  running,
  queued,
}: {
  readonly running: number;
  readonly queued: readonly ProjectListing[];
}): ReactElement | null {
  const moreRunning = running > 3;
  if (!moreRunning && queued.length === 0) return null;
  const titles = queued.slice(0, namedQueued).map((one) => one.title.trim() || "Untitled project");
  const rest = queued.length - titles.length;
  return (
    <div className="mt-3 flex flex-col gap-2">
      {moreRunning ? (
        <div>
          <TextLink
            to="/projects"
            search={{ show: "running" }}
          >{`See all ${String(running)} running`}</TextLink>
        </div>
      ) : null}
      {queued.length === 0 ? null : (
        <p className="m-0 flex flex-wrap items-center gap-x-2 text-small text-ink-2">
          <span>
            <span className="font-medium text-ink">{`Queued, waiting to start (${String(queued.length)}): `}</span>
            {titles.join(", ")}
            {rest > 0 ? ` and ${String(rest)} more` : ""}
          </span>
          <TextLink to="/projects" search={{ show: "queued" }}>
            See queued
          </TextLink>
        </p>
      )}
    </div>
  );
}
