import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { fileUrl } from "@/api";
import { useApp } from "@/app-context";
import { byFinished, finishedMeta, WatchLink } from "@/calendar/recent";
import { EmptyState } from "@/components/kit/empty-state";
import { FileLink } from "@/components/kit/link";
import { List, ListRow } from "@/components/kit/list-row";
import { LoadFailed, LoadingBlock } from "@/components/kit/query-state";
import { Status } from "@/components/kit/status";
import { ProjectThumb } from "@/home/project-thumb";
import { FailedStep, listState } from "@/home/ready";
import { startedAt } from "@/lib/utils";
import { projectsQuery } from "@/queries";
import { madeOf } from "@/routes/projects-row";
import { ShowMore, useBounded } from "./bounded-list";

// The Projects tab: what this channel made, newest first, as the Projects list shows it: its
// picture, its state in the same words ("Ready to upload", "Done with problems"), its length,
// what it is and when it finished (or what it is made of and when it started), and Watch and
// Download video once it is done.
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
    <section aria-label="Channel projects" className="flex flex-col gap-3">
      <p className="m-0 text-small text-ink-2">
        Everything made in this channel, newest first.
      </p>
      <List label="Channel projects" className="sl-projects">
        {rows.shown.map((project) => {
          const state = listState(project);
          const finished = project.status === "done" || project.status === "partial";
          return (
            <ListRow
              key={project.id}
              lead={<ProjectThumb projectId={project.id} className="sl-projects__thumb" />}
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
                <span className="flex min-w-0 items-baseline gap-2">
                  <Status tone={state.tone} className="shrink-0">
                    {state.word}
                  </Status>
                  <span className="min-w-0 whitespace-normal">
                    {finished
                      ? finishedMeta(project)
                      : `${madeOf(project)} · started ${startedAt(project.createdAt)}`}
                    {project.status === "partial" ? (
                      <>
                        {" · "}
                        <FailedStep project={project} />
                      </>
                    ) : null}
                  </span>
                </span>
              }
              actions={
                finished ? (
                  <>
                    <WatchLink project={project} />
                    {project.outputs?.video === true ? (
                      <FileLink
                        href={fileUrl(api, project.id, "video")}
                        download
                        variant="secondary"
                        size="small"
                        aria-label={`Download video: ${project.title}`}
                      >
                        Download video
                      </FileLink>
                    ) : null}
                  </>
                ) : undefined
              }
            />
          );
        })}
      </List>
      <ShowMore hidden={rows.hidden} onMore={rows.more} />
    </section>
  );
}
