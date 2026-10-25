import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { byFinished, finishedMeta, WatchLink } from "@/calendar/recent";
import { EmptyState } from "@/components/kit/empty-state";
import { List, ListRow } from "@/components/kit/list-row";
import { LoadFailed, LoadingBlock } from "@/components/kit/query-state";
import { Status } from "@/components/kit/status";
import { ProjectThumb } from "@/home/project-thumb";
import { projectStateOf } from "@/lib/state-words";
import { shortDate } from "@/lib/utils";
import { projectsQuery } from "@/queries";
import { ShowMore, useBounded } from "./bounded-list";

// The Projects tab: what this channel made, newest first, each with its picture, its length,
// what it is, when it finished (or started), where it stands in words, and Watch once it is
// done.
export function ProjectsTab({ channelId }: { readonly channelId: string }): ReactElement {
  const { api } = useApp();
  const projects = useQuery(projectsQuery(api));
  const own = (projects.data?.projects ?? [])
    .filter((project) => project.channelId === channelId)
    .toSorted(byFinished);
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
  // Make a video sits in the page header, one press away; the empty list says so.
  if (own.length === 0)
    return (
      <EmptyState title="No projects in this channel yet">
        Every video, audiobook or article made in this channel lands here, newest first. Press Make
        a video to start the first one.
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
              meta={
                finished
                  ? finishedMeta(project)
                  : `${project.format} · started ${shortDate(project.createdAt)}`
              }
              actions={
                <>
                  <Status tone={state.tone} className="mr-3 self-center">
                    {state.word}
                  </Status>
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
