import type { ProjectListing } from "@app/slices/admission/model.js";
import { Link } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { QueueList, useBatchQueue, waitingOf } from "@/components/batch-queue";
import { TextLink } from "@/components/kit/link";
import { SectionHead } from "@/components/kit/section-head";
import { Status } from "@/components/kit/status";
import { plural } from "@/lib/format";

// Under Running: a link to every running project when Home shows only the first three, then
// the videos waiting to start, in the order they will run, with Earlier, Later and Remove
// (the video queue a "Queue 3 videos" in Create fills). A queued run the queue does not hold
// (one just started, not yet claimed) is listed after them.
export function RunningMore({
  running,
  queued,
  projects,
}: {
  readonly running: number;
  // The queued runs of the channel shown.
  readonly queued: readonly ProjectListing[];
  // Every project, for the queue's titles.
  readonly projects: readonly ProjectListing[];
}): ReactElement | null {
  const queue = useBatchQueue();
  const shown = new Set(queued.map((one) => one.id));
  const waiting = waitingOf(queue.data?.queue).filter((entry) => shown.has(entry.projectId));
  const inQueue = new Set(waiting.map((entry) => entry.projectId));
  const loose = queued.filter((one) => !inQueue.has(one.id));
  const moreRunning = running > 3;
  if (!moreRunning && queued.length === 0) return null;
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
        <section aria-label="Waiting to start" className="flex flex-col gap-1">
          <SectionHead
            as="h3"
            size="small"
            title="Waiting to start"
            meta={`${plural(queued.length, "video", "videos")}, in the order they start`}
          />
          {waiting.length === 0 ? null : <QueueList waiting={waiting} projects={projects} />}
          {loose.length === 0 ? null : (
            <ul aria-label="Queued" className="m-0 flex list-none flex-col p-0">
              {loose.map((project) => (
                <li
                  key={project.id}
                  className="flex min-h-9 items-center gap-2 border-b border-line py-1 text-small last:border-b-0"
                >
                  <Link
                    className="min-w-0 truncate font-medium text-ink"
                    to="/projects/$projectId"
                    params={{ projectId: project.id }}
                  >
                    {project.title.trim() || "Untitled project"}
                  </Link>
                  <Status tone="off">Queued</Status>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
