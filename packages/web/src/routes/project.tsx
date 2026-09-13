import type { StageKind } from "@app/kernel/pipeline.js";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/app-context";
import { BatchQueue } from "@/components/batch-queue";
import { Rail, RailGroup } from "@/components/rail";
import { StageBodyFor } from "@/project/bodies";
import { CheckpointPanel } from "@/project/checkpoint-panel";
import { ProjectHeader } from "@/project/header";
import { ProjectNavigation, ProjectProgress } from "@/project/navigation";
import { RefusalLine } from "@/project/parts";
import { RevisionControlContext } from "@/project/revision-action-context";
import { RevisionContentEditors } from "@/project/revision-content";
import { RevisionForm } from "@/project/revision-form";
import { RevisionMedia } from "@/project/revision-media";
import { RevisionWorkspace } from "@/project/revision-workspace";
import { StageRow } from "@/project/stage-row";
import { finalOutput } from "@/project/summary";
import { useProjectActions } from "@/project/use-actions";
import { useLiveProject } from "@/project/use-live";
import { suggestedStage } from "@/project/workspace";
import { projectQuery, promptsQuery, providersQuery } from "@/queries";
import { useTutorialProjectStep } from "@/tutorial/context";

// Keep stage bodies mounted when navigating: editors and players retain their local state.
// Project identity resets the entire workspace so drafts cannot cross project boundaries.
export function ProjectRoute({ projectId }: { readonly projectId: string }) {
  return <ProjectWorkspace key={projectId} projectId={projectId} />;
}

function ProjectWorkspace({ projectId }: { readonly projectId: string }) {
  const { api } = useApp();
  const project = useQuery(projectQuery(api, projectId));
  const providers = useQuery(providersQuery(api));
  const prompts = useQuery(promptsQuery(api));
  const actions = useProjectActions(projectId);
  const [selection, setSelection] = useState<
    { readonly projectId: string; readonly stage: StageKind } | undefined
  >();
  const tutorialStep = useTutorialProjectStep(projectId);
  const appliedTutorial = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (tutorialStep === undefined) {
      appliedTutorial.current = undefined;
      return;
    }
    if (project.data === undefined || appliedTutorial.current === tutorialStep) return;
    appliedTutorial.current = tutorialStep;
    if (tutorialStep === "download")
      setSelection({
        projectId,
        stage: finalOutput(project.data.project.config) === "article" ? "article" : "video",
      });
  }, [tutorialStep, projectId, project.data]);

  useLiveProject(projectId, project.data?.revisionId ?? null);

  if (project.error !== null) {
    return <p className="text-body text-red">{project.error.message}</p>;
  }
  if (project.data === undefined) {
    return <SkeletonRundown />;
  }

  const { project: summary, stages, outputs } = project.data;
  const selected = selection?.projectId === projectId ? selection.stage : suggestedStage(stages);
  const selectStage = (stage: StageKind) => setSelection({ projectId, stage });
  const primaryOutput =
    outputs.find((output) => output.role === "video" || output.role === "audio_export") ??
    (summary.config.sources.video === "off" && summary.config.sources.audio === "off"
      ? (outputs.find((output) => output.role === "article_md") ??
        outputs.find((output) => output.role === "article_txt"))
      : undefined);
  const inFlight = stages.some((stage) => stage.state === "running");
  const busy =
    summary.status === "running" || summary.status === "paused" || inFlight || actions.pending;

  return (
    <RevisionMedia projectId={projectId} revisionId={project.data.revisionId}>
      <RevisionControlContext value={project.data.revisionId !== null}>
        <div className="mx-auto max-w-[1440px] space-y-5">
          {/* The back link sits above a detail page's title. */}
          <Link to="/" className="mb-[10px] block text-small text-ink2 hover:text-ink">
            &lt; Projects
          </Link>

          <div data-tour="project-controls">
            <ProjectHeader
              project={summary}
              prompts={prompts.data?.prompts}
              actions={actions}
              inFlight={inFlight}
              primaryOutput={primaryOutput}
            />
            {actions.refusal === undefined || actions.refusal.stage !== undefined ? null : (
              // A refused cancel belongs to the project, not to one stage; every other
              // refusal is drawn under the row whose control was pressed.
              <Rail className="py-[10px]">
                <RefusalLine message={actions.refusal.message} onDismiss={actions.dismissRefusal} />
              </Rail>
            )}
            <RevisionWorkspace
              projectId={projectId}
              currentRevisionId={project.data.revisionId}
              renderEditor={(props) => (
                <RevisionForm
                  {...props}
                  renderContent={(contentProps) => (
                    <RevisionContentEditors key={contentProps.view.revision.id} {...contentProps} />
                  )}
                />
              )}
            />
          </div>
          <BatchQueue />
          <ProjectProgress stages={stages} project={summary} />
          <CheckpointPanel
            projectId={projectId}
            revisionId={project.data.revisionId}
            paused={summary.status === "paused"}
            stages={stages}
          />
          <div className="grid items-start gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
            <ProjectNavigation
              stages={stages}
              project={summary}
              outputs={outputs}
              selected={selected}
              onSelect={selectStage}
            />
            <div className="min-w-0">
              {stages.map((stage) => (
                <StageRow
                  key={stage.id}
                  active={stage.kind === selected}
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
            </div>
          </div>
        </div>
      </RevisionControlContext>
    </RevisionMedia>
  );
}

// The final layout's shape, not a spinner.
function SkeletonRundown() {
  return (
    <div className="mx-auto max-w-[1440px] space-y-5" role="status" aria-label="Loading project">
      <div className="h-28 rounded-panel bg-panel" />
      <div className="h-24 rounded-panel border border-line bg-panel" />
      <div className="grid items-start gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
        <RailGroup>
          {[0, 1, 2, 3, 4, 5].map((row) => (
            <Rail key={row}>
              <span className="size-[10px] rounded-full bg-panel2" />
              <span className="h-4 w-24 rounded-control bg-panel2" />
              <span className="ml-auto h-3 w-16 rounded-control bg-panel2" />
            </Rail>
          ))}
        </RailGroup>
        <div className="h-[560px] rounded-panel border border-line bg-panel" />
      </div>
    </div>
  );
}
