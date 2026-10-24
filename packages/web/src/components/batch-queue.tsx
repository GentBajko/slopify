import type { QueueEntry } from "@app/slices/batch/index.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { type Api, type ProjectListing, removeProject } from "@/api";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/kit/popover";
import { QueryState } from "@/components/kit/query-state";
import { Status } from "@/components/kit/status";
import { useToast } from "@/components/kit/toast";
import { helpEntry } from "@/help/catalog";
import { read } from "@/http";
import { plural } from "@/lib/format";
import { keys, projectsQuery } from "@/queries";
import { restoreTrashItem } from "@/trash/api";

const queueKey = ["batch-queue"] as const;

// The video queue: videos started together ("Queue 3 videos" in Create) run one at a time, in
// this order. Home lists the waiting ones under Running, the Projects list sorts its Queued
// filter by it, and a project page says how many wait.
export function useBatchQueue() {
  const { api } = useApp();
  return useQuery({
    queryKey: queueKey,
    queryFn: async () =>
      read<{ queue: QueueEntry[] }>(await api.fetch(`${api.origin}/api/projects/queue`)),
    refetchInterval: 2000,
    retry: false,
  });
}

// The waiting videos, in the order they start.
export function waitingOf(queue: readonly QueueEntry[] | undefined): readonly QueueEntry[] {
  return (queue ?? []).filter((entry) => entry.state === "queued");
}

// For a project page: "2 videos waiting in the queue", opening the list with its order and
// Earlier, Later and Remove. Nothing at all while nothing waits, so a finished project carries
// no queue it has no part in.
export function BatchQueueCount(): ReactElement | null {
  const { api } = useApp();
  const queue = useBatchQueue();
  const projects = useQuery(projectsQuery(api));
  const waiting = waitingOf(queue.data?.queue);
  // Unknown is not zero: when the queue can't be read the button says so and opens on Retry.
  if (queue.error === null && waiting.length === 0) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="quiet">
          {queue.error === null
            ? `${plural(waiting.length, "video", "videos")} waiting in the queue`
            : "The video queue didn't load"}
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
        <QueueList waiting={waiting} projects={projects.data?.projects} className="px-3 py-2" />
      </PopoverContent>
    </Popover>
  );
}

// The waiting videos in their order, each with its place, a link to it, and Earlier, Later and
// Remove.
export function QueueList({
  waiting,
  projects,
  className,
}: {
  readonly waiting: readonly QueueEntry[];
  readonly projects: readonly ProjectListing[] | undefined;
  readonly className?: string;
}): ReactElement {
  return (
    <ol
      aria-label="Waiting to start"
      className={`m-0 flex list-none flex-col p-0 ${className ?? ""}`}
    >
      {waiting.map((entry, place) => {
        const project = projects?.find((one) => one.id === entry.projectId);
        const title = project?.title.trim() || "Untitled project";
        return (
          <li
            key={entry.projectId}
            className="flex min-h-9 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-line py-1 text-small last:border-b-0"
          >
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="text-ink-3 tabular-nums">{`${String(place + 1)}.`}</span>
              <Link
                className="min-w-0 truncate font-medium text-ink"
                to="/projects/$projectId"
                params={{ projectId: entry.projectId }}
              >
                {title}
              </Link>
              <Status tone="off">{project?.status === "paused" ? "Paused" : "Queued"}</Status>
            </span>
            <span className="flex shrink-0 items-center gap-1">
              <QueueItemActions
                projectId={entry.projectId}
                title={title}
                place={place}
                waiting={waiting.length}
              />
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// Earlier, Later and Remove for a video still waiting its turn in the batch queue (here, on Home
// and on Calendar). One already started keeps its place and is stopped from its own page. The
// first has no Earlier and the last no Later.
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
    void client.invalidateQueries({ queryKey: keys.calendar });
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
      {place <= 0 ? null : (
        <Button
          size="small"
          variant="quiet"
          aria-label={`Move ${title} earlier in the queue`}
          disabled={busy}
          onClick={() => move.mutate(-1)}
        >
          Earlier
        </Button>
      )}
      {place >= waiting - 1 ? null : (
        <Button
          size="small"
          variant="quiet"
          aria-label={`Move ${title} later in the queue`}
          disabled={busy}
          onClick={() => move.mutate(1)}
        >
          Later
        </Button>
      )}
      <Button
        size="small"
        variant="quiet"
        aria-label={`Remove ${title} from the queue`}
        disabled={busy}
        onClick={() => remove.mutate()}
      >
        Remove
      </Button>
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
