import type { ProjectListing } from "@app/slices/admission/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SearchIcon } from "lucide-react";
import {
  type ReactElement,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { removeProject } from "@/api";
import { useApp } from "@/app-context";
import { useAssistantSelection } from "@/assistant/screen";
import { ChannelPicker, useCurrentChannel } from "@/channels/current";
import { useBatchQueue, waitingOf } from "@/components/batch-queue";
import { Button } from "@/components/kit/button";
import { ariaKeyShortcuts, useCommand, useSearchShortcut } from "@/components/kit/command-palette";
import { ConfirmDialog } from "@/components/kit/dialog";
import { EmptyState } from "@/components/kit/empty-state";
import { Select } from "@/components/kit/field";
import { PageHeader } from "@/components/kit/layout";
import { ButtonLink } from "@/components/kit/link";
import { List } from "@/components/kit/list-row";
import { SectionHead } from "@/components/kit/section-head";
import { Segmented } from "@/components/kit/switch";
import { useToast } from "@/components/kit/toast";
import { RowCheck, useSelection } from "@/components/selection";
import { markUploaded } from "@/home/api";
import { plural } from "@/lib/format";
import { keys, projectsQuery } from "@/queries";
import { trashKey } from "@/trash/api";
import { useOpenTrash } from "@/trash/open-trash";
import { TrashLink } from "@/trash/trash-link";
import { TutorialInvite } from "@/tutorial/launcher";
import { ProjectsBulkBar, restoreProjects } from "./projects-bulk";
import {
  filterCounts,
  filters,
  inQueueOrder,
  matches,
  type ProjectFilter,
  type ProjectSort,
  projectsPage,
  sortOptions,
  sortProjects,
} from "./projects-order";
import { ProjectRow, SkeletonRows } from "./projects-row";

// Every run ever started, newest first unless another order is picked, for the channel shown.
// The list takes the page's width: each row has its picture, what it made, when it finished,
// its state in words and its actions (Open, Download video, Mark uploaded, Delete). The filters
// carry their counts; a filter with nothing in it is not offered. Ticked rows share a selection
// bar (projects-bulk.tsx) that offers its actions only once something is ticked.

export {
  type ProjectFilter,
  type ProjectSort,
  projectFilterOf,
  projectSortOf,
} from "./projects-order";

// On a phone the filters are one select with their counts: a row of chips wrapped and clipped
// its labels there ("Ready / to").
const phoneQuery = "(max-width: 767px)";
function subscribePhone(listener: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(phoneQuery);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}
function isPhone(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(phoneQuery).matches;
}

// The rows under each channel's name, only while All channels shows rows of two or more: a
// single group's head would repeat the page's count and say nothing new.
function groupsOf(
  shown: readonly ProjectListing[],
  current: Pick<ReturnType<typeof useCurrentChannel>, "channel" | "channels">,
): readonly {
  readonly channel: ReturnType<typeof useCurrentChannel>["channels"][number] | undefined;
  readonly projects: readonly ProjectListing[];
}[] {
  const one = [{ channel: undefined, projects: shown }];
  if (current.channel !== undefined || current.channels.length < 2) return one;
  const groups = current.channels
    .map((channel) => ({
      channel,
      projects: shown.filter((row) => (row.channelId ?? current.channels[0]?.id) === channel.id),
    }))
    .filter((group) => group.projects.length > 0);
  return groups.length < 2 ? one : groups;
}

export function ProjectsRoute({
  initialFilter = "all",
  filter: shownFilter,
  query,
  sort: shownSort,
  onFilter,
  onQuery,
  onSort,
}: {
  readonly initialFilter?: ProjectFilter;
  // The filter, search words and order from the address (router.tsx); left out, the list
  // keeps its own.
  readonly filter?: ProjectFilter;
  readonly query?: string;
  readonly sort?: ProjectSort;
  readonly onFilter?: (filter: ProjectFilter) => void;
  readonly onQuery?: (query: string) => void;
  readonly onSort?: (sort: ProjectSort) => void;
} = {}): ReactElement {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const notify = useToast();
  const openTrash = useOpenTrash();
  const current = useCurrentChannel();
  const projects = useQuery(projectsQuery(api));
  const queue = useBatchQueue();
  const phone = useSyncExternalStore(subscribePhone, isPhone, () => false);
  const [deleting, setDeleting] = useState<ProjectListing | undefined>(undefined);
  const [ownFilter, setOwnFilter] = useState<ProjectFilter>(initialFilter);
  const filter = shownFilter ?? ownFilter;
  const setFilter = (next: ProjectFilter) => {
    setOwnFilter(next);
    onFilter?.(next);
  };
  // Typed here at once; the address follows a moment later, so it is not rewritten per key.
  const [search, setOwnSearch] = useState(query ?? "");
  const queryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(queryTimer.current), []);
  const setSearch = (next: string) => {
    setOwnSearch(next);
    if (onQuery === undefined) return;
    clearTimeout(queryTimer.current);
    queryTimer.current = setTimeout(() => onQuery(next), 300);
  };
  const [ownSort, setOwnSort] = useState<ProjectSort>("newest");
  const sort = shownSort ?? ownSort;
  const setSort = (next: ProjectSort) => {
    setOwnSort(next);
    onSort?.(next);
  };
  const [limit, setLimit] = useState(projectsPage);
  const searchBox = useRef<HTMLInputElement>(null);
  const searchKeys = useSearchShortcut(searchBox, "projects");

  const remove = useMutation({
    mutationFn: (project: ProjectListing) => removeProject(api, project.id),
    onSuccess: (_, project) =>
      notify(`Moved "${project.title}" to the trash.`, "success", {
        label: "Undo",
        run: () => void restoreProjects(api, queryClient, notify, [project], openTrash),
      }),
    onSettled: async () => {
      setDeleting(undefined);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.projects }),
        queryClient.invalidateQueries({ queryKey: trashKey }),
      ]);
    },
  });
  const uploaded = useMutation({
    mutationFn: (input: { readonly project: ProjectListing; readonly uploaded: boolean }) =>
      markUploaded(api, input.project.id, input.uploaded),
    onSuccess: (_, input) =>
      notify(
        input.uploaded
          ? `Marked uploaded: ${input.project.title}.`
          : // The long video's YouTube link and the mark are one fact (`studio/videos.ts`).
            `${input.project.title} is back on Ready to upload, and any YouTube link saved for its video is forgotten.`,
        "success",
        input.uploaded
          ? { label: "Undo", run: () => uploaded.mutate({ ...input, uploaded: false }) }
          : undefined,
      ),
    onError: (error: Error, input) =>
      notify(
        `${input.project.title} wasn't changed: ${error.message} Press the button again.`,
        "error",
      ),
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: keys.projects });
    },
  });

  useCommand({
    id: "projects.show.waiting",
    title: "Show projects that need you",
    group: "Projects",
    keywords: ["waiting", "filter"],
    run: () => setFilter("waiting"),
  });
  useCommand({
    id: "projects.show.ready",
    title: "Show videos ready to upload",
    group: "Projects",
    keywords: ["upload", "finished", "filter"],
    run: () => setFilter("ready"),
  });
  useCommand({
    id: "projects.show.failed",
    title: "Show failed projects",
    group: "Projects",
    keywords: ["error", "filter"],
    run: () => setFilter("failed"),
  });

  const inChannel = (projects.data?.projects ?? []).filter((one) =>
    current.includes(one.channelId),
  );
  const counts = filterCounts(inChannel);
  // The video queue's waiting projects, in the order they start.
  const waiting = waitingOf(queue.data?.queue).map((entry) => entry.projectId);
  const needle = search.trim().toLowerCase();
  const found = sortProjects(
    inChannel.filter(
      (one) => matches(one, filter) && (needle === "" || one.title.toLowerCase().includes(needle)),
    ),
    sort,
  );
  const matching = filter === "queued" ? inQueueOrder(found, waiting) : found;
  // A new filter, search or order starts from the first page again.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the reset is keyed on what changed, not read inside.
  useEffect(() => setLimit(projectsPage), [filter, needle, sort]);
  const shown = matching.slice(0, limit);
  // Keyed on the ids, so a refetch with the same rows keeps the selection's range anchor.
  const shownIds = shown.map((one) => one.id).join("\n");
  const shownKeys = useMemo(() => (shownIds === "" ? [] : shownIds.split("\n")), [shownIds]);
  const selection = useSelection(shownKeys);
  useAssistantSelection(
    "project",
    shown.filter((one) => selection.has(one.id)).map((one) => ({ id: one.id, label: one.title })),
  );
  // A filter with nothing in it is not offered, but the one in use stays so it can be left.
  const offered = filters.filter(
    (one) => one.value === "all" || one.value === filter || counts[one.value] > 0,
  );

  return (
    <div>
      <PageHeader
        title="Projects"
        meta={
          projects.data === undefined ? undefined : plural(inChannel.length, "project", "projects")
        }
        actions={
          <>
            <TrashLink kinds={["project"]} />
            <ChannelPicker />
          </>
        }
      />

      {projects.data?.projects.length === 0 ? <TutorialInvite /> : null}

      {projects.error === null ? null : (
        <p role="alert" className="m-0 mb-4 text-danger">
          {projects.error.message}
        </p>
      )}

      {projects.data === undefined ? (
        projects.error === null ? (
          <SkeletonRows />
        ) : null
      ) : projects.data.projects.length === 0 ? (
        <EmptyState
          title="No projects yet"
          actions={
            <ButtonLink to="/play" variant="primary">
              Make your first video
            </ButtonLink>
          }
        >
          Every video you make is kept here with its files.
        </EmptyState>
      ) : inChannel.length === 0 ? (
        // The channel shown has made nothing yet; the other channels have.
        <EmptyState
          title={`No projects in ${current.channel?.name ?? "this channel"} yet`}
          actions={
            <>
              <ButtonLink to="/play" variant="primary">
                Make a video
              </ButtonLink>
              <Button onClick={() => current.setChannelId(null)}>Show all channels</Button>
            </>
          }
        >
          Every video made in this channel is kept here with its files.
        </EmptyState>
      ) : (
        <section aria-label="Project list" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {/* It gives way first, so the filters and the order stay on one line at 1024. */}
            <div className="relative min-w-[12rem] max-w-[320px] flex-1 max-md:max-w-none">
              <SearchIcon
                aria-hidden="true"
                strokeWidth={1.75}
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3"
              />
              <input
                type="search"
                ref={searchBox}
                aria-label="Search projects"
                aria-keyshortcuts={ariaKeyShortcuts(searchKeys)}
                placeholder="Search projects"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="sl-input pl-9"
              />
            </div>
            {offered.length < 2 ? null : phone ? (
              <Select
                aria-label="Show"
                className="w-auto min-w-0 flex-1"
                value={filter}
                onChange={(event) => {
                  const next = filters.find((one) => one.value === event.currentTarget.value);
                  if (next !== undefined) setFilter(next.value);
                }}
                options={offered.map((one) => ({
                  value: one.value,
                  label: `${one.label} (${String(counts[one.value])})`,
                }))}
              />
            ) : (
              <Segmented
                label="Show"
                value={filter}
                options={offered.map((one) => ({
                  value: one.value,
                  label: (
                    <>
                      {one.label}{" "}
                      <span className="sl-tab__count ml-0 tabular-nums">
                        {String(counts[one.value])}
                      </span>
                    </>
                  ),
                }))}
                onChange={setFilter}
                className="max-w-full overflow-x-auto"
              />
            )}
            <Select
              aria-label="Sort projects"
              className="w-auto"
              value={sort}
              onChange={(event) => {
                const next = sortOptions.find((one) => one.value === event.currentTarget.value);
                if (next !== undefined) setSort(next.value);
              }}
              options={sortOptions}
            />
          </div>
          {shown.length === 0 ? (
            <p className="m-0 text-ink-2">No project matches. Clear the search or pick All.</p>
          ) : (
            <>
              {/* biome-ignore lint/a11y/noStaticElementInteractions: Esc clears the selection anywhere in the list; each row keeps its own controls. */}
              <div onKeyDown={selection.onKeyDown} className="flex flex-col gap-2">
                <ProjectsBulkBar
                  selection={selection}
                  rows={shown}
                  {...(shown.length < inChannel.length
                    ? { scope: `Select all ${String(shown.length)} shown` }
                    : {})}
                />
                {groupsOf(shown, current).map((group) => (
                  <section
                    key={group.channel?.id ?? "all"}
                    aria-label={group.channel?.name ?? "Projects"}
                    className="flex flex-col gap-2"
                  >
                    {group.channel === undefined ? null : (
                      <SectionHead
                        as="h3"
                        size="small"
                        title={group.channel.name}
                        meta={plural(group.projects.length, "project", "projects")}
                      />
                    )}
                    <List label={group.channel?.name ?? "Projects"} className="sl-projects">
                      {group.projects.map((project) => (
                        <ProjectRow
                          key={project.id}
                          project={project}
                          {...(waiting.includes(project.id)
                            ? {
                                queue: {
                                  place: waiting.indexOf(project.id),
                                  waiting: waiting.length,
                                },
                              }
                            : {})}
                          check={
                            <RowCheck
                              selection={selection}
                              value={project.id}
                              label={project.title}
                            />
                          }
                          onDelete={() => setDeleting(project)}
                          onUploaded={(next) => uploaded.mutate({ project, uploaded: next })}
                          busy={uploaded.isPending}
                        />
                      ))}
                    </List>
                  </section>
                ))}
              </div>
              {matching.length > shown.length ? (
                <div className="flex flex-wrap items-center gap-3">
                  <Button size="small" onClick={() => setLimit((now) => now + projectsPage)}>
                    {`Show ${String(Math.min(projectsPage, matching.length - shown.length))} more`}
                  </Button>
                  <span className="text-small text-ink-2 tabular-nums">
                    {`${String(shown.length)} of ${String(matching.length)} shown`}
                  </span>
                </div>
              ) : null}
            </>
          )}
        </section>
      )}

      {remove.error === null ? null : (
        <p role="alert" className="mt-3 text-small text-danger">
          {remove.error.message}
        </p>
      )}

      <ConfirmDialog
        open={deleting !== undefined}
        title={deleting === undefined ? "" : `Delete "${deleting.title}"?`}
        // Settings → Trash puts it back, or removes the rows and the folder for good.
        consequence="Moves the project to the trash for 30 days. Undo brings it back, or restore it later in Settings → Trash."
        confirmLabel="Delete project"
        cancelLabel="Keep it"
        pending={remove.isPending}
        onConfirm={() => {
          if (deleting !== undefined) remove.mutate(deleting);
        }}
        onCancel={() => setDeleting(undefined)}
      />
    </div>
  );
}
