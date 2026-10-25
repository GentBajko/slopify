import { progressOf } from "@app/kernel/runner/graph.js";
import type { ProjectSummary, Stage } from "@app/slices/admission/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { type ReactElement, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { readProjectVideos, removeProject, saveProjectVideo } from "@/api";
import { useApp } from "@/app-context";
import { useCurrentChannel } from "@/channels/current";
import { BatchQueueCount } from "@/components/batch-queue";
import { useDocumentTitle } from "@/components/document-title";
import { Button } from "@/components/kit/button";
import { Callout } from "@/components/kit/callout";
import { useCommand } from "@/components/kit/command-palette";
import { ConfirmDialog } from "@/components/kit/dialog";
import { Workspace } from "@/components/kit/layout";
import { useToast } from "@/components/kit/toast";
import { designsTitle, ProjectDesigns, useProjectDesignCount } from "@/designs/project-designs";
import { copyText } from "@/fixes/fix-actions";
import { markUploaded } from "@/home/api";
import { isReadyToUpload } from "@/home/ready";
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
import { confirmationFor } from "@/project/confirmations";
import { OpenProjectTab } from "@/project/fix-it";
import {
  finishedAudiobook,
  type ProjectAction,
  ProjectActions,
  ProjectHeader,
} from "@/project/header";
import { LiveBuild } from "@/project/live-build";
import { MoveToChannel } from "@/project/move-channel";
import {
  type OutdatedOutput,
  outdatedGroups,
  type SectionId,
  sectionForStage,
} from "@/project/next-action";
import {
  NextActionButton,
  NextActionNote,
  NextChapterOffer,
  useNextAction,
} from "@/project/next-action-view";
import { knownVideoLink } from "@/project/on-youtube";
import { ProjectOutputs } from "@/project/project-outputs";
import { fileCount } from "@/project/project-outputs-model";
import { projectReleasesKey } from "@/project/release-times";
import {
  EditRequestContext,
  RegenerateNowContext,
  RevisionControlContext,
} from "@/project/revision-action-context";
import { RevisionMedia } from "@/project/revision-media";
import { RebuildDrawer, useRevisionController } from "@/project/revision-workspace";
import { CostLine, ProjectStatusList, StageAnnouncements } from "@/project/run-aside";
import { RunClock, RunCostPanel } from "@/project/run-cost";
import { SaveProjectTemplate } from "@/project/save-template";
import { type YoutubeCopy, YoutubeCopyContext } from "@/project/section-copy";
import { makesYoutubeVideo } from "@/project/sections";
import { type SettingsTab, SettingsView } from "@/project/settings-view";
import { SectionEmpty, StageSection } from "@/project/stage-section";
import { statusRows } from "@/project/status-rows";
import { finalOutput, stageName } from "@/project/summary";
import { useProjectActions } from "@/project/use-actions";
import { useLiveProject } from "@/project/use-live";
import { suggestedStage } from "@/project/workspace";
import { keys, projectQuery, projectsQuery, runCostQuery } from "@/queries";
import { PrepareUploadDrawer } from "@/studio/prepare-upload";
import { makeNextChapter } from "@/templates/api";
import { useOpenTrash } from "@/trash/open-trash";
import { useTutorialProjectStep } from "@/tutorial/context";
import { ProjectMissing } from "./project-missing.js";
import { restoreProjects } from "./projects-bulk.js";

// Keep stage bodies mounted when navigating: editors and players retain their local state.
// Project identity resets the entire workspace so drafts cannot cross project boundaries.
export function ProjectRoute({
  projectId,
  openDraft,
}: {
  readonly projectId: string;
  // Opens a Create draft and shows Create: where "Make the next chapter" lands. Absent hides it.
  readonly openDraft?: ((draftId: string) => Promise<boolean>) | undefined;
}) {
  return <ProjectWorkspace key={projectId} projectId={projectId} openDraft={openDraft} />;
}

// The section open on a project page is its address (`?section=images`): it survives a reload,
// opens in a new tab, and Back returns to the section before. "outputs" is All files, "live"
// the run's Progress, "checkpoints" and "history" the settings view's Pauses and checks and
// Versions; the old words stay so old links keep working.
const sectionIds: readonly SectionId[] = [
  "outputs",
  "article",
  "narration",
  "images",
  "video",
  "shorts",
  "youtube",
  "document",
  "cost",
  "live",
  "settings",
  "history",
  "checkpoints",
];

export function projectSectionOf(value: unknown): SectionId | undefined {
  return sectionIds.find((id) => id === value);
}

const sectionTitles: Readonly<Record<SectionId, string>> = {
  outputs: "All files",
  article: "Article",
  narration: "Narration",
  images: "Images",
  video: "Video",
  shorts: "Shorts",
  youtube: "YouTube",
  document: "PDF",
  cost: "Cost",
  live: "Progress",
  settings: "Settings",
  history: "Versions",
  checkpoints: "Pauses and checks",
};

// The settings view's tabs, by the address that opens each: Pauses and checks is a section of
// the settings.
const settingsTabOf: Readonly<Partial<Record<SectionId, SettingsTab>>> = {
  settings: "settings",
  checkpoints: "settings",
  history: "versions",
};
const sectionOfSettingsTab: Readonly<Record<SettingsTab, SectionId>> = {
  settings: "settings",
  versions: "history",
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
  const openTrash = useOpenTrash();
  const client = useQueryClient();
  const nextChapter = useNextChapter(projectId, openDraft);
  const project = useQuery(projectQuery(api, projectId));
  const runCost = useQuery({
    ...runCostQuery(api, projectId),
    // The run's clock reads the server's working time again while the project runs.
    refetchInterval: (query) =>
      project.data?.project.status === "running" && query.state.status === "success"
        ? 20_000
        : false,
  });
  // The list's row for this project: its channel and whether it was marked uploaded.
  const listing = useQuery(projectsQuery(api)).data?.projects.find((one) => one.id === projectId);
  const channels = useCurrentChannel().channels;
  const actions = useProjectActions(projectId);
  const navigate = useNavigate();
  const chosen = projectSectionOf(
    useLocation({ select: (location) => (location.search as { section?: unknown }).section }),
  );
  // Opening a section is a step Back returns from; the page keeps its scroll.
  const setChosen = useCallback(
    (section: SectionId) => {
      void navigate({
        to: "/projects/$projectId",
        params: { projectId },
        search: { section },
        resetScroll: false,
      });
    },
    [navigate, projectId],
  );
  const [uploadOpen, setUploadOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [designsOpen, setDesignsOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const designCount = useProjectDesignCount(projectId);
  const [cancelling, setCancelling] = useState(false);
  const youtubeCopy = useRef<YoutubeCopy>({});
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
  }, [tutorialStep, project.data, setChosen]);

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
  // A finished video downloads from the title row; Copy for YouTube Studio is for a video
  // made for YouTube, and any other video keeps its downloads only.
  const videoReady = outputs.some((output) => output.role === "video");
  const uploadReady =
    summary !== undefined && videoReady && makesYoutubeVideo(summary.config, outputs);
  const openSection = (section: SectionId) => setChosen(section);
  const next = useNextAction({
    project: summary ?? placeholderProject,
    stages,
    resumable: project.data?.resumable ?? false,
    holding: project.data?.holding ?? [],
    sample: isSample,
    gates: gateRows,
    outdated,
    waits: runCost.data?.waits ?? [],
    videoReady,
    actions,
    controller,
    openSection,
  });

  // The settings view opens straight into the editor.
  const settingsShown = chosen === "settings" || chosen === "checkpoints";
  const opened = useRef(false);
  const hadDraft = useRef(false);
  useEffect(() => {
    if (!settingsShown) {
      opened.current = false;
      return;
    }
    // Once per visit: a draft already open counts.
    if (controller.edit !== undefined) {
      opened.current = true;
      hadDraft.current = true;
      return;
    }
    // The draft closed: after a save, or a discard with nothing to bring back, the settings
    // open again on the version now current; a discard of real changes waits with its Undo.
    // Once per closing, so an opening the server refuses is not tried again and again.
    if (hadDraft.current) {
      hadDraft.current = false;
      if (controller.notice?.kind !== "discarded") opened.current = false;
    }
    if (opened.current || controller.busy) return;
    opened.current = true;
    controller.openEditor();
  }, [settingsShown, controller]);

  const title = summary?.title ?? "";
  // The long video's YouTube link and the uploaded mark are one fact (`studio/videos.ts`):
  // marking not uploaded forgets the link, so its Undo saves the link again, which marks it
  // uploaded. Every place that reads either is refreshed: the title row, the YouTube section's
  // links and Release, Projects and Calendar → Releases.
  const uploaded = useMutation({
    mutationFn: async (change: {
      readonly mark: boolean;
      readonly link?: string;
    }): Promise<string | undefined> => {
      if (change.link !== undefined) {
        await saveProjectVideo(api, projectId, null, change.link);
        return undefined;
      }
      const link = change.mark
        ? undefined
        : knownVideoLink(await readProjectVideos(api, projectId).catch(() => undefined));
      await markUploaded(api, projectId, change.mark);
      return link;
    },
    onSuccess: (link, change) =>
      notify(
        change.mark
          ? `Marked uploaded: ${title}.`
          : link === undefined
            ? `${title} is back on Ready to upload.`
            : `${title} is back on Ready to upload, and its YouTube link is forgotten.`,
        "success",
        {
          label: "Undo",
          run: () =>
            uploaded.mutate(
              change.mark
                ? { mark: false }
                : link === undefined
                  ? { mark: true }
                  : { mark: true, link },
            ),
        },
      ),
    onError: (error: Error) =>
      notify(
        `${title} wasn't changed: ${error.message} Press it again under the project's status.`,
        "error",
      ),
    onSettled: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: keys.projects }),
        client.invalidateQueries({ queryKey: ["project", projectId, "youtube-videos"] }),
        client.invalidateQueries({ queryKey: projectReleasesKey(projectId) }),
        client.invalidateQueries({ queryKey: keys.studioReleases }),
      ]);
    },
  });
  const remove = useMutation({
    mutationFn: () => removeProject(api, projectId),
    onSuccess: async () => {
      notify(`Moved "${title}" to the trash.`, "success", {
        label: "Undo",
        run: () =>
          void (listing === undefined
            ? undefined
            : restoreProjects(api, client, notify, [listing], openTrash)),
      });
      await client.invalidateQueries({ queryKey: keys.projects });
      await navigate({ to: "/projects" });
    },
    onError: (error: Error) =>
      notify(`"${title}" wasn't deleted: ${error.message} Choose Delete project again.`, "error"),
    onSettled: () => setDeleting(false),
  });

  const inFlight = stages.some((stage) => stage.state === "running");
  const running = summary?.status === "running";
  // The browser tab names the project and, once one is picked, its section.
  useDocumentTitle(
    title === "" ? undefined : chosen === undefined ? title : `${title} · ${sectionTitles[chosen]}`,
  );

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
        notify("Soften and retry asks first: press it at the top of the project.");
      else next.run(intent.intent);
    },
  });
  // "Regenerate image 3 in Cleopatra" run from another screen opens the Images section; the
  // images body then asks to regenerate the image (`project/regenerate-by-number.tsx`).
  useIntent(
    intents.showImages(projectId),
    () => {
      const stage = project.data?.stages.find((one) => one.kind === "images");
      if (stage === undefined || stage.state === "skipped")
        notify(
          `${title} makes no slideshow images, so there is no image to make again. To add them, open Edit settings in this project and choose how its images are made.`,
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
    title: "Copy for YouTube Studio",
    group: "This project",
    context: title,
    keywords: ["youtube", "studio", "upload", "publish", "prepare"],
    run: () => {
      if (uploadReady) setUploadOpen(true);
      else notify("Copy for YouTube Studio opens once the video has been made.", "info");
    },
  });
  useCommand({
    id: "project.settings",
    title: "Edit settings",
    group: "This project",
    context: title,
    keywords: ["edit", "settings", "prompts", "providers", "channel"],
    run: () => setChosen("settings"),
  });
  useCommand({
    id: "project.rebuild-review",
    title: "Choose what to make again",
    group: "This project",
    context: title,
    keywords: ["rebuild", "review", "remake", "again", "outdated", "affected"],
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
  useCommand({
    id: "project.copy-id",
    title: "Copy project ID",
    group: "This project",
    context: title,
    keywords: ["id", "bug", "script", "api"],
    run: () => copyProjectId(projectId, notify),
  });
  const groups = outdatedGroups(outdated);
  useCommand({
    id: "project.remake-1",
    title: groups[0]?.label ?? "Make the outdated files again",
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
    title: "Make everything outdated again",
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

  if (project.error !== null && project.data === undefined) {
    return (
      <ProjectMissing
        projectId={projectId}
        error={project.error}
        retry={() => void project.refetch()}
        retrying={project.isFetching}
      />
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
    videoStage !== undefined &&
    (config.shorts?.enabled === true ||
      outputs.some((output) => output.role === "short_video" || output.role === "shorts"));
  const youtubeShown =
    videoStage !== undefined &&
    (config.youtubeDescription === true ||
      outputs.some((output) => output.role === "youtube_description"));
  const progressShown = summary.status === "running" || summary.status === "paused" || inFlight;
  const outdatedIn = (section: SectionId): number =>
    groups.filter((group) => group.section === section).reduce((sum, one) => sum + one.count, 0);
  const rows = statusRows({
    stages,
    outputs,
    project: summary,
    resumable: project.data.resumable,
    holding: project.data.holding,
    now: Date.now(),
    shorts: shortsShown,
    youtube: youtubeShown,
    outdated: outdatedIn,
    files: fileCount({ config, stages, outputs }),
  });
  const views: readonly SectionId[] = ["cost", "settings", "checkpoints", "history"];
  const reachable = (id: SectionId | undefined): boolean =>
    id !== undefined && (views.includes(id) || rows.some((row) => row.id === id));
  // The page opens where the next action points (the failed step, the held review, the
  // outdated images), else on the stage the run is at: a finished video opens on its Video,
  // with the player, its downloads and Copy description in the first screen.
  const situation = next.next?.situation;
  const suggested: SectionId =
    next.next?.section !== undefined && situation !== "done" && situation !== "running"
      ? next.next.section
      : sectionForStage(suggestedStage(stages));
  const selected: SectionId =
    chosen !== undefined && reachable(chosen)
      ? chosen
      : reachable(suggested)
        ? suggested
        : (rows[0]?.id ?? "outputs");
  const settingsTab = settingsTabOf[selected];
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

  const ready = listing !== undefined && !isSample && isReadyToUpload(listing) && uploadReady;
  // Everything else that can be done to the project, in words in the status column. The sample
  // is read-only: the line under the title row says so, and only its own copy offers the edits.
  const projectActions: readonly ProjectAction[] = [
    ...(ready
      ? [{ id: "uploaded", label: "Mark uploaded", run: () => uploaded.mutate({ mark: true }) }]
      : listing?.uploadedAt !== null && listing?.uploadedAt !== undefined && !isSample
        ? [
            {
              id: "uploaded",
              label: "Mark not uploaded",
              run: () => uploaded.mutate({ mark: false }),
            },
          ]
        : []),
    // Only with outdated outputs: then what is made again is chosen file by file. Not while a
    // settings draft is open or a change is being saved: it reviews the saved version.
    ...(groups.length === 0 || controller.busy
      ? []
      : [
          {
            id: "rebuild",
            label: "Choose what to make again…",
            run: () => controller.review({ kind: "allAffected" }),
          },
        ]),
    // The title is the first setting: Rename opens the settings there, the field in focus.
    ...(isSample || revisionId === null
      ? []
      : [
          {
            id: "rename",
            label: "Rename…",
            run: () => controller.requestEdit({ section: "title", change: (edit) => edit }),
          },
          { id: "template", label: "Save as template…", run: () => setTemplateOpen(true) },
        ]),
    ...(isSample || channels.length < 2
      ? []
      : [{ id: "channel", label: "Move to channel…", run: () => setMoveOpen(true) }]),
    ...(isSample
      ? []
      : [
          {
            id: "designs",
            label:
              designCount === undefined || designCount === 0
                ? `${designsTitle}…`
                : `${designsTitle} (${String(designCount)})…`,
            run: () => setDesignsOpen(true),
          },
        ]),
    // While the run goes it is cancelled first; deleting comes after.
    running
      ? {
          id: "cancel",
          label: "Cancel the run…",
          run: () => setCancelling(true),
          disabledReason: actions.pending ? "Working on the last press" : undefined,
          apart: true,
        }
      : { id: "delete", label: "Delete project…", run: () => setDeleting(true), apart: true },
  ];
  const cancelCopy = confirmationFor({ kind: "cancel" });
  // A refused press that belongs to the whole project (a cancel, a pause) is said under the
  // title row.
  const refusal = actions.refusal?.stage === undefined ? actions.refusal : undefined;
  const feedback =
    refusal !== undefined ? (
      <Callout tone="danger" title={refusal.message}>
        <Button variant="quiet" size="small" className="mt-1" onClick={actions.dismissRefusal}>
          Dismiss
        </Button>
      </Callout>
    ) : actions.notice !== undefined ? (
      <p role="status" className="m-0">
        {actions.notice}
      </p>
    ) : controller.preview === undefined &&
      (controller.error || controller.refusal) &&
      settingsTab === undefined ? (
      <p role="alert" className="m-0 text-danger">
        {controller.error ?? controller.refusal?.message}
      </p>
    ) : undefined;
  const channel =
    channels.length < 2 || listing === undefined
      ? undefined
      : channels.find((one) => one.id === listing.channelId)?.name;
  const chapter = nextChapter !== undefined && finishedAudiobook(summary) ? nextChapter : undefined;
  // Copy for YouTube Studio, beside the video and in the YouTube text's head.
  const studio = uploadReady ? (
    <Button variant="secondary" size="small" onClick={() => setUploadOpen(true)}>
      Copy for YouTube Studio
    </Button>
  ) : null;
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
            <RegenerateNowContext
              value={
                controller.pending || controller.preview !== undefined
                  ? undefined
                  : controller.regenerateNow
              }
            >
              <YoutubeCopyContext value={youtubeCopy}>
                <div className="sl-project">
                  <div data-tour="project-controls">
                    <ProjectHeader
                      project={summary}
                      progress={progressOf(stages)}
                      stages={stages}
                      channel={channel}
                      uploadedAt={isSample ? null : listing?.uploadedAt}
                      primary={<NextActionButton state={next} />}
                      editing={settingsTab !== undefined}
                      unsaved={controller.unsaved}
                      // Pressed again, it closes the settings onto the section the page opens on.
                      onEdit={() => setChosen(settingsTab === undefined ? "settings" : suggested)}
                      clock={
                        <RunClock
                          cost={runCost.data}
                          status={summary.status}
                          measuredAt={runCost.dataUpdatedAt}
                        />
                      }
                    />
                    <NextActionNote state={next} feedback={feedback} />
                  </div>
                  <StageAnnouncements stages={stages} />
                  <Workspace
                    asideLabel="Project status"
                    aside={
                      <>
                        <ProjectStatusList rows={rows} projectId={projectId} selected={selected} />
                        <CostLine
                          cost={runCost.data}
                          running={running}
                          projectId={projectId}
                          breakdownShown={selected === "cost"}
                        />
                        {chapter === undefined ? null : (
                          <NextChapterOffer
                            nextChapter={chapter}
                            primary={next.next?.action === undefined}
                          />
                        )}
                        <BatchQueueCount />
                        <ProjectActions actions={projectActions} />
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
                      title={stageName("video", config)}
                      stages={[videoStage].filter(isStage)}
                      active={selected === "video"}
                      {...sectionProps}
                      {...(studio === null ? {} : { extra: studio })}
                    >
                      {body(videoStage)}
                    </StageSection>
                    {videoStage === undefined || !shortsShown ? null : (
                      <StageSection
                        id="shorts"
                        title="Shorts"
                        stages={[]}
                        active={selected === "shorts"}
                        {...sectionProps}
                      >
                        <ShortsBlock stage={videoStage} project={summary} outputs={outputs} />
                      </StageSection>
                    )}
                    {videoStage === undefined || !youtubeShown ? null : (
                      <StageSection
                        id="youtube"
                        title="YouTube"
                        stages={[]}
                        active={selected === "youtube"}
                        {...sectionProps}
                        {...(studio === null ? {} : { extra: studio })}
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
                    <View id="outputs" title="All files" selected={selected}>
                      <ProjectOutputs
                        projectId={projectId}
                        revisionId={revisionId}
                        config={config}
                        stages={stages}
                        outputs={outputs}
                        controller={controller}
                      />
                    </View>
                    <View id="cost" title="Cost" selected={selected}>
                      <RunCostPanel projectId={projectId} />
                    </View>
                    {progressShown ? (
                      <View id="live" title="Progress" selected={selected}>
                        {selected === "live" ? (
                          <LiveBuild
                            project={summary}
                            revisionId={revisionId}
                            stages={stages}
                            outputs={outputs}
                            resumable={project.data.resumable}
                            holding={project.data.holding}
                          />
                        ) : null}
                      </View>
                    ) : null}
                    <SettingsView
                      shown={settingsTab !== undefined}
                      tab={settingsTab ?? "settings"}
                      opening={selected === "checkpoints" ? "checks" : undefined}
                      onTab={(tab) => setChosen(sectionOfSettingsTab[tab])}
                      controller={controller}
                      projectId={projectId}
                      project={summary}
                      revisionId={revisionId}
                      stages={stages}
                      sample={isSample || sample.isPending}
                      onCopyId={() => copyProjectId(projectId, notify)}
                    />
                  </Workspace>
                </div>
              </YoutubeCopyContext>
              <RebuildDrawer controller={controller} />
              {uploadOpen ? (
                <PrepareUploadDrawer projectId={projectId} onClose={() => setUploadOpen(false)} />
              ) : null}
              <ProjectDesigns
                projectId={projectId}
                open={designsOpen}
                onClose={() => setDesignsOpen(false)}
              />
              <MoveToChannel
                projectId={projectId}
                title={summary.title}
                open={moveOpen}
                onClose={() => setMoveOpen(false)}
              />
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
              <ConfirmDialog
                open={deleting}
                title={`Delete "${summary.title}"?`}
                // Settings → Trash puts it back, or removes the rows and the folder for good.
                consequence="Moves the project to the trash for 30 days. Undo brings it back, or restore it later in Settings → Trash."
                confirmLabel="Delete project"
                cancelLabel="Keep it"
                pending={remove.isPending}
                onConfirm={() => remove.mutate()}
                onCancel={() => setDeleting(false)}
              />
            </RegenerateNowContext>
          </EditRequestContext>
        </OpenProjectTab>
      </RevisionControlContext>
    </RevisionMedia>
  );
}

const isStage = (stage: Stage | undefined): stage is Stage => stage !== undefined;

// For a bug report, or a script that talks to /api/projects/<id>.
function copyProjectId(
  projectId: string,
  notify: (message: string, tone?: "success" | "info") => void,
): void {
  void copyText(projectId).then((copied) =>
    notify(
      copied
        ? `Copied the project ID ${projectId}.`
        : `The browser blocked copying. The project ID is ${projectId}.`,
      copied ? "success" : "info",
    ),
  );
}

// A view of the main column that is not a stage: All files, the cost, the run's progress.
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
    <section hidden={selected !== id} aria-label={title} className="flex min-w-0 flex-col gap-3">
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

// The final layout's shape, not a spinner: title row, main column, status column.
function SkeletonWorkspace() {
  return (
    <div role="status" aria-label="Loading project" className="sl-project">
      <div className="flex flex-col gap-2">
        <span className="h-3 w-20 rounded-control bg-sunken" />
        <span className="h-8 w-80 max-w-full rounded-control bg-sunken" />
      </div>
      <Workspace
        aside={
          <div className="flex flex-col gap-2">
            {["a", "b", "c", "d", "e"].map((row) => (
              <span key={row} className="h-8 rounded-control bg-sunken" />
            ))}
          </div>
        }
      >
        <span className="h-[480px] rounded-control bg-sunken" />
      </Workspace>
    </div>
  );
}

// "Make the next chapter": the server makes the draft, then Create opens on it. A retry of a
// press whose answer was lost reuses the same draft id, so it never makes a second draft.
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
              "The next chapter's draft was made, but Create could not open it because the draft open there is not saved yet. Open Create, let it save, then press Make the next chapter again.",
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
