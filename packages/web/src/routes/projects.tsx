import type { ProjectState } from "@app/kernel/pipeline.js";
import type { ProjectListing } from "@app/slices/admission/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { PlusIcon, SearchIcon, Trash2Icon } from "lucide-react";
import { type ReactElement, useState } from "react";
import { removeProject } from "@/api";
import { useApp } from "@/app-context";
import { useCurrentChannel } from "@/channels/current";
import { Button, IconButton } from "@/components/kit/button";
import { useCommand } from "@/components/kit/command-palette";
import { ConfirmDialog } from "@/components/kit/dialog";
import { EmptyState } from "@/components/kit/empty-state";
import { InfoTip } from "@/components/kit/info-tip";
import { PageHeader } from "@/components/kit/layout";
import { List, ListRow } from "@/components/kit/list-row";
import { Meter } from "@/components/kit/stats";
import { Badge, Status, type Tone } from "@/components/kit/status";
import { Segmented } from "@/components/kit/switch";
import { useToast } from "@/components/kit/toast";
import { markUploaded } from "@/home/api";
import { isWaiting } from "@/home/needs-you";
import { isReadyToUpload } from "@/home/ready";
import { startedAt } from "@/lib/utils";
import { onboardingKey, readFirstRun } from "@/onboarding/api";
import { limitWaitLine } from "@/project/limit-wait";
import { keys, projectsQuery } from "@/queries";
import { TutorialInvite } from "@/tutorial/launcher";

// Every run ever started, newest first, for the channel picked in the rail. Each row says what
// the run was made of, when it started and where it stands, with its actions visible on it.

type Filter = "all" | "running" | "waiting" | "ready" | "failed";

const filters: readonly { readonly value: Filter; readonly label: string }[] = [
  { value: "all", label: "All" },
  { value: "running", label: "Running" },
  { value: "waiting", label: "Needs you" },
  { value: "ready", label: "Ready to upload" },
  { value: "failed", label: "Failed" },
];

function matches(project: ProjectListing, filter: Filter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "running":
      return project.status === "running" || project.status === "paused";
    case "waiting":
      return isWaiting(project);
    case "ready":
      return isReadyToUpload(project);
    case "failed":
      return project.status === "failed" || project.status === "partial";
  }
}

// The state in words, with its lamp.
export function stateOf(project: ProjectListing): { readonly tone: Tone; readonly word: string } {
  const words: Readonly<Record<ProjectState, { readonly tone: Tone; readonly word: string }>> = {
    running: { tone: "running", word: "Running" },
    paused: { tone: "waiting", word: "Paused" },
    pending: { tone: "off", word: "Queued" },
    failed: { tone: "failed", word: "Failed" },
    partial: { tone: "info", word: "Done with problems" },
    done: { tone: "done", word: "Done" },
    canceled: { tone: "off", word: "Canceled" },
  };
  if (isWaiting(project)) return { tone: "waiting", word: "Waiting for you" };
  // Running, but a step waits for a CLI plan to reset: "Waiting for Codex limits (resets at 14:00)".
  const limits = project.status === "running" ? limitWaitLine(project.limitWaits) : undefined;
  return limits === undefined ? words[project.status] : { tone: "waiting", word: limits };
}

// "Documentary dossier · 16:9". The prompt name is the run's own copy of it; a run that
// generated no article from a template names only its format.
export function madeOf(project: ProjectListing): string {
  const prompt = project.config.articlePrompt;
  return [prompt === undefined || prompt === "" ? undefined : prompt, project.format]
    .filter((part) => part !== undefined)
    .join(" · ");
}

export function ProjectsRoute(): ReactElement {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const notify = useToast();
  const current = useCurrentChannel();
  const projects = useQuery(projectsQuery(api));
  const [deleting, setDeleting] = useState<ProjectListing | undefined>(undefined);
  const [filter, setFilter] = useState<Filter>("all");
  // The bundled sample projects carry a Sample badge.
  const firstRun = useQuery({ queryKey: onboardingKey, queryFn: () => readFirstRun(api) });
  const samples = new Set(
    Object.values(firstRun.data?.samples ?? {}).filter((id): id is string => id !== null),
  );
  const [search, setSearch] = useState("");

  const remove = useMutation({
    mutationFn: (id: string) => removeProject(api, id),
    onSettled: async () => {
      setDeleting(undefined);
      await queryClient.invalidateQueries({ queryKey: keys.projects });
    },
  });
  const uploaded = useMutation({
    mutationFn: (input: { readonly project: ProjectListing; readonly uploaded: boolean }) =>
      markUploaded(api, input.project.id, input.uploaded),
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
  const shown = inChannel.filter(
    (one) => matches(one, filter) && (needle === "" || one.title.toLowerCase().includes(needle)),
  );

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
          <Button asChild variant="primary">
            <Link to="/play">
              <PlusIcon aria-hidden="true" strokeWidth={1.75} />
              New video
            </Link>
          </Button>
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
            <Button asChild variant="primary">
              <Link to="/play">Make your first video</Link>
            </Button>
          }
        >
          Set up a run on Play: pick a template, type a topic and start.
        </EmptyState>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative w-full max-w-[320px]">
              <SearchIcon
                aria-hidden="true"
                strokeWidth={1.75}
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3"
              />
              <input
                type="search"
                aria-label="Search projects"
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
          </div>
          {shown.length === 0 ? (
            <p className="m-0 text-ink-2">
              {inChannel.length === 0
                ? `No projects in ${current.channel?.name ?? "this channel"} yet. Pick All channels in the rail to see the others.`
                : "No project matches. Clear the search or pick All."}
            </p>
          ) : (
            <List label="Projects">
              {shown.map((project) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  sample={samples.has(project.id)}
                  onDelete={() => setDeleting(project)}
                  onUploaded={(next) => uploaded.mutate({ project, uploaded: next })}
                  busy={uploaded.isPending}
                />
              ))}
            </List>
          )}
        </>
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
        consequence="Moves the project to the trash for 30 days. Restore it or delete it for good in Settings → Trash."
        confirmLabel="Delete project"
        cancelLabel="Keep it"
        pending={remove.isPending}
        onConfirm={() => {
          if (deleting !== undefined) remove.mutate(deleting.id);
        }}
        onCancel={() => setDeleting(undefined)}
      />
    </div>
  );
}

function ProjectRow({
  project,
  sample,
  onDelete,
  onUploaded,
  busy,
}: {
  readonly project: ProjectListing;
  readonly sample: boolean;
  readonly onDelete: () => void;
  readonly onUploaded: (uploaded: boolean) => void;
  readonly busy: boolean;
}): ReactElement {
  const state = stateOf(project);
  // The server refuses a delete while the project is running, so the button says why instead.
  const running = project.status === "running";
  return (
    <ListRow
      title={
        <span className="flex flex-wrap items-center gap-2">
          <Link to="/projects/$projectId" params={{ projectId: project.id }}>
            {project.title}
          </Link>
          {sample ? <Badge>Sample</Badge> : null}
        </span>
      }
      meta={
        <span className="flex flex-col gap-1">
          <span>{`${madeOf(project)} · started ${startedAt(project.createdAt)}`}</span>
          {running ? (
            <Meter
              value={project.progress}
              label={`${project.title} progress`}
              valueText={`${String(Math.round(project.progress * 100))}% done`}
              className="max-w-[240px]"
            />
          ) : null}
        </span>
      }
      actions={
        <>
          <Status tone={state.tone}>
            {state.word}
            <span className="sr-only" role="status" aria-live="polite">
              {`${project.title}: ${state.word}`}
            </span>
          </Status>
          {isReadyToUpload(project) ? (
            <Button
              variant="quiet"
              size="small"
              disabled={busy}
              disabledReason="Saving…"
              onClick={() => onUploaded(true)}
            >
              Mark uploaded
            </Button>
          ) : null}
          {isReadyToUpload(project) ? (
            <InfoTip id="project.mark-uploaded" />
          ) : project.uploadedAt !== null ? (
            <>
              <Badge>Uploaded</Badge>
              <Button
                variant="quiet"
                size="small"
                aria-label={`Mark ${project.title} not uploaded`}
                disabled={busy}
                disabledReason="Saving…"
                onClick={() => onUploaded(false)}
              >
                Undo
              </Button>
            </>
          ) : null}
          <IconButton
            label={`Delete ${project.title}`}
            size="small"
            disabled={running}
            disabledReason="Cancel the run first, then delete it."
            onClick={onDelete}
          >
            <Trash2Icon aria-hidden="true" strokeWidth={1.75} />
          </IconButton>
        </>
      }
    />
  );
}

// Skeletons match the final layout's shape.
function SkeletonRows(): ReactElement {
  return (
    <ul aria-label="Loading projects" className="sl-list m-0 list-none p-0">
      {[0, 1, 2, 3, 4, 5].map((index) => (
        <li key={index} className="sl-row" data-slot="skeleton-row">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <span className="h-3 w-2/5 rounded-control bg-sunken" />
            <span className="h-[10px] w-1/4 rounded-control bg-sunken" />
          </div>
          <span className="h-[10px] w-16 rounded-control bg-sunken" />
        </li>
      ))}
    </ul>
  );
}
