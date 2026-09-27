import type { ProjectSummary, Stage } from "@app/slices/admission/model.js";
import { useQuery } from "@tanstack/react-query";
import { type ReactElement, type ReactNode, useEffect, useRef, useState } from "react";
import { useApp } from "@/app-context";
import { BatchQueueCount } from "@/components/batch-queue";
import { Button } from "@/components/kit/button";
import { Callout } from "@/components/kit/callout";
import { useCommand } from "@/components/kit/command-palette";
import { ConfirmDialog } from "@/components/kit/dialog";
import { Workspace } from "@/components/kit/layout";
import { Rail, RailButton } from "@/components/kit/rail";
import { Lamp, type Tone } from "@/components/kit/status";
import { useToast } from "@/components/kit/toast";
import { intents, useIntent } from "@/lib/intents";
import { shortcuts } from "@/lib/shortcuts";
import { isSample as isBundledSample, readSample, sampleKey } from "@/onboarding/api";
import { StageBodyFor } from "@/project/bodies";
import { ShortsBlock } from "@/project/body-shorts";
import { YoutubeBlock } from "@/project/body-youtube";
import {
  type CheckpointGate,
  checkpointRevisionKey,
  checkpointStatus,
} from "@/project/checkpoint-api";
import { CheckpointPanel } from "@/project/checkpoint-panel";
import { confirmationFor } from "@/project/confirmations";
import { OpenProjectTab } from "@/project/fix-it";
import { FreeSpaceOffer } from "@/project/free-space";
import { type MoreAction, ProjectHeader } from "@/project/header";
import { LiveBuild } from "@/project/live-build";
import {
  type OutdatedOutput,
  outdatedGroups,
  type SectionId,
  sectionForStage,
} from "@/project/next-action";
import { NextActionPanel, useNextAction } from "@/project/next-action-view";
import { EditRequestContext, RevisionControlContext } from "@/project/revision-action-context";
import { RevisionContentEditors } from "@/project/revision-content";
import { RevisionForm } from "@/project/revision-form";
import { RevisionMedia } from "@/project/revision-media";
import {
  RebuildDrawer,
  RevisionEditPanel,
  RevisionHistoryPanel,
  useRevisionController,
} from "@/project/revision-workspace";
import { CostSoFar, RunSteps, runSteps, StageAnnouncements } from "@/project/run-aside";
import { RunCostPanel } from "@/project/run-cost";
import { SaveProjectTemplate } from "@/project/save-template";
import { SectionEmpty, StageSection } from "@/project/stage-section";
import { finalOutput } from "@/project/summary";
import { useProjectActions } from "@/project/use-actions";
import { useLiveProject } from "@/project/use-live";
import { suggestedStage } from "@/project/workspace";
import { projectQuery, promptsQuery, runCostQuery } from "@/queries";
import { PrepareUploadDrawer } from "@/studio/prepare-upload";
import { makeNextChapter } from "@/templates/api";
import { useTutorialProjectStep } from "@/tutorial/context";

// Keep stage bodies mounted when navigating: editors and players retain their local state.
// Project identity resets the entire workspace so drafts cannot cross project boundaries.
export function ProjectRoute({
  projectId,
  openDraft,
}: {
  readonly projectId: string;
  // Opens a Play draft and shows Play: where "Make the next chapter" lands. Absent hides it.
  readonly openDraft?: ((draftId: string) => Promise<boolean>) | undefined;
}) {
  return <ProjectWorkspace key={projectId} projectId={projectId} openDraft={openDraft} />;
}

interface RailItem {
  readonly id: SectionId;
  readonly label: string;
  readonly tone?: Tone | undefined;
  readonly meta?: string;
}

const toneOf = (stages: readonly (Stage | undefined)[]): Tone | undefined => {
  const present = stages.filter((stage): stage is Stage => stage !== undefined);
  if (present.length === 0 || present.every((stage) => stage.state === "skipped")) return undefined;
  if (present.some((stage) => stage.state === "failed" && stage.retryAt === undefined))
    return "failed";
  if (present.some((stage) => stage.state === "running")) return "running";
  if (present.some((stage) => stage.state === "failed")) return "waiting";
  if (
    present.every(
      (stage) => stage.state === "done" || stage.state === "provided" || stage.state === "skipped",
    )
  )
    return "done";
  return "off";
};

function ProjectWorkspace({
  projectId,
  openDraft,
}: {
  readonly projectId: string;
  readonly openDraft: ((draftId: string) => Promise<boolean>) | undefined;
}) {
  const { api } = useApp();
  const notify = useToast();
  const nextChapter = useNextChapter(projectId, openDraft);
  const project = useQuery(projectQuery(api, projectId));
  const prompts = useQuery(promptsQuery(api));
  const runCost = useQuery(runCostQuery(api, projectId));
  const actions = useProjectActions(projectId);
  const [chosen, setChosen] = useState<SectionId | undefined>();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const revisionId = project.data?.revisionId ?? null;
  const controller = useRevisionController(projectId, revisionId, {
    onOpenEdit: () => setChosen("settings"),
  });
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
      setChosen(finalOutput(project.data.project.config) === "article" ? "article" : "video");
  }, [tutorialStep, project.data]);

  useLiveProject(projectId, revisionId);
  const sample = useQuery({ queryKey: sampleKey, queryFn: () => readSample(api) });
  // Any of the bundled samples: the Library of Alexandria, the audiobook or the podcast.
  const isSample = isBundledSample(sample.data, projectId);
  const gates = useQuery({
    queryKey: checkpointRevisionKey(projectId, revisionId ?? ""),
    queryFn: () => checkpointStatus(api, projectId),
    enabled: revisionId !== null,
    retry: false,
  });
  const gateRows: readonly CheckpointGate[] =
    gates.data?.ok === true ? gates.data.value.checkpoints : [];
  const outdated: readonly OutdatedOutput[] =
    controller.saved.data?.outputs
      .filter((output) => output.selected && output.state === "outdated")
      .map((output) => ({ workKey: output.workKey, role: output.output.role })) ?? [];
  const summary = project.data?.project;
  const stages = project.data?.stages ?? [];
  const outputs = project.data?.outputs ?? [];
  const uploadReady = outputs.some((output) => output.role === "video");
  const openSection = (section: SectionId) => setChosen(section);
  const next = useNextAction({
    project: summary ?? placeholderProject,
    stages,
    resumable: project.data?.resumable ?? false,
    sample: isSample,
    gates: gateRows,
    outdated,
    waits: runCost.data?.waits ?? [],
    uploadReady,
    actions,
    controller,
    openSection,
    openUpload: () => setUploadOpen(true),
  });

  // The settings view opens straight into the editor.
  const settingsShown = chosen === "settings";
  const opened = useRef(false);
  useEffect(() => {
    if (!settingsShown) {
      opened.current = false;
      return;
    }
    // Once per visit: a draft already open counts, so discarding it does not reopen one.
    if (controller.edit !== undefined) opened.current = true;
    if (opened.current || controller.busy) return;
    opened.current = true;
    controller.openEditor();
  }, [settingsShown, controller]);

  const inFlight = stages.some((stage) => stage.state === "running");
  const running = summary?.status === "running";
  const title = summary?.title ?? "";

  // Every project action is in the palette too (Ctrl+K), named for its result.
  const intent = next.next?.action;
  useCommand({
    id: "project.next",
    title: intent?.label ?? "Show the project's next action",
    group: "This project",
    context: title,
    keywords: ["next", "continue", "resume", "approve", "retry"],
    shortcut: shortcuts.nextAction,
    run: () => {
      if (intent === undefined)
        notify("This project has no next action right now: nothing waits on you.", "info");
      // Softening is charged and asks first, which only its button does.
      else if (intent.intent.kind === "soften")
        notify("Soften and retry asks first: press it in the Next action panel on the right.");
      else next.run(intent.intent);
    },
  });
  // "Regenerate image 3 in Tiamat" run from another screen opens the Images section; the
  // images body then asks to regenerate the image (`project/regenerate-by-number.tsx`).
  useIntent(
    intents.showImages(projectId),
    () => {
      const stage = project.data?.stages.find((one) => one.kind === "images");
      if (stage === undefined || stage.state === "skipped")
        notify(
          `${title} makes no slideshow images, so there is no image to regenerate. To add them, open Settings in this project and choose how its images are made.`,
          "error",
        );
      else setChosen("images");
    },
    project.data !== undefined,
  );
  useCommand({
    id: "project.pause",
    title: summary?.status === "paused" ? "Continue the run" : "Pause the run",
    group: "This project",
    context: title,
    keywords: ["pause", "resume", "continue", "stop"],
    run: () => actions.run({ kind: summary?.status === "paused" ? "resume" : "pause" }),
  });
  useCommand({
    id: "project.prepare-upload",
    title: "Prepare upload",
    group: "This project",
    context: title,
    keywords: ["youtube", "studio", "upload", "publish"],
    run: () => {
      if (uploadReady) setUploadOpen(true);
      else notify("Prepare upload opens once the video has been made.", "info");
    },
  });
  useCommand({
    id: "project.settings",
    title: "Edit project settings",
    group: "This project",
    context: title,
    keywords: ["edit", "settings", "prompts", "providers", "channel"],
    run: () => setChosen("settings"),
  });
  useCommand({
    id: "project.rebuild-review",
    title: "Choose what to remake",
    group: "This project",
    context: title,
    keywords: ["rebuild", "review", "remake", "outdated", "affected"],
    run: () => controller.review({ kind: "allAffected" }),
  });
  useCommand({
    id: "project.template",
    title: "Save as template",
    group: "This project",
    context: title,
    keywords: ["template", "reuse"],
    run: () => setTemplateOpen(true),
  });
  useCommand({
    id: "project.cancel",
    title: "Cancel the run",
    group: "This project",
    context: title,
    keywords: ["cancel", "stop"],
    run: () => setCancelling(true),
  });
  const groups = outdatedGroups(outdated);
  useCommand({
    id: "project.remake-1",
    title: groups[0]?.label ?? "Remake outdated outputs",
    group: "This project",
    context: title,
    keywords: ["remake", "outdated", "rebuild"],
    run: () => {
      const first = groups[0];
      if (first === undefined) notify("Nothing is outdated in this project.", "info");
      else controller.review({ kind: "selected", workKeys: first.workKeys }, { autoStart: true });
    },
  });
  useCommand({
    id: "project.remake-all",
    title: "Remake everything outdated",
    group: "This project",
    context: title,
    keywords: ["remake", "outdated", "rebuild", "all"],
    run: () => {
      const keysToMake = [...new Set(groups.flatMap((group) => group.workKeys))];
      if (keysToMake.length === 0) notify("Nothing is outdated in this project.", "info");
      else controller.review({ kind: "selected", workKeys: keysToMake }, { autoStart: true });
    },
  });
  useCommand({
    id: "project.copy",
    title: "Make my own copy",
    group: "This project",
    context: title,
    keywords: ["sample", "copy", "duplicate"],
    run: () =>
      isSample
        ? next.run({ kind: "copy-sample" })
        : notify("Only the sample project is copied this way.", "info"),
  });

  if (project.error !== null) {
    return (
      <Callout tone="danger" title="The project could not be loaded.">
        {`${project.error.message} Reload the page to try again, or go back to Projects.`}
      </Callout>
    );
  }
  if (project.data === undefined || summary === undefined) {
    return <SkeletonWorkspace />;
  }

  const stageOf = (kind: Stage["kind"]): Stage | undefined =>
    stages.find((stage) => stage.kind === kind);
  const article = stageOf("article");
  const research = stageOf("research");
  const audio = stageOf("audio");
  const images = stageOf("images");
  const thumbnail = stageOf("thumbnail");
  const videoStage = stageOf("video");
  const documentStage = stageOf("document");
  const config = summary.config;
  const on = (stage: Stage | undefined) => stage !== undefined && stage.state !== "skipped";
  const shortsShown =
    config.shorts?.enabled === true ||
    outputs.some((output) => output.role === "short_video" || output.role === "shorts");
  const youtubeShown =
    config.youtubeDescription === true ||
    outputs.some((output) => output.role === "youtube_description");
  const held = gateRows.filter((gate) => gate.state === "held" || gate.state === "pending-review");
  const stageItems: readonly RailItem[] = [
    ...(on(article) || on(research)
      ? [{ id: "article" as const, label: "Article", tone: toneOf([article, research]) }]
      : []),
    ...(on(audio) ? [{ id: "narration" as const, label: "Narration", tone: toneOf([audio]) }] : []),
    ...(on(images) || on(thumbnail) || config.reference !== undefined
      ? [{ id: "images" as const, label: "Images", tone: toneOf([images, thumbnail]) }]
      : []),
    ...(on(videoStage)
      ? [
          {
            id: "video" as const,
            label: finalOutput(config) === "audio" ? "Audio export" : "Video",
            tone: toneOf([videoStage]),
          },
        ]
      : []),
    ...(shortsShown ? [{ id: "shorts" as const, label: "Shorts" }] : []),
    ...(youtubeShown ? [{ id: "youtube" as const, label: "YouTube" }] : []),
    ...(on(documentStage)
      ? [{ id: "document" as const, label: "PDF", tone: toneOf([documentStage]) }]
      : []),
    { id: "cost", label: "Cost" },
    { id: "live", label: "Live" },
  ];
  // A section with outdated outputs says how many beside its name.
  const railItems = stageItems.map((item) => {
    const count = groups
      .filter((group) => group.section === item.id)
      .reduce((sum, group) => sum + group.count, 0);
    return count === 0 ? item : { ...item, meta: `${String(count)} outdated` };
  });
  const settingsItems: readonly RailItem[] = [
    {
      id: "settings",
      label: "Settings",
      ...(controller.unsaved ? { meta: "unsaved" } : {}),
    },
    ...(revisionId === null
      ? []
      : [
          {
            id: "checkpoints" as const,
            label: "Checkpoints",
            ...(held.length === 0 ? {} : { meta: `${String(held.length)} held` }),
          },
        ]),
    { id: "history", label: "History" },
  ];
  const all = [...railItems, ...settingsItems];
  // The page opens where the next action points (the failed step, the held review, the
  // outdated images), or else on the stage the run is at.
  const situation = next.next?.situation;
  const suggested =
    next.next?.section !== undefined && situation !== "done" && situation !== "running"
      ? next.next.section
      : sectionForStage(suggestedStage(stages));
  const selected: SectionId =
    chosen !== undefined && all.some((item) => item.id === chosen)
      ? chosen
      : (all.find((item) => item.id === suggested)?.id ?? railItems[0]?.id ?? "cost");
  const busyFor = (...kinds: readonly (Stage | undefined)[]): boolean =>
    revisionId === null
      ? summary.status === "running" || summary.status === "paused" || inFlight || actions.pending
      : actions.pending || kinds.some((stage) => stage?.state === "running");

  const sectionProps = {
    project: summary,
    outputs,
    actions,
    next,
    resumable: project.data.resumable,
  };
  const body = (stage: Stage | undefined, companion?: Stage) =>
    stage === undefined ? null : (
      <StageBodyFor
        stage={stage}
        {...(companion === undefined || companion.state === "skipped" ? {} : { companion })}
        project={summary}
        outputs={outputs}
        actions={actions}
        busy={busyFor(stage, companion)}
      />
    );
  const hasOutput = (...kinds: readonly (Stage | undefined)[]) =>
    outputs.some((output) =>
      kinds.some((stage) => stage !== undefined && output.stageKind === stage.kind),
    );
  const opens = (...kinds: readonly (Stage | undefined)[]) =>
    hasOutput(...kinds) ||
    kinds.some(
      (stage) =>
        stage !== undefined &&
        ["running", "done", "provided", "failed", "canceled"].includes(stage.state),
    );

  const more: readonly MoreAction[] = [
    {
      id: "rebuild",
      label: "Choose what to remake…",
      run: () => controller.review({ kind: "allAffected" }),
      disabled: controller.busy,
    },
    {
      id: "template",
      label: "Save as template…",
      run: () => setTemplateOpen(true),
      disabled: revisionId === null || isSample,
    },
    {
      id: "cancel",
      label: "Cancel the run…",
      run: () => setCancelling(true),
      disabled: !running || actions.pending,
      apart: true,
    },
  ];
  const cancelCopy = confirmationFor({ kind: "cancel" });
  // A refused press that belongs to the whole project (a cancel, a pause) is said in the rail.
  const refusal = actions.refusal?.stage === undefined ? actions.refusal : undefined;
  const feedback =
    refusal !== undefined ? (
      <Callout tone="danger" title={refusal.message}>
        <Button variant="quiet" size="small" className="mt-1" onClick={actions.dismissRefusal}>
          Dismiss
        </Button>
      </Callout>
    ) : actions.notice !== undefined ? (
      <p role="status" className="m-0 text-small text-ink-2">
        {actions.notice}
      </p>
    ) : controller.preview === undefined &&
      (controller.error || controller.refusal) &&
      selected !== "settings" &&
      selected !== "history" ? (
      <p role="alert" className="m-0 text-small text-danger">
        {controller.error ?? controller.refusal?.message}
      </p>
    ) : undefined;

  const steps = runSteps({
    stages,
    outputs,
    project: summary,
    resumable: project.data.resumable,
    held: held.map((gate) => ({
      checkpointId: gate.checkpointId,
      stage: gate.stage,
      dependents: gate.dependents,
    })),
    now: Date.now(),
  });

  return (
    <RevisionMedia projectId={projectId} revisionId={revisionId}>
      <RevisionControlContext value={revisionId !== null}>
        <OpenProjectTab value={(tab) => setChosen(tab === "edit" ? "settings" : "article")}>
          <EditRequestContext
            value={
              controller.pending || controller.preview !== undefined
                ? undefined
                : controller.requestEdit
            }
          >
            <div data-tour="project-controls">
              <ProjectHeader
                project={summary}
                prompts={prompts.data?.prompts}
                editing={selected === "settings"}
                onEdit={() => setChosen("settings")}
                more={more}
                nextChapter={nextChapter}
              />
            </div>
            <StageAnnouncements stages={stages} />
            <Workspace
              sections={
                <Rail label="Project sections">
                  {railItems.map((item) => (
                    <SectionLink
                      key={item.id}
                      item={item}
                      selected={selected}
                      onSelect={openSection}
                    />
                  ))}
                  <hr className="sl-rule my-2" />
                  {settingsItems.map((item) => (
                    <SectionLink
                      key={item.id}
                      item={item}
                      selected={selected}
                      onSelect={openSection}
                    />
                  ))}
                </Rail>
              }
              aside={
                <>
                  <NextActionPanel state={next} feedback={feedback} />
                  {summary === undefined ? null : (
                    <FreeSpaceOffer
                      projectId={projectId}
                      title={summary.title}
                      status={summary.status}
                      sample={isSample || sample.isPending}
                    />
                  )}
                  <div className="flex flex-col gap-6 max-[1180px]:hidden">
                    <RunSteps steps={steps} />
                    <CostSoFar cost={runCost.data} />
                    <BatchQueueCount />
                  </div>
                </>
              }
            >
              <StageSection
                id="article"
                title="Article"
                stages={[article, research].filter(isStage)}
                active={selected === "article"}
                {...sectionProps}
              >
                {/* The article's body says itself what it waits for, and stays mounted so a
                    new revision's text replaces the old one in place. */}
                {on(article) || on(research) ? (
                  body(article, research)
                ) : (
                  <SectionEmpty stage={article} project={summary} name="Article" />
                )}
              </StageSection>
              <StageSection
                id="narration"
                title="Narration"
                stages={[audio].filter(isStage)}
                active={selected === "narration"}
                {...sectionProps}
              >
                {opens(audio) ? (
                  body(audio)
                ) : (
                  <SectionEmpty stage={audio} project={summary} name="Narration" />
                )}
              </StageSection>
              <StageSection
                id="images"
                title="Images"
                head={false}
                stages={[images, thumbnail].filter(isStage)}
                active={selected === "images"}
                {...sectionProps}
              >
                {body(images, thumbnail)}
              </StageSection>
              <StageSection
                id="video"
                title={finalOutput(config) === "audio" ? "Audio export" : "Video"}
                stages={[videoStage].filter(isStage)}
                active={selected === "video"}
                {...sectionProps}
              >
                {body(videoStage)}
              </StageSection>
              {videoStage === undefined ? null : (
                <StageSection
                  id="shorts"
                  title="Shorts"
                  stages={[]}
                  active={selected === "shorts"}
                  {...sectionProps}
                  meta="Vertical clips picked from the video, each with its title and hashtags"
                >
                  <ShortsBlock stage={videoStage} project={summary} outputs={outputs} />
                </StageSection>
              )}
              {videoStage === undefined ? null : (
                <StageSection
                  id="youtube"
                  title="YouTube"
                  stages={[]}
                  active={selected === "youtube"}
                  {...sectionProps}
                  meta="The description, chapters, hashtags and tags, as they go into YouTube Studio"
                  // Prepare upload is the next action once the video is done; before that (an
                  // outdated output waiting, say) it is here, where the upload is prepared.
                  {...(uploadReady && next.next?.action?.intent.kind !== "prepare-upload"
                    ? {
                        extra: (
                          <Button variant="secondary" onClick={() => setUploadOpen(true)}>
                            Prepare upload
                          </Button>
                        ),
                      }
                    : {})}
                >
                  <YoutubeBlock stage={videoStage} project={summary} outputs={outputs} />
                </StageSection>
              )}
              {documentStage === undefined ? null : (
                <StageSection
                  id="document"
                  title="PDF"
                  stages={[documentStage]}
                  active={selected === "document"}
                  {...sectionProps}
                >
                  {opens(documentStage) ? (
                    body(documentStage)
                  ) : (
                    <SectionEmpty stage={documentStage} project={summary} name="PDF" />
                  )}
                </StageSection>
              )}
              <View id="cost" title="Run cost" selected={selected}>
                <RunCostPanel projectId={projectId} />
              </View>
              <View id="live" title="Live" selected={selected}>
                {selected === "live" ? (
                  <LiveBuild
                    project={summary}
                    revisionId={revisionId}
                    stages={stages}
                    outputs={outputs}
                  />
                ) : null}
              </View>
              <View id="settings" title="Settings" selected={selected}>
                <RevisionEditPanel
                  controller={controller}
                  active={selected === "settings"}
                  renderEditor={(props) => (
                    <RevisionForm
                      {...props}
                      renderContent={(contentProps) => (
                        <RevisionContentEditors
                          key={contentProps.view.revision.id}
                          {...contentProps}
                        />
                      )}
                    />
                  )}
                />
              </View>
              {revisionId === null ? null : (
                <View id="checkpoints" title="Checkpoints" selected={selected}>
                  <CheckpointPanel
                    projectId={projectId}
                    revisionId={revisionId}
                    paused={summary.status === "paused"}
                    stages={stages}
                    approvedInRail={
                      next.next?.action?.intent.kind === "approve"
                        ? next.next.action.intent.gate.checkpointId
                        : undefined
                    }
                  />
                </View>
              )}
              <View id="history" title="History" selected={selected}>
                <RevisionHistoryPanel
                  controller={controller}
                  projectId={projectId}
                  active={selected === "history"}
                />
              </View>
            </Workspace>
            <RebuildDrawer controller={controller} />
            {uploadOpen ? (
              <PrepareUploadDrawer projectId={projectId} onClose={() => setUploadOpen(false)} />
            ) : null}
            <SaveProjectTemplate
              projectId={projectId}
              revisionId={revisionId}
              title={summary.title}
              open={templateOpen}
              onClose={() => setTemplateOpen(false)}
            />
            <ConfirmDialog
              open={cancelling}
              title={cancelCopy.title}
              consequence={cancelCopy.consequence}
              confirmLabel={cancelCopy.verb}
              cancelLabel={cancelCopy.dismiss}
              pending={actions.pending}
              onConfirm={() => {
                setCancelling(false);
                actions.run({ kind: "cancel" });
              }}
              onCancel={() => setCancelling(false)}
            />
          </EditRequestContext>
        </OpenProjectTab>
      </RevisionControlContext>
    </RevisionMedia>
  );
}

const isStage = (stage: Stage | undefined): stage is Stage => stage !== undefined;

function SectionLink({
  item,
  selected,
  onSelect,
}: {
  readonly item: RailItem;
  readonly selected: SectionId;
  readonly onSelect: (id: SectionId) => void;
}): ReactElement {
  return (
    <RailButton
      // On phones the rail is a row of tabs, each as wide as its name.
      className="max-md:w-auto"
      current={item.id === selected}
      onClick={() => onSelect(item.id)}
      {...(item.tone === undefined ? {} : { icon: <Lamp tone={item.tone} /> })}
      {...(item.meta === undefined ? {} : { meta: item.meta })}
    >
      {item.label}
    </RailButton>
  );
}

// A view of the main column that is not a stage: cost, live, settings, checkpoints, history.
function View({
  id,
  title,
  selected,
  children,
}: {
  readonly id: SectionId;
  readonly title: string;
  readonly selected: SectionId;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <section hidden={selected !== id} aria-label={title} className="flex min-w-0 flex-col gap-5">
      <h2 className="sl-section-head__title m-0">{title}</h2>
      {children}
    </section>
  );
}

const placeholderProject = {
  id: "",
  title: "",
  format: "16:9",
  status: "pending",
  createdAt: "",
  config: { sources: {} },
} as unknown as ProjectSummary;

// The final layout's shape, not a spinner: title row, section rail, main column, action rail.
function SkeletonWorkspace() {
  return (
    <div role="status" aria-label="Loading project">
      <div className="mb-6 flex flex-col gap-2">
        <span className="h-3 w-20 rounded-control bg-sunken" />
        <span className="h-8 w-80 max-w-full rounded-control bg-sunken" />
      </div>
      <Workspace
        sections={
          <div className="flex flex-col gap-2">
            {["a", "b", "c", "d", "e"].map((row) => (
              <span key={row} className="h-8 rounded-control bg-sunken" />
            ))}
          </div>
        }
        aside={<span className="h-40 rounded-control bg-sunken" />}
      >
        <span className="h-[480px] rounded-control bg-sunken" />
      </Workspace>
    </div>
  );
}

// "Make the next chapter": the server makes the draft, then Play opens on it. A retry of a press
// whose answer was lost reuses the same draft id, so it never makes a second draft.
function useNextChapter(
  projectId: string,
  openDraft: ((draftId: string) => Promise<boolean>) | undefined,
):
  | { readonly run: () => void; readonly pending: boolean; readonly error: string | undefined }
  | undefined {
  const { api } = useApp();
  const draftId = useRef<string | undefined>(undefined);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  if (openDraft === undefined) return undefined;
  return {
    pending,
    error,
    run: () => {
      if (pending) return;
      draftId.current ??= crypto.randomUUID();
      setPending(true);
      setError(undefined);
      void makeNextChapter(api, projectId, draftId.current)
        .then(async (reply) => {
          if (!reply.ok) {
            setError(reply.message);
            return;
          }
          if (await openDraft(reply.value.draft.id)) draftId.current = undefined;
          else
            setError(
              "The next chapter's draft was made, but Play could not open it because the draft open there is not saved yet. Open Play, let it save, then press Make the next chapter again.",
            );
        })
        .catch((thrown: unknown) =>
          setError(
            `The next chapter could not be made (${thrown instanceof Error ? thrown.message : "the connection dropped"}). Press Make the next chapter again.`,
          ),
        )
        .finally(() => setPending(false));
    },
  };
}
