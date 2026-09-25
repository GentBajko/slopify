import type { QueueEntry } from "@app/slices/batch/index.js";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ListVideoIcon } from "lucide-react";
import type { ProjectListing } from "@/api";
import { useApp } from "@/app-context";
import { InfoTip } from "@/components/kit/info-tip";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { read } from "@/http";
import { projectsQuery } from "@/queries";
export function BatchQueue() {
  const { api } = useApp();
  const queue = useQuery({
    queryKey: ["batch-queue"],
    queryFn: async () =>
      read<{ queue: QueueEntry[] }>(await api.fetch(`${api.origin}/api/projects/queue`)),
    refetchInterval: 2000,
    retry: false,
  });
  const projects = useQuery(projectsQuery(api));
  if (!queue.data?.queue.length) return null;
  return (
    <section
      aria-label="Video queue"
      className="mb-4 overflow-hidden rounded-panel border border-line bg-panel"
    >
      <div className="flex min-h-10 items-center gap-2 border-b border-line px-4">
        <h2 className="engraved text-ink3">Video queue · {queue.data.queue.length} remaining</h2>
        <InfoTip label="the video queue">
          <p>
            One batch video runs at a time. Pause holds the queue; failure or cancellation advances
            it.
          </p>
        </InfoTip>
      </div>
      <QueueList queue={queue.data.queue} projects={projects.data?.projects} />
    </section>
  );
}

// The queue as a count, for the project page bar: the list opens in a popover, so the page
// under it never moves when a batch starts or drains.
export function BatchQueueCount() {
  const { api } = useApp();
  const queue = useQuery({
    queryKey: ["batch-queue"],
    queryFn: async () =>
      read<{ queue: QueueEntry[] }>(await api.fetch(`${api.origin}/api/projects/queue`)),
    refetchInterval: 2000,
    retry: false,
  });
  const projects = useQuery(projectsQuery(api));
  const count = queue.data?.queue.length ?? 0;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          disabled={count === 0}
          aria-label={`Video queue: ${count} remaining`}
        >
          <ListVideoIcon aria-hidden="true" className="size-4" />
          <span className="tabular-nums">Queue · {count}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="p-0">
        <p className="border-b border-line px-3 py-2 text-small text-ink2">
          One batch video runs at a time. Pause holds the queue; failure or cancellation advances
          it.
        </p>
        <QueueList queue={queue.data?.queue ?? []} projects={projects.data?.projects} />
      </PopoverContent>
    </Popover>
  );
}

function QueueList({
  queue,
  projects,
}: {
  readonly queue: readonly QueueEntry[];
  readonly projects: readonly ProjectListing[] | undefined;
}) {
  return (
    <ol className="max-h-40 overflow-y-auto px-4 py-2">
      {queue.map((entry, i) => {
        const project = projects?.find((p) => p.id === entry.projectId);
        return (
          <li key={entry.projectId} className="flex justify-between gap-3 py-1 text-small">
            <Link
              className="truncate underline"
              to="/projects/$projectId"
              params={{ projectId: entry.projectId }}
            >
              {i + 1}. {project?.title ?? "Video"}
            </Link>
            <span className="shrink-0 text-ink2">
              {project?.status === "paused"
                ? "Paused"
                : entry.state === "active"
                  ? "Active"
                  : "Queued"}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
