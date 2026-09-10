import type { QueueEntry } from "@app/slices/batch/index.js";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useApp } from "@/app-context";
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
    <details className="mb-4 rounded-panel border border-line bg-panel p-3" open>
      <summary className="cursor-pointer text-body font-semibold">
        Video queue · {queue.data.queue.length} remaining
      </summary>
      <p className="mt-1 text-small text-ink2">
        One batch video runs at a time. Pause holds the queue; failure or cancellation advances it.
      </p>
      <ol className="mt-2 max-h-40 overflow-y-auto">
        {queue.data.queue.map((entry, i) => {
          const project = projects.data?.projects.find((p) => p.id === entry.projectId);
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
    </details>
  );
}
