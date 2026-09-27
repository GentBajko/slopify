import type { ProjectListing } from "@app/slices/admission/model.js";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { useCommand } from "@/components/kit/command-palette";
import { intents, requestIntent } from "@/lib/intents";
import { projectsQuery } from "@/queries";

// The palette from anywhere: every project by name ("Open Cleopatra", "Regenerate image 3 in
// Cleopatra"), New schedule and Add to calendar. They are searched, not listed: an empty palette
// keeps the screen's own commands on top. A command that finishes on another screen goes
// there and leaves an intent that screen takes (`lib/intents.ts`). The project in front of
// the person has its own commands, so it is left out here.
export function GlobalCommands(): ReactElement {
  const { api } = useApp();
  const projects = useQuery(projectsQuery(api));
  const pathname = useLocation({ select: (location) => location.pathname });
  // The Schedules tab registers its own New schedule.
  const onSchedules = useLocation({
    select: (location) =>
      location.pathname === "/calendar" &&
      (location.search as { readonly tab?: unknown }).tab === "schedules",
  });
  const current = /^\/projects\/([^/]+)/.exec(pathname)?.[1];
  return (
    <>
      {onSchedules ? null : <NewScheduleCommand />}
      {pathname === "/calendar" ? null : <AddToCalendarCommand />}
      {(projects.data?.projects ?? [])
        .filter((project) => project.id !== current)
        .map((project) => (
          <ProjectCommands key={project.id} project={project} />
        ))}
    </>
  );
}

function NewScheduleCommand(): null {
  const navigate = useNavigate();
  useCommand({
    id: "global.schedules.new",
    title: "New schedule",
    group: "Create",
    keywords: ["schedule", "recurring", "calendar", "plan"],
    searchOnly: true,
    run: () => {
      requestIntent(intents.newSchedule);
      void navigate({ to: "/calendar", search: { tab: "schedules" } });
    },
  });
  return null;
}

function AddToCalendarCommand(): null {
  const navigate = useNavigate();
  useCommand({
    id: "global.calendar.add",
    title: "Add to calendar",
    group: "Create",
    keywords: ["schedule", "topics", "batch", "queue", "plan"],
    searchOnly: true,
    run: () => {
      requestIntent(intents.addToCalendar);
      void navigate({ to: "/calendar" });
    },
  });
  return null;
}

function ProjectCommands({ project }: { readonly project: ProjectListing }): ReactElement {
  const navigate = useNavigate();
  const open = () => {
    void navigate({ to: "/projects/$projectId", params: { projectId: project.id } });
  };
  // Siblings register in order, so a project's name alone ranks Open first.
  return (
    <>
      <OpenCommand project={project} open={open} />
      {project.config.sources.images === "off" ? null : (
        <ImageCommand project={project} open={open} />
      )}
    </>
  );
}

function OpenCommand({
  project,
  open,
}: {
  readonly project: ProjectListing;
  readonly open: () => void;
}): null {
  useCommand({
    id: `index.open.${project.id}`,
    title: `Open ${project.title}`,
    group: "Projects",
    keywords: ["project", "go"],
    searchOnly: true,
    run: open,
  });
  return null;
}

function ImageCommand({
  project,
  open,
}: {
  readonly project: ProjectListing;
  readonly open: () => void;
}): null {
  useCommand({
    id: `index.image.${project.id}`,
    title: `Regenerate an image in ${project.title}`,
    numbered: (count) => `Regenerate image ${String(count)} in ${project.title}`,
    group: "Projects",
    keywords: ["image", "picture", "redraw", "remake"],
    searchOnly: true,
    run: (count) => {
      requestIntent(intents.showImages(project.id));
      if (count !== undefined) requestIntent(intents.regenerateImage(project.id), count);
      open();
    },
  });
  return null;
}
