import type { ProjectSummary, Stage } from "@app/slices/admission/model.js";
import type { ProviderStatus } from "@app/slices/settings/model.js";
import type { Output } from "@app/slices/storage/model.js";
import { Link } from "@tanstack/react-router";
import { type ReactNode, useContext, useState } from "react";
import { ConfirmDialog } from "@/components/confirm";
import { StageGlyph } from "@/components/glyph";
import { InfoTip } from "@/components/kit/info-tip";
import { SplitButton } from "@/components/kit/split-button";
import { StateWord } from "@/components/state-word";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { confirmationFor } from "./confirmations.js";
import { canRerunSection } from "./controls.js";
import { LiveWriting } from "./live-writing.js";
import { RefusalLine } from "./parts.js";
import { unreadyFor } from "./readiness.js";
import { RevisionControlContext } from "./revision-action-context.js";
import { useCurrentRevisionView } from "./revision-media.js";
import { type Section, sectionLead, sectionName, sectionSummary, shownStage } from "./sections.js";
import { attempts, stageName } from "./summary.js";
import type { ProjectActions } from "./use-actions.js";

const titles = {
  research: "Research notes",
  article: "Article workspace",
  audio: "Narration",
  images: "Image library",
  thumbnail: "Thumbnail",
  video: "Preview & export",
  document: "Document",
} as const;

// One section of the project page. It carries its own stage and, for Article and Images, the
// companion stage shown inside it (research, the thumbnail): both stages' failures and refusals
// are said here, each with its own Retry, so moving them off the rundown lost no control.
export function StageRow({
  section,
  project,
  outputs,
  providers,
  actions,
  children,
  active = true,
}: {
  readonly section: Section;
  readonly project: ProjectSummary;
  readonly outputs: readonly Output[];
  readonly providers: readonly ProviderStatus[];
  readonly actions: ProjectActions;
  readonly children: ReactNode;
  readonly active?: boolean;
}) {
  const { stage, companion } = section;
  const both = companion === undefined ? [stage] : [stage, companion];
  const name = sectionName(section, project.config);
  const lead = sectionLead(section);
  const shown = shownStage(section);
  const refused = both.some((one) => actions.refusal?.stage === one.kind)
    ? actions.refusal?.message
    : undefined;
  const hasOutput = outputs.some(
    (output) => both.some((one) => output.stageKind === one.kind) && output.role !== "instructions",
  );
  const openBody =
    hasOutput ||
    both.some(
      (one) => one.state === "running" || one.state === "done" || one.state === "provided",
    ) ||
    (stage.kind === "video" && stage.state !== "skipped") ||
    // A stopped companion opens the body, so its own tab or panel can say what is missing.
    (companion !== undefined && retryable(companion));
  const progress =
    shown.progressTotal === null || shown.progressTotal <= 0
      ? undefined
      : Math.min(
          100,
          Math.max(0, Math.round(((shown.progressCurrent ?? 0) / shown.progressTotal) * 100)),
        );
  return (
    <section
      data-tour={`project-${stage.kind}`}
      hidden={!active}
      aria-label={`${name} workspace`}
      className={active ? "min-w-0 rounded-panel border border-line bg-panel" : "hidden"}
    >
      <div className="relative flex min-h-14 flex-wrap items-center gap-3 border-b border-line px-5 py-3">
        <StageGlyph kind={lead} className="text-ink2" />
        <div className="min-w-0 flex-1">
          <h2 className="text-row font-bold">
            {stage.kind === "video" && name === "Audio export" ? "Listen & export" : titles[lead]}
          </h2>
          <p className="text-small text-ink2">{sectionSummary(section, outputs, project)}</p>
        </div>
        <span className="text-small text-run-text tabular-nums">
          {shown.state === "running"
            ? progress === undefined
              ? "Waiting for provider progress"
              : `${progress}%`
            : null}
        </span>
        <StateWord state={shown.state} />
        {/* The meter's track is always drawn, so a stage starting or stopping never moves the
            body under it. */}
        <div
          {...(shown.state === "running"
            ? {
                role: "progressbar",
                "aria-label": `${stageName(shown.kind, project.config)} progress`,
                "aria-valuemin": 0,
                "aria-valuemax": 100,
                "aria-valuenow": progress,
              }
            : { "aria-hidden": true })}
          className="absolute inset-x-0 bottom-0 h-[2px] overflow-hidden"
        >
          <div
            className="h-full origin-left bg-lamp-run transition-transform duration-200 motion-reduce:transition-none"
            style={{
              transform: `scaleX(${shown.state === "running" ? (progress ?? 0) / 100 : 0})`,
            }}
          />
        </div>
      </div>
      {both.filter(retryable).map((one) => (
        <RecoveryLine
          key={one.id}
          stage={one}
          own={one === stage}
          project={project}
          providers={providers}
          actions={actions}
        />
      ))}
      {refused ? (
        <div className="border-b border-line px-5 py-3">
          <RefusalLine message={refused} onDismiss={actions.dismissRefusal} />
        </div>
      ) : null}
      {stage.state === "running" &&
      stage.kind !== "article" &&
      stage.kind !== "images" &&
      stage.kind !== "video" &&
      stage.kind !== "document" ? (
        <LiveWriting projectId={project.id} stage={stage.kind} />
      ) : null}
      {openBody ? (
        children
      ) : !both.some(retryable) ? (
        <div className="flex min-h-64 flex-col items-center justify-center gap-3 p-8 text-center">
          <StageGlyph kind={lead} className="size-8 text-ink3" />
          <p className="text-body text-ink2">
            {stage.state === "skipped"
              ? `${name} was switched off for this run.`
              : project.status === "paused"
                ? "Resume the project when you are ready to continue."
                : "This stage will start when its inputs are ready."}
          </p>
          <p className="max-w-md text-small text-ink3">
            {stage.state === "skipped"
              ? "The other stages are available from the list."
              : "You can review completed outputs while the project runs."}
          </p>
        </div>
      ) : null}
    </section>
  );
}

const retryable = (stage: Stage): boolean => stage.state === "failed" || stage.state === "canceled";

// A failed or canceled stage's line: what stopped, the provider's own words behind Error
// details, and Retry stage with Re-run section beside it.
function RecoveryLine({
  stage,
  own,
  project,
  providers,
  actions,
}: {
  readonly stage: Stage;
  // False for a companion stage, whose Retry names it: "Retry research" beside the article.
  readonly own: boolean;
  readonly project: ProjectSummary;
  readonly providers: readonly ProviderStatus[];
  readonly actions: ProjectActions;
}) {
  const revisioned = useContext(RevisionControlContext);
  const view = useCurrentRevisionView();
  const [rerunning, setRerunning] = useState(false);
  const name = stageName(stage.kind, project.config);
  const held = project.status === "paused" ? { ...actions, pending: true } : actions;
  const unready = unreadyFor(stage.kind, project.config, providers);
  const retry = own ? "Retry stage" : `Retry ${name.toLowerCase()}`;
  const retryLabel =
    actions.performing?.kind === "retry" && actions.performing.stage === stage.kind
      ? "Retrying…"
      : revisioned
        ? retry
        : (unready?.label ?? retry);
  const rerunnable = revisioned && view !== undefined && canRerunSection(view, stage.kind);
  const rerunCopy = confirmationFor({ kind: "rerun", stage: stage.kind });
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-red/30 bg-red-tint px-5 py-3">
      <p className="min-w-0 text-small text-red">
        {stage.state === "failed"
          ? stage.failureReason
            ? `${name} stopped with an error. Open Error details to see why.`
            : `${name} stopped with an error.`
          : `${name} was canceled.`}
      </p>
      <span className="text-label text-ink2">{attempts(stage)}</span>
      {stage.failureReason ? (
        <Popover>
          <PopoverTrigger className="text-small text-red underline underline-offset-4">
            Error details
          </PopoverTrigger>
          <PopoverContent className="max-h-48 w-[min(560px,calc(100vw-24px))] overflow-auto whitespace-pre-wrap break-words text-label">
            {stage.failureReason}
          </PopoverContent>
        </Popover>
      ) : null}
      {unready ? (
        <p className="text-small text-ink2">
          {unready.label} for {unready.provider}.{" "}
          <Link
            to="/settings"
            search={{ section: "providers" }}
            className="underline underline-offset-4"
          >
            Open Settings
          </Link>
        </p>
      ) : null}
      <span className="ml-auto flex items-center gap-1">
        <InfoTip label={`recovering ${name}`}>
          <p>
            {revisioned
              ? "Resume recovers unfinished work across the project; Retry stage keeps this section's completed outputs. Use Edit project for changed inputs or optional Advanced rebuild review for supplied-content conflicts."
              : project.status === "paused"
                ? "Resume the project to continue with its saved settings."
                : "Retry keeps completed outputs. To change the provider or model, open the Edit tab and choose Edit project."}
          </p>
        </InfoTip>
        <SplitButton
          variant="danger"
          disabled={revisioned ? actions.pending : unready !== undefined || held.pending}
          onClick={() => actions.run({ kind: "retry", stage: stage.kind })}
          menuLabel={`More ways to recover ${name}`}
          items={[
            {
              label: "Re-run section",
              hint: "Replaces this section's outputs; earlier ones stay in History.",
              disabled: !rerunnable || actions.pending,
              onSelect: () => setRerunning(true),
            },
          ]}
        >
          {retryLabel}
        </SplitButton>
      </span>
      <ConfirmDialog
        open={rerunning}
        title={rerunCopy.title}
        consequence={rerunCopy.consequence}
        verb={rerunCopy.verb}
        dismiss={rerunCopy.dismiss}
        pending={actions.pending}
        onConfirm={() => {
          setRerunning(false);
          actions.run({ kind: "rerun", stage: stage.kind });
        }}
        onCancel={() => setRerunning(false)}
      />
    </div>
  );
}
