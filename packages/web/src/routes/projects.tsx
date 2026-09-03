import type { ProjectListing } from "@app/slices/admission/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { EllipsisIcon } from "lucide-react";
import { useState } from "react";
import { removeProject } from "@/api";
import { useApp } from "@/app-context";
import { ConfirmDialog } from "@/components/confirm";
import { Lamp } from "@/components/lamp";
import { RailGroup, RailMeter } from "@/components/rail";
import { StateWord } from "@/components/state-word";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { startedAt } from "@/lib/utils";
import { keys, projectsQuery } from "@/queries";

// One row of the rundown, and the same shape for a skeleton. Below 768 px the prompt and
// the started time stack under the title (uiux/screens/07-projects.md, Narrow).
const row =
  "relative grid grid-cols-[10px_minmax(0,1fr)_auto_32px] items-center gap-x-[14px] gap-y-[4px] border-b border-line px-4 py-[14px] last:border-b-0 md:grid-cols-[10px_minmax(0,1fr)_140px_100px_32px]";
const timeCell =
  "col-start-2 row-start-2 text-small text-ink2 tabular-nums md:col-start-3 md:row-start-1";
const wordCell = "col-start-3 row-start-1 justify-end md:col-start-4";
const menuCell = "relative z-10 col-start-4 row-start-1 size-8 p-0 md:col-start-5";

// Every run ever started, newest first (uiux/screens/07-projects.md). The row is one grid
// so the columns line up down the sheet; the title's link is stretched across it with an
// overlay, which keeps the overflow button a sibling rather than a control nested inside
// a link.
export function ProjectsRoute() {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const projects = useQuery(projectsQuery(api));
  const [deleting, setDeleting] = useState<ProjectListing | undefined>(undefined);

  const remove = useMutation({
    mutationFn: (id: string) => removeProject(api, id),
    onSettled: async () => {
      setDeleting(undefined);
      await queryClient.invalidateQueries({ queryKey: keys.projects });
    },
  });

  return (
    <div className="mx-auto max-w-[1440px]">
      <div className="mb-4 flex items-center">
        <h1 className="text-title font-bold tracking-[-0.01em]">Projects</h1>
        <Button variant="accent" className="ml-auto" asChild>
          <Link to="/play">New run</Link>
        </Button>
      </div>

      {projects.error === null ? null : (
        <RailGroup>
          <p className="px-4 py-[14px] text-body text-red">{projects.error.message}</p>
        </RailGroup>
      )}

      {projects.data === undefined ? (
        projects.error === null ? (
          <SkeletonRows />
        ) : null
      ) : projects.data.projects.length === 0 ? (
        <RailGroup>
          <p className="px-4 py-7 text-body text-ink2">
            No projects yet. Set up a run on{" "}
            <Link to="/play" className="rounded-control text-ink underline underline-offset-[3px]">
              Play
            </Link>
            .
          </p>
        </RailGroup>
      ) : (
        <RailGroup>
          {projects.data.projects.map((project) => (
            <ProjectRow
              key={project.id}
              project={project}
              onDelete={() => {
                setDeleting(project);
              }}
            />
          ))}
        </RailGroup>
      )}

      {remove.error === null ? null : (
        <p role="alert" className="mt-[10px] text-label text-red">
          {remove.error.message}
        </p>
      )}

      <ConfirmDialog
        open={deleting !== undefined}
        title={deleting === undefined ? "" : `Delete "${deleting.title}"?`}
        // `logic/14` step 4: the rows and the folder both go, and nothing brings them back.
        consequence="Deletes the project and every file it produced."
        verb="Delete"
        pending={remove.isPending}
        onConfirm={() => {
          if (deleting !== undefined) {
            remove.mutate(deleting.id);
          }
        }}
        onCancel={() => {
          setDeleting(undefined);
        }}
      />
    </div>
  );
}

function ProjectRow({
  project,
  onDelete,
}: {
  readonly project: ProjectListing;
  readonly onDelete: () => void;
}) {
  return (
    <div className={row}>
      <Lamp state={project.status} className="col-start-1 row-start-1" />
      <span className="col-start-2 row-start-1 flex min-w-0 flex-wrap items-baseline gap-x-3">
        <Link
          to="/projects/$projectId"
          params={{ projectId: project.id }}
          // Stretched over the whole row, so the row is the target without the overflow
          // button ending up inside a link.
          className="rounded-control font-semibold after:absolute after:inset-0 after:content-['']"
        >
          {project.title}
        </Link>
        <span className="truncate text-small text-ink2">{madeOf(project)}</span>
      </span>
      <span className={timeCell}>{startedAt(project.createdAt)}</span>
      <StateWord state={project.status} announce={project.title} className={wordCell} />
      <RowOverflow project={project} onDelete={onDelete} />
      {project.status === "running" ? <RailMeter current={project.progress} total={1} /> : null}
    </div>
  );
}

// "Documentary dossier · 16:9". The prompt name is the run's own copy of it (`logic/15`
// §Q123); a run that generated no article from a template names only its format.
function madeOf(project: ProjectListing): string {
  const prompt = project.config.articlePrompt;
  return [prompt === undefined || prompt === "" ? undefined : prompt, project.format]
    .filter((part) => part !== undefined)
    .join(" · ");
}

function RowOverflow({
  project,
  onDelete,
}: {
  readonly project: ProjectListing;
  readonly onDelete: () => void;
}) {
  // `logic/14` step 4 refuses a delete while the project is running, so the screen does
  // not offer it. The reason is rendered under the disabled item as well as carried on
  // the tooltip, because a hover-only explanation reaches nobody on a keyboard.
  const running = project.status === "running";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" aria-label={`More for ${project.title}`} className={menuCell}>
          <EllipsisIcon aria-hidden="true" className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <span title={running ? "Cancel the run first" : undefined}>
          <DropdownMenuItem disabled={running} onSelect={onDelete}>
            Delete
          </DropdownMenuItem>
        </span>
        {running ? (
          <p className="engraved px-[10px] py-[5px] text-ink3">Cancel the run first</p>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Skeletons match the final layout's shape (uiux/02-system.md, Motion).
function SkeletonRows() {
  return (
    <RailGroup>
      {[0, 1, 2, 3, 4, 5].map((index) => (
        <div key={index} className={row}>
          <span className="col-start-1 row-start-1 size-[10px] rounded-full bg-panel2" />
          <span className="col-start-2 row-start-1 h-3 w-2/5 rounded-control bg-panel2" />
          <span className="col-start-3 row-start-1 h-[10px] w-[90px] rounded-control bg-panel2 md:col-start-3" />
          <span className="col-start-4 row-start-1 h-[10px] w-14 justify-self-end rounded-control bg-panel2 md:col-start-4" />
        </div>
      ))}
    </RailGroup>
  );
}
