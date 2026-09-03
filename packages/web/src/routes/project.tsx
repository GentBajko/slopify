import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useApp } from "@/app-context";
import { Rail, RailGroup } from "@/components/rail";
import { StageBodyFor } from "@/project/bodies";
import { ProjectHeader } from "@/project/header";
import { RefusalLine } from "@/project/parts";
import { StageRow } from "@/project/stage-row";
import { useProjectActions } from "@/project/use-actions";
import { useLiveProject } from "@/project/use-live";
import { projectQuery, promptsQuery, providersQuery } from "@/queries";

// 08 Project page. The rundown - one row per stage with its lamp, its state word and the
// body it opens into - plus the actions of `logic/12` and the cancel of `logic/13`. This
// file is only the composition: what a row draws is `project/stage-row.tsx`, what a body
// draws is `project/body-*.tsx`, and what an action does is `project/use-actions.ts`.
export function ProjectRoute({ projectId }: { readonly projectId: string }) {
  const { api } = useApp();
  const project = useQuery(projectQuery(api, projectId));
  const providers = useQuery(providersQuery(api));
  const prompts = useQuery(promptsQuery(api));
  const actions = useProjectActions(projectId);

  useLiveProject(projectId);

  if (project.error !== null) {
    return <p className="text-body text-red">{project.error.message}</p>;
  }
  if (project.data === undefined) {
    return <SkeletonRundown />;
  }

  const { project: summary, stages, outputs } = project.data;
  // `logic/12` preconditions: no action is offered while a stage of the project is
  // running, and the server refuses one that gets through anyway.
  const busy = summary.status === "running" || actions.pending;

  return (
    <div className="mx-auto max-w-[1440px]">
      {/* The back link sits above a detail page's title (uiux/03-experience.md). */}
      <Link to="/" className="mb-[10px] block text-small text-ink2 hover:text-ink">
        &lt; Projects
      </Link>

      <RailGroup>
        <ProjectHeader project={summary} prompts={prompts.data?.prompts} actions={actions} />

        {actions.refusal === undefined || actions.refusal.stage !== undefined ? null : (
          // A refused cancel belongs to the project, not to one stage; every other
          // refusal is drawn under the row whose control was pressed.
          <Rail className="py-[10px]">
            <RefusalLine message={actions.refusal.message} onDismiss={actions.dismissRefusal} />
          </Rail>
        )}

        {stages.map((stage) => (
          <StageRow
            key={stage.id}
            stage={stage}
            project={summary}
            outputs={outputs}
            providers={providers.data?.providers ?? []}
            actions={actions}
          >
            <StageBodyFor
              stage={stage}
              project={summary}
              outputs={outputs}
              actions={actions}
              busy={busy}
            />
          </StageRow>
        ))}
      </RailGroup>
    </div>
  );
}

// The final layout's shape, not a spinner (uiux/03-experience.md, Feedback thresholds).
function SkeletonRundown() {
  return (
    <div className="mx-auto max-w-[1440px]">
      <RailGroup>
        {[0, 1, 2, 3, 4, 5].map((row) => (
          <Rail key={row}>
            <span className="size-[10px] rounded-full bg-panel2" />
            <span className="h-4 w-24 rounded-control bg-panel2" />
            <span className="ml-auto h-3 w-16 rounded-control bg-panel2" />
          </Rail>
        ))}
      </RailGroup>
    </div>
  );
}
