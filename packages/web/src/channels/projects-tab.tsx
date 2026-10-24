import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { WatchLink } from "@/calendar/recent";
import { EmptyState } from "@/components/kit/empty-state";
import { ButtonLink } from "@/components/kit/link";
import { List, ListRow } from "@/components/kit/list-row";
import { LoadFailed, LoadingBlock } from "@/components/kit/query-state";
import { Status } from "@/components/kit/status";
import { ProjectThumb } from "@/home/project-thumb";
import { projectStateOf } from "@/lib/state-words";
import { shortDate } from "@/lib/utils";
import { projectsQuery } from "@/queries";
import { ShowMore, useBounded } from "./bounded-list";

// The Projects tab: what this channel made, newest first, each with its picture, what it is,
// when it finished (or started), where it stands in words, and Watch once it is done.
export function ProjectsTab({
  channelId,
  onMake,
}: {
  readonly channelId: string;
  // Create, opened on this channel; absent outside the shell.
  readonly onMake: (() => void) | undefined;
}): ReactElement {
  const { api } = useApp();
  const projects = useQuery(projectsQuery(api));
  const own = (projects.data?.projects ?? [])
    .filter((project) => project.channelId === channelId)
    .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const rows = useBounded(own, channelId);
  if (projects.data === undefined)
    return projects.error === null ? (
      <LoadingBlock label="Loading the channel's projects…" rows={3} />
    ) : (
      <LoadFailed
        what="The projects"
        error={projects.error}
        onRetry={() => void projects.refetch()}
        retrying={projects.isFetching}
      />
    );
  if (own.length === 0)
    return (
      <EmptyState
        title="No projects in this channel yet"
        actions={
          <ButtonLink to="/play" variant="primary" onClick={onMake}>
            Make a video
          </ButtonLink>
        }
      >
        Every video, audiobook or article made in this channel lands here, newest first.
      </EmptyState>
    );
  return (
    <section aria-label="Channel projects">
      <List label="Channel projects">
        {rows.shown.map((project) => {
          const state = projectStateOf(project);
          const finished = project.status === "done" || project.status === "partial";
          return (
            <ListRow
              key={project.id}
              lead={<ProjectThumb projectId={project.id} className="w-[96px] shrink-0" />}
              title={
                <Link
                  to="/projects/$projectId"
                  params={{ projectId: project.id }}
                  title={project.title}
                  className="min-w-0 truncate"
                >
                  {project.title}
                </Link>
              }
              meta={`${project.format} · ${finished ? "finished" : "started"} ${shortDate(finished ? project.updatedAt : project.createdAt)}`}
              actions={
                <>
                  <Status tone={state.tone}>{state.word}</Status>
                  {finished ? <WatchLink project={project} /> : null}
                </>
              }
            />
          );
        })}
      </List>
      <ShowMore hidden={rows.hidden} onMore={rows.more} />
    </section>
  );
}
