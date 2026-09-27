import type { QueueEntry } from "@app/slices/batch/index.js";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ListVideoIcon } from "lucide-react";
import type { ProjectListing } from "@/api";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { InfoTip } from "@/components/kit/info-tip";
import { SectionHead } from "@/components/kit/section-head";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { helpEntry } from "@/help/catalog";
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
    <section aria-label="Video queue" className="mb-5 rounded-media border border-line bg-surface">
      <SectionHead
        title={`Video queue · ${String(queue.data.queue.length)} remaining`}
        info="play.queue"
        size="small"
        className="min-h-10 items-center border-b border-line px-4 py-2"
      />
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
          variant="quiet"
          disabled={count === 0}
          aria-label={`Video queue: ${count} remaining`}
        >
          <ListVideoIcon aria-hidden="true" className="size-4" />
          <span className="tabular-nums">Queue · {count}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="p-0">
        <p className="border-b border-line px-3 py-2 text-small text-ink-2">
          {helpEntry("play.queue").body}
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
              className="truncate"
              to="/projects/$projectId"
              params={{ projectId: entry.projectId }}
            >
              {i + 1}. {project?.title ?? "Video"}
            </Link>
            <span className="shrink-0 text-ink-2">
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
