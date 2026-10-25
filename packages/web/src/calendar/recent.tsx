import type { ProjectListing } from "@app/slices/admission/model.js";
import { Link } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { ButtonLink } from "@/components/kit/link";
import { hitArea, hitTarget } from "@/components/kit/list-row";
import { Status } from "@/components/kit/status";
import { finishedLine } from "@/home/finished-words";
import { ProjectThumb } from "@/home/project-thumb";
import { projectStateOf } from "@/lib/state-words";

// The calendar's newest finished work, so the weeks never read as if nothing was ever made: a
// few tiles with the thumbnail, the title, its length, what it is and when it finished, and
// Watch.

export const recentShown = 4;

type Finished = Pick<
  ProjectListing,
  "status" | "finishedAt" | "updatedAt" | "durationSeconds" | "format" | "outputs"
>;

// When a finished project finished: its run's end, or its last change from a server that
// doesn't say. One still to finish goes by its last change.
const finishedTime = (project: Finished): string =>
  project.status === "done" || project.status === "partial"
    ? (project.finishedAt ?? project.updatedAt)
    : project.updatedAt;

// Newest first, a finished one by when it finished.
export const byFinished = (a: Finished, b: Finished): number =>
  finishedTime(b).localeCompare(finishedTime(a));

// "3:05 · 16:9 · video + 2 shorts · finished Sep 27", as Home and Projects say it.
export const finishedMeta = (project: Finished): string =>
  finishedLine({ ...project, finishedAt: finishedTime(project) });

// Finished (with or without a failed step) and in view, newest first.
export function recentlyFinished(
  projects: readonly ProjectListing[],
  includes: (channelId: string) => boolean,
): readonly ProjectListing[] {
  return projects
    .filter(
      (project) =>
        (project.status === "done" || project.status === "partial") && includes(project.channelId),
    )
    .toSorted(byFinished)
    .slice(0, recentShown);
}

// A project that made a video opens on it; anything else (an audiobook, an article) opens on
// its page.
export function WatchLink({
  project,
  size = "small",
}: {
  readonly project: Pick<ProjectListing, "id" | "title" | "config">;
  readonly size?: "small" | "default";
}): ReactElement {
  const video = project.config.sources.video !== "off";
  return (
    <ButtonLink
      to="/projects/$projectId"
      params={{ projectId: project.id }}
      search={video ? { section: "video" } : {}}
      size={size}
      aria-label={`${video ? "Watch" : "Open"} ${project.title}`}
    >
      {video ? "Watch" : "Open"}
    </ButtonLink>
  );
}

export function RecentlyFinished({
  projects,
}: {
  readonly projects: readonly ProjectListing[];
}): ReactElement | null {
  if (projects.length === 0) return null;
  return (
    <section aria-labelledby="calendar-recent" className="flex min-w-0 flex-col gap-2">
      <h2 id="calendar-recent" className="sl-section-head__title m-0 text-title-3">
        Recently finished
      </h2>
      <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-4 p-0">
        {projects.map((project) => (
          <li key={project.id} className={`flex min-w-0 items-start gap-3 ${hitArea}`}>
            <ProjectThumb projectId={project.id} className="w-[112px] shrink-0" />
            <div className="flex min-w-0 flex-col items-start gap-1">
              <Link
                to="/projects/$projectId"
                params={{ projectId: project.id }}
                title={project.title}
                className={`w-full truncate font-semibold ${hitTarget}`}
              >
                {project.title}
              </Link>
              <span className="text-small text-ink-2">{finishedMeta(project)}</span>
              {project.status === "partial" ? (
                <Status tone={projectStateOf(project).tone}>{projectStateOf(project).word}</Status>
              ) : null}
              <WatchLink project={project} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
