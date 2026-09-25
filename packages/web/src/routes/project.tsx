import { type StageKind, stageKinds } from "@app/kernel/pipeline.js";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/app-context";
import { BatchQueueCount } from "@/components/batch-queue";
import { StatusSlot } from "@/components/kit/action-bar";
import { Button } from "@/components/ui/button";
import { StageBodyFor } from "@/project/bodies";
import { checkpointRevisionKey, checkpointStatus } from "@/project/checkpoint-api";
import { CheckpointPanel } from "@/project/checkpoint-panel";
import { ProjectHeader } from "@/project/header";
import { RundownStrip } from "@/project/navigation";
import { RevisionControlContext } from "@/project/revision-action-context";
import { RevisionContentEditors } from "@/project/revision-content";
import { RevisionForm } from "@/project/revision-form";
import { RevisionMedia } from "@/project/revision-media";
import { type ProjectTab, RevisionWorkspace } from "@/project/revision-workspace";
import { SaveProjectTemplate } from "@/project/save-template";
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
  const [tab, setTab] = useState<ProjectTab>("output");
  const tutorialStep = useTutorialProjectStep(projectId);
  const appliedTutorial = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (tutorialStep === undefined) {
      appliedTutorial.current = undefined;
      return;
    }
    if (project.data === undefined || appliedTutorial.current === tutorialStep) return;
    appliedTutorial.current = tutorialStep;
    setTab("output");
    if (tutorialStep === "download")
      setSelection({
        projectId,
        stage: finalOutput(project.data.project.config) === "article" ? "article" : "video",
      });
  }, [tutorialStep, projectId, project.data]);

  useLiveProject(projectId, project.data?.revisionId ?? null);
  // The same query the Checkpoints tab reads, so a held gate is counted on the tab itself.
  const revisionId = project.data?.revisionId ?? null;
  const gates = useQuery({
    queryKey: checkpointRevisionKey(projectId, revisionId ?? ""),
    queryFn: () => checkpointStatus(api, projectId),
    enabled: revisionId !== null,
    retry: false,
  });
  const held =
    gates.data?.ok === true
      ? gates.data.value.checkpoints.filter((gate) => gate.state === "held").length
      : 0;

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

  // A refused stage action is said inside that stage's own block, where the press happened;
  // only the project's own controls report here.
  const refusal = actions.refusal?.stage === undefined ? actions.refusal : undefined;

  return (
    <RevisionMedia projectId={projectId} revisionId={project.data.revisionId}>
      <RevisionControlContext value={project.data.revisionId !== null}>
        <div>
          <div data-tour="project-controls">
            <ProjectHeader
              project={summary}
              prompts={prompts.data?.prompts}
              actions={actions}
              inFlight={inFlight}
              resumable={project.data.resumable}
              primaryOutput={primaryOutput}
            >
              <SaveProjectTemplate
                projectId={projectId}
                revisionId={project.data.revisionId}
                title={summary.title}
              />
            </ProjectHeader>
            {/* One reserved line for what the last action said: a refusal from any stage,
                or the server's guidance after an accepted one. It is always here, so a
                message arriving never pushes the rundown down. */}
            <div className="mb-2 flex min-h-8 items-center gap-2">
              {refusal === undefined ? (
                <StatusSlot tone="info">{actions.notice}</StatusSlot>
              ) : (
                <>
                  <StatusSlot tone="error">{refusal.message}</StatusSlot>
                  <Button variant="ghost" onClick={actions.dismissRefusal}>
                    Dismiss
                  </Button>
                </>
              )}
            </div>
            <RundownStrip
              stages={stages}
              project={summary}
              outputs={outputs}
              selected={selected}
              onSelect={(stage) => {
                selectStage(stage);
                setTab("output");
              }}
            />
          </div>
          <RevisionWorkspace
            projectId={projectId}
            currentRevisionId={project.data.revisionId}
            tab={tab}
            onTab={setTab}
            trailing={<BatchQueueCount />}
            {...(held === 0 ? {} : { checkpointBadge: `· ${String(held)} held` })}
            renderEditor={(props) => (
              <RevisionForm
                {...props}
                renderContent={(contentProps) => (
                  <RevisionContentEditors key={contentProps.view.revision.id} {...contentProps} />
                )}
              />
            )}
            output={
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
                      busy={
                        project.data.revisionId === null
                          ? busy
                          : actions.pending || stage.state === "running"
                      }
                    />
                  </StageRow>
                ))}
              </div>
            }
            {...(project.data.revisionId === null
              ? {}
              : {
                  checkpoints: (
                    <CheckpointPanel
                      projectId={projectId}
                      revisionId={project.data.revisionId}
                      paused={summary.status === "paused"}
                      stages={stages}
                    />
                  ),
                })}
          />
        </div>
      </RevisionControlContext>
    </RevisionMedia>
  );
}

// The final layout's shape, not a spinner: page bar, status line, rundown, tab row, sheet.
function SkeletonRundown() {
  return (
    <div role="status" aria-label="Loading project">
      <div className="flex min-h-12 items-center gap-3 pb-3">
        <span className="h-4 w-20 rounded-control bg-panel2" />
        <span className="h-5 w-64 rounded-control bg-panel2" />
        <span className="ml-auto h-8 w-72 rounded-control bg-panel2" />
      </div>
      <div className="mb-2 min-h-8" />
      <div className="mb-4 grid h-[78px] grid-cols-[112px_repeat(7,minmax(0,1fr))] overflow-hidden rounded-panel border border-line bg-panel">
        <span className="border-r border-line" />
        {stageKinds.map((cell) => (
          <span
            key={cell}
            className="flex items-start gap-2 border-r border-line p-3 last:border-r-0"
          >
            <span className="size-[10px] shrink-0 rounded-full bg-panel2" />
            <span className="h-3 w-16 rounded-control bg-panel2" />
          </span>
        ))}
      </div>
      <div className="mb-4 flex h-10 gap-3 border-b border-line">
        {[0, 1, 2, 3].map((tab) => (
          <span key={tab} className="my-3 h-4 w-16 rounded-control bg-panel2" />
        ))}
      </div>
      <div className="h-[560px] rounded-panel border border-line bg-panel" />
    </div>
  );
}
