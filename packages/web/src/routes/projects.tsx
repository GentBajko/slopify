import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useApp } from "@/app-context";
import { Lamp } from "@/components/lamp";
import { Rail, RailGroup } from "@/components/rail";
import { StateWord } from "@/components/state-word";
import { Button } from "@/components/ui/button";
import { startedAt } from "@/lib/utils";
import { projectsQuery } from "@/queries";

// Every run ever started, newest first (uiux/screens/07-projects.md). The overflow menu
// with Delete, and the per-row meter that averages stage progress, arrive with S22: the
// list endpoint answers with project summaries and carries no stage rows to average.
export function ProjectsRoute() {
  const { api } = useApp();
  const projects = useQuery(projectsQuery(api));

  return (
    <div className="mx-auto max-w-[1440px]">
      <div className="mb-4 flex items-center">
        <h1 className="text-title font-bold tracking-[-0.01em]">Projects</h1>
        <Button variant="accent" className="ml-auto" asChild>
          <Link to="/play">New run</Link>
        </Button>
      </div>

      {projects.isPending ? <SkeletonRows /> : null}

      {projects.error === null ? null : (
        <RailGroup>
          <Rail>
            <p className="text-body text-red">{projects.error.message}</p>
          </Rail>
        </RailGroup>
      )}

      {projects.data === undefined ? null : projects.data.projects.length === 0 ? (
        <RailGroup>
          <Rail>
            <p className="text-body text-ink2">
              No projects yet. Set up a run on{" "}
              <Link to="/play" className="text-run-text underline">
                Play
              </Link>
              .
            </p>
          </Rail>
        </RailGroup>
      ) : (
        <RailGroup>
          {projects.data.projects.map((project) => (
            <Rail key={project.id} className="p-0">
              <Link
                to="/projects/$projectId"
                params={{ projectId: project.id }}
                className="flex w-full items-center gap-[14px] px-4 py-[14px] hover:bg-panel2"
              >
                <Lamp state={project.status} />
                <span className="font-semibold">{project.title}</span>
                <span className="text-small text-ink2">
                  {`${project.format} · ${startedAt(project.createdAt)}`}
                </span>
                <StateWord state={project.status} className="ml-auto" />
              </Link>
            </Rail>
          ))}
        </RailGroup>
      )}
    </div>
  );
}

// Skeletons match the final layout's shape (uiux/02-system.md, Motion).
function SkeletonRows() {
  return (
    <RailGroup>
      {[0, 1, 2].map((row) => (
        <Rail key={row}>
          <span className="size-[10px] rounded-full bg-panel2" />
          <span className="h-4 w-56 rounded-control bg-panel2" />
          <span className="ml-auto h-3 w-16 rounded-control bg-panel2" />
        </Rail>
      ))}
    </RailGroup>
  );
}
