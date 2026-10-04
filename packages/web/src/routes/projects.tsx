import type { ProjectListing } from "@app/slices/admission/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusIcon, SearchIcon } from "lucide-react";
import { type ReactElement, useEffect, useMemo, useRef, useState } from "react";
import { removeProject } from "@/api";
import { useApp } from "@/app-context";
import { useCurrentChannel } from "@/channels/current";
import { Board, BoardColumn } from "@/components/kit/board";
import { Button } from "@/components/kit/button";
import { ariaKeyShortcuts, useCommand, useSearchShortcut } from "@/components/kit/command-palette";
import { ConfirmDialog } from "@/components/kit/dialog";
import { EmptyState } from "@/components/kit/empty-state";
import { Select } from "@/components/kit/field";
import { PageHeader } from "@/components/kit/layout";
import { ButtonLink, TextLink } from "@/components/kit/link";
import { List } from "@/components/kit/list-row";
import { SectionHead } from "@/components/kit/section-head";
import { Stat, Stats } from "@/components/kit/stats";
import { Segmented } from "@/components/kit/switch";
import { useToast } from "@/components/kit/toast";
import { RowCheck, useSelection } from "@/components/selection";
import { markUploaded } from "@/home/api";
import { onboardingKey, readFirstRun } from "@/onboarding/api";
import { keys, projectsQuery } from "@/queries";
import { TutorialInvite } from "@/tutorial/launcher";
import { ProjectsBulkBar, restoreProjects } from "./projects-bulk";
import {
  filters,
  matches,
  type ProjectFilter,
  type ProjectSort,
  projectsPage,
  sortOptions,
  sortProjects,
} from "./projects-order";
import { ProjectRow, SkeletonRows } from "./projects-row";

// Every run ever started, newest first unless another order is picked, for the channel picked
// in the rail. Each row says what the run was made of, when it started and where it stands,
// with its actions visible on it; ticked rows share a selection bar (projects-bulk.tsx).
// Beside the list on a desktop: the counts per state, and where the video queue is (the
// calendar, which shows it once for every screen).

export {
  type ProjectFilter,
  type ProjectSort,
  projectFilterOf,
  projectSortOf,
} from "./projects-order";
export { madeOf, stateOf } from "./projects-row";

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
  const current = useCurrentChannel();
  const projects = useQuery(projectsQuery(api));
  const [deleting, setDeleting] = useState<ProjectListing | undefined>(undefined);
  const [ownFilter, setOwnFilter] = useState<ProjectFilter>(initialFilter);
  const filter = shownFilter ?? ownFilter;
  const setFilter = (next: ProjectFilter) => {
    setOwnFilter(next);
    onFilter?.(next);
  };
  // The bundled sample projects carry a Sample badge.
  const firstRun = useQuery({ queryKey: onboardingKey, queryFn: () => readFirstRun(api) });
  const samples = new Set(
    Object.values(firstRun.data?.samples ?? {}).filter((id): id is string => id !== null),
  );
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
        run: () => void restoreProjects(api, queryClient, notify, [project]),
      }),
    onSettled: async () => {
      setDeleting(undefined);
      await queryClient.invalidateQueries({ queryKey: keys.projects });
    },
  });
  const uploaded = useMutation({
    mutationFn: (input: { readonly project: ProjectListing; readonly uploaded: boolean }) =>
      markUploaded(api, input.project.id, input.uploaded),
    onSuccess: (_, input) =>
      notify(
        input.uploaded
          ? `Marked uploaded: ${input.project.title}.`
          : `${input.project.title} is back on Ready to upload.`,
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
  const needle = search.trim().toLowerCase();
  const matching = sortProjects(
    inChannel.filter(
      (one) => matches(one, filter) && (needle === "" || one.title.toLowerCase().includes(needle)),
    ),
    sort,
  );
  // A new filter, search or order starts from the first page again.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the reset is keyed on what changed, not read inside.
  useEffect(() => setLimit(projectsPage), [filter, needle, sort]);
  const shown = matching.slice(0, limit);
  // Keyed on the ids, so a refetch with the same rows keeps the selection's range anchor.
  const shownIds = shown.map((one) => one.id).join("\n");
  const shownKeys = useMemo(() => (shownIds === "" ? [] : shownIds.split("\n")), [shownIds]);
  const selection = useSelection(shownKeys);

  return (
    <div>
      <PageHeader
        title="Projects"
        meta={
          projects.data === undefined
            ? undefined
            : `${String(inChannel.length)} ${inChannel.length === 1 ? "project" : "projects"} · ${current.channel?.name ?? "every channel"}`
        }
        actions={
          <ButtonLink to="/play" variant="primary">
            <PlusIcon aria-hidden="true" strokeWidth={1.75} />
            Create
          </ButtonLink>
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
          Set up a run on Play: pick a template, type a topic and start.
        </EmptyState>
      ) : (
        <Board split="aside">
          <BoardColumn label="Project list">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-full max-w-[320px]">
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
              <Segmented
                label="Show"
                value={filter}
                options={filters}
                onChange={setFilter}
                className="max-w-full overflow-x-auto"
              />
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
              <p className="m-0 text-ink-2">
                {inChannel.length === 0
                  ? `No projects in ${current.channel?.name ?? "this channel"} yet. Pick All channels in the rail to see the others.`
                  : "No project matches. Clear the search or pick All."}
              </p>
            ) : (
              <>
                {/* biome-ignore lint/a11y/noStaticElementInteractions: Esc clears the selection anywhere in the list; each row keeps its own controls. */}
                <div onKeyDown={selection.onKeyDown} className="flex flex-col gap-4">
                  <ProjectsBulkBar
                    selection={selection}
                    rows={shown}
                    {...(shown.length < inChannel.length
                      ? { scope: `Select all ${String(shown.length)} shown` }
                      : {})}
                  />
                  {(current.channel === undefined && current.channels.length > 1
                    ? current.channels
                        .map((channel) => ({
                          channel,
                          projects: shown.filter(
                            (one) => (one.channelId ?? current.channels[0]?.id) === channel.id,
                          ),
                        }))
                        .filter((group) => group.projects.length > 0)
                    : [{ channel: undefined, projects: shown }]
                  ).map((group) => (
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
                          meta={`${String(group.projects.length)} ${group.projects.length === 1 ? "project" : "projects"}`}
                        />
                      )}
                      <List label={group.channel?.name ?? "Projects"}>
                        {group.projects.map((project) => (
                          <ProjectRow
                            key={project.id}
                            project={project}
                            sample={samples.has(project.id)}
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
          </BoardColumn>
          <BoardColumn as="aside" label="Projects at a glance">
            <section>
              <SectionHead title="At a glance" />
              <Stats>
                {filters
                  .filter((one) => one.value !== "all")
                  .map((one) => (
                    <Stat
                      key={one.value}
                      label={one.label}
                      value={String(
                        inChannel.filter((project) => matches(project, one.value)).length,
                      )}
                    />
                  ))}
              </Stats>
            </section>
            <section aria-label="Video queue" className="flex flex-col gap-2">
              <SectionHead title="Video queue" info="play.queue" />
              <p className="m-0 text-small text-ink-2">
                Videos started together, in the order they run, are on the calendar.
              </p>
              <div>
                <TextLink to="/calendar">Open calendar</TextLink>
              </div>
            </section>
          </BoardColumn>
        </Board>
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
        consequence="Moves the project to the trash for 30 days. Undo brings it back, or restore it later in Settings → Backup & storage → Trash."
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
