import type { QueueEntry } from "@app/slices/batch/index.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowDownIcon, ArrowUpIcon, ListVideoIcon, XIcon } from "lucide-react";
import type { ReactElement } from "react";
import { type Api, type ProjectListing, removeProject } from "@/api";
import { useApp } from "@/app-context";
import { Button, IconButton } from "@/components/kit/button";
import { QueryState } from "@/components/kit/query-state";
import { useToast } from "@/components/kit/toast";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { helpEntry } from "@/help/catalog";
import { read } from "@/http";
import { projectsQuery } from "@/queries";
import { restoreTrashItem } from "@/trash/api";

const queueKey = ["batch-queue"] as const;

// The queue as a count, for the project page bar: the list opens in a popover, so the page
// under it never moves when a batch starts or drains.
export function BatchQueueCount() {
  const { api } = useApp();
  const queue = useQuery({
    queryKey: queueKey,
    queryFn: async () =>
      read<{ queue: QueueEntry[] }>(await api.fetch(`${api.origin}/api/projects/queue`)),
    refetchInterval: 2000,
    retry: false,
  });
  const projects = useQuery(projectsQuery(api));
  const count = queue.data?.queue.length;
  // Unknown is not zero: before the queue answers, or when it can't, the count says so and the
  // popover opens on the reason and Retry.
  const shown = count === undefined ? (queue.error === null ? "…" : "?") : String(count);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="quiet"
          disabled={count === 0 && queue.error === null}
          disabledReason="Nothing is queued"
          aria-label={
            count === undefined
              ? queue.error === null
                ? "Video queue: loading"
                : "Video queue: didn't load"
              : `Video queue: ${String(count)} remaining`
          }
        >
          <ListVideoIcon aria-hidden="true" className="size-4" />
          <span className="tabular-nums">Queue · {shown}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="p-0">
        <p className="border-b border-line px-3 py-2 text-small text-ink-2">
          {helpEntry("play.queue").body}
        </p>
        <div className="px-3 py-2 empty:hidden">
          <QueryState query={queue} what="The video queue" compact loading={null}>
            {() => null}
          </QueryState>
        </div>
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
  const waiting = queue.filter((entry) => entry.state === "queued");
  return (
    <ol className="max-h-60 overflow-y-auto px-4 py-2">
      {queue.map((entry, i) => {
        const project = projects?.find((p) => p.id === entry.projectId);
        const title = project?.title ?? "Video";
        return (
          <li
            key={entry.projectId}
            className="flex items-center justify-between gap-2 py-1 text-small"
          >
            <Link
              className="min-w-0 truncate"
              to="/projects/$projectId"
              params={{ projectId: entry.projectId }}
            >
              {i + 1}. {title}
            </Link>
            <span className="flex shrink-0 items-center gap-1 text-ink-2">
              {project?.status === "paused"
                ? "Paused"
                : entry.state === "active"
                  ? "Active"
                  : "Queued"}
              {entry.state === "queued" ? (
                <QueueItemActions
                  projectId={entry.projectId}
                  title={title}
                  place={waiting.indexOf(entry)}
                  waiting={waiting.length}
                />
              ) : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// Up, Down and Remove for a video still waiting its turn in the batch queue (here and on
// Calendar). One already started keeps its place and is stopped from its own page.
export function QueueItemActions({
  projectId,
  title,
  place,
  waiting,
}: {
  readonly projectId: string;
  readonly title: string;
  // Its place among the waiting videos, from 0.
  readonly place: number;
  readonly waiting: number;
}): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const notify = useToast();
  const refresh = () => {
    void client.invalidateQueries({ queryKey: queueKey });
    void client.invalidateQueries({ queryKey: ["projects"] });
    void client.invalidateQueries({ queryKey: ["calendar"] });
  };
  const move = useMutation({
    mutationFn: (by: -1 | 1) => moveQueued(api, projectId, by),
    onSuccess: refresh,
    onError: (error: Error) => {
      refresh();
      notify(`${title} wasn't moved: ${error.message}`, "error");
    },
  });
  // Remove puts the project in the Trash, which takes it out of the queue; Undo (or Restore in
  // Settings → Trash) puts it back in its place.
  const remove = useMutation({
    mutationFn: () => removeProject(api, projectId),
    onSuccess: () => {
      refresh();
      notify(`${title} left the queue and is in Settings → Trash.`, "success", {
        label: "Undo",
        run: () =>
          void restoreTrashItem(api, "project", projectId).then(refresh, (error: Error) =>
            notify(
              `${title} wasn't put back: ${error.message} Restore it from Settings → Trash.`,
              "error",
            ),
          ),
      });
    },
    onError: (error: Error) => notify(`${title} wasn't removed: ${error.message}`, "error"),
  });
  const busy = move.isPending || remove.isPending;
  return (
    <>
      <IconButton
        size="small"
        label={`Move ${title} earlier in the queue`}
        disabled={busy || place <= 0}
        onClick={() => move.mutate(-1)}
      >
        <ArrowUpIcon aria-hidden="true" strokeWidth={1.75} />
      </IconButton>
      <IconButton
        size="small"
        label={`Move ${title} later in the queue`}
        disabled={busy || place >= waiting - 1}
        onClick={() => move.mutate(1)}
      >
        <ArrowDownIcon aria-hidden="true" strokeWidth={1.75} />
      </IconButton>
      <IconButton
        size="small"
        label={`Remove ${title} from the queue`}
        disabled={busy}
        onClick={() => remove.mutate()}
      >
        <XIcon aria-hidden="true" strokeWidth={1.75} />
      </IconButton>
    </>
  );
}

async function moveQueued(
  api: Api,
  projectId: string,
  by: -1 | 1,
): Promise<{ readonly queue: QueueEntry[] }> {
  return read<{ queue: QueueEntry[] }>(
    await api.fetch(`${api.origin}/api/projects/queue/${encodeURIComponent(projectId)}/move`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ by }),
    }),
  );
}
