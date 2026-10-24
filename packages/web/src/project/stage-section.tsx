import type { StageKind } from "@app/kernel/pipeline.js";
import { type ProjectSummary, type Stage, thumbnailCountOf } from "@app/slices/admission/model.js";
import type { Output } from "@app/slices/storage/model.js";
import { RefreshCwIcon } from "lucide-react";
import { type ReactElement, type ReactNode, useContext, useState } from "react";
import { Button } from "@/components/kit/button";
import { Callout } from "@/components/kit/callout";
import { ConfirmDialog } from "@/components/kit/dialog";
import { EmptyState } from "@/components/kit/empty-state";
import { SectionHead } from "@/components/kit/section-head";
import { Meter } from "@/components/kit/stats";
import { stageWords } from "@/lib/stage-words";
import { confirmationFor } from "./confirmations.js";
import { canRerunSection } from "./controls.js";
import { ErrorDetails } from "./error-details.js";
import { LiveWriting } from "./live-writing.js";
import type { SectionId } from "./next-action.js";
import { NextActionBeside, type NextActionState } from "./next-action-view.js";
import { LeadDownloadContext, sampleReason, useReadOnlySample } from "./read-only.js";
import { RevisionControlContext } from "./revision-action-context.js";
import { useCurrentRevisionView } from "./revision-media.js";
import { rerunPrice, useRunCost } from "./stage-price.js";
import { stageFraction, summaryOf } from "./summary.js";
import type { ProjectActions } from "./use-actions.js";

// One section of the project page's main column: its head (title, the one button that makes
// the section's work again), the next action when it concerns this section, what a refused
// press here said, and the body. The stage's state and summary are the status list's, beside
// it, so the head does not say them again. Hidden sections stay mounted so an editor keeps
// its typing.

// Making a whole stage again replaces its outputs: named for its result, and confirmed first.
const rerunVerbs: Readonly<Record<StageKind, string>> = {
  research: "Research the topic again",
  article: "Write the article again",
  audio: "Make the narration again",
  images: "Make all images again",
  thumbnail: "Make the thumbnail again",
  video: "Make the video again",
  document: "Make the PDF again",
};

// What each costs, said on the button: the two made on this computer are free, the others are
// paid calls to the provider (the dialog says how much, where this project's record knows).
const rerunCosts: Readonly<Record<StageKind, string>> = {
  research: " · AI calls",
  article: " · AI calls",
  audio: " · voice calls",
  images: " · image calls",
  thumbnail: " · 1 image call",
  video: " (free)",
  document: " (free)",
};

export function rerunVerb(stage: StageKind, project: ProjectSummary): string {
  if (stage === "video" && project.config.sources.video === "off")
    return "Make the audio file again";
  const thumbnails = thumbnailCountOf(project.config);
  if (stage === "thumbnail" && thumbnails > 1)
    return `Make the ${String(thumbnails)} thumbnails again`;
  return rerunVerbs[stage];
}

// The button's words: the verb, then what it costs ("Make the video again (free)").
export function rerunLabel(stage: StageKind, project: ProjectSummary): string {
  const thumbnails = thumbnailCountOf(project.config);
  const cost =
    stage === "thumbnail" && thumbnails > 1
      ? ` · ${String(thumbnails)} image calls`
      : rerunCosts[stage];
  return `${rerunVerb(stage, project)}${cost}`;
}

// The stages of a section that can be made again from its head, as the saved version allows.
export function useRerunnable(stages: readonly Stage[]): readonly Stage[] {
  const revisioned = useContext(RevisionControlContext);
  const view = useCurrentRevisionView();
  return stages.filter(
    (stage) =>
      stage.state !== "skipped" &&
      stage.state !== "pending" &&
      (!revisioned || (view !== undefined && canRerunSection(view, stage.kind))),
  );
}

export function StageSection({
  id,
  title,
  kicker,
  stages,
  project,
  outputs,
  actions,
  next,
  active,
  meta,
  head = true,
  extra,
  resumable = false,
  children,
}: {
  readonly id: SectionId;
  readonly title: string;
  readonly kicker?: string;
  // The section's own stage first, then any shown inside it (research on Article, the
  // thumbnail on Images).
  readonly stages: readonly Stage[];
  readonly project: ProjectSummary;
  readonly outputs: readonly Output[];
  readonly actions: ProjectActions;
  readonly next: NextActionState;
  readonly active: boolean;
  readonly meta?: ReactNode;
  // False when the body draws its own heads (Images has three sub-sections).
  readonly head?: boolean;
  // More section-head actions, before the overflow.
  readonly extra?: ReactNode;
  readonly resumable?: boolean;
  readonly children: ReactNode;
}): ReactElement {
  const own = stages[0];
  const refused = stages.some((one) => actions.refusal?.stage === one.kind)
    ? actions.refusal?.message
    : undefined;
  // A failure the next action is not about (it names one step at a time) is still said here,
  // with its own words and its own Try again.
  const otherFailures = stages.filter(
    (stage) =>
      stage.state === "failed" &&
      stage.retryAt === undefined &&
      !(next.next?.situation === "failed" && next.next.section === id),
  );
  const running = stages.find((stage) => stage.state === "running");
  const progress = running === undefined ? undefined : stageFraction(running);
  const sample = useReadOnlySample(project.id);
  const remakes = useRerunnable(stages).length > 0;
  return (
    <section
      hidden={!active}
      aria-label={title}
      data-tour={own === undefined ? undefined : `project-${own.kind}`}
      className="flex min-w-0 flex-col gap-3"
    >
      {head ? (
        <SectionHead
          row
          title={title}
          className="pb-0"
          {...(kicker === undefined ? {} : { kicker })}
          {...(meta === undefined ? {} : { meta })}
        >
          {extra}
          <SectionMore stages={stages} project={project} actions={actions} />
        </SectionHead>
      ) : null}
      {head && sample && remakes ? (
        <p className="m-0 text-small text-ink-2">{sampleReason}</p>
      ) : null}
      {progress === undefined || running === undefined ? null : (
        <Meter
          progress
          value={progress}
          label={`${stageWords[running.kind]} progress`}
          valueText={summaryOf(running, outputs, project, resumable)}
        />
      )}
      <NextActionBeside state={next} section={id} />
      {otherFailures.map((stage) => (
        <Callout
          key={stage.id}
          tone="danger"
          title={`${stageWords[stage.kind]} stopped with an error.`}
          actions={
            <Button
              size="small"
              disabled={actions.pending}
              disabledReason="Working on the last press"
              onClick={() => actions.run({ kind: "retry", stage: stage.kind })}
            >
              Try {stageWords[stage.kind].toLowerCase()} again
            </Button>
          }
        >
          Trying again keeps everything already made.
          {stage.failureReason === null ? null : <ErrorDetails text={stage.failureReason} />}
        </Callout>
      ))}
      {refused === undefined ? null : (
        <Callout
          tone="danger"
          title={refused}
          actions={
            <Button variant="quiet" size="small" onClick={actions.dismissRefusal}>
              Dismiss
            </Button>
          }
        />
      )}
      {/* The narration's writing, live. Research writes in the Article's own Research tab. */}
      {own?.state === "running" &&
      own.kind !== "article" &&
      own.kind !== "images" &&
      own.kind !== "video" &&
      own.kind !== "document" ? (
        <LiveWriting projectId={project.id} stage={own.kind} />
      ) : null}
      {/* The section's main download wears the lime only when the title row has no next action. */}
      <LeadDownloadContext value={next.next?.action === undefined}>{children}</LeadDownloadContext>
    </section>
  );
}

// What an empty section says: switched off, waiting for its inputs, or paused.
export function SectionEmpty({
  stage,
  project,
  name,
}: {
  readonly stage: Stage | undefined;
  readonly project: ProjectSummary;
  readonly name: string;
}): ReactElement {
  if (stage === undefined || stage.state === "skipped")
    return (
      <EmptyState title={`${name} is off for this run.`}>
        Switch it on in the project settings to make it.
      </EmptyState>
    );
  return (
    <EmptyState title={`No ${name.toLowerCase()} yet.`}>
      {project.status === "paused"
        ? "It is made once you continue the run."
        : "It starts when the steps before it are done. Finished work elsewhere can be looked at meanwhile."}
    </EmptyState>
  );
}

// Making each of the section's stages again from scratch, as a button in its head: a person who
// wants a stage made again should see how, not hunt for it behind a menu. Each asks first,
// with its price first. On a sample it stays in place, disabled, and the section says why.
export function SectionMore({
  stages,
  project,
  actions,
}: {
  readonly stages: readonly Stage[];
  readonly project: ProjectSummary;
  readonly actions: ProjectActions;
}): ReactElement | null {
  const [asking, setAsking] = useState<StageKind | undefined>();
  const cost = useRunCost(project.id);
  const sample = useReadOnlySample(project.id);
  const rerunnable = useRerunnable(stages);
  if (rerunnable.length === 0) return null;
  const busy =
    actions.pending ||
    project.status === "running" ||
    stages.some((stage) => stage.state === "running");
  const copy =
    asking === undefined
      ? undefined
      : confirmationFor({ kind: "rerun", stage: asking, price: rerunPrice(cost, asking) });
  return (
    <>
      {rerunnable.map((stage) => (
        <Button
          key={stage.id}
          size="small"
          disabled={busy || sample}
          focusableWhenDisabled
          disabledReason={sample ? sampleReason : "Wait until the work on this project is done"}
          onClick={() => setAsking(stage.kind)}
        >
          <RefreshCwIcon aria-hidden="true" strokeWidth={1.75} />
          {rerunLabel(stage.kind, project)}
        </Button>
      ))}
      <ConfirmDialog
        open={asking !== undefined}
        title={asking === undefined ? "" : `${rerunVerb(asking, project)}?`}
        consequence={copy?.consequence ?? ""}
        confirmLabel={asking === undefined ? "" : rerunVerb(asking, project)}
        cancelLabel="Keep what is there"
        pending={actions.pending}
        onConfirm={() => {
          const stage = asking;
          setAsking(undefined);
          if (stage !== undefined) actions.run({ kind: "rerun", stage });
        }}
        onCancel={() => setAsking(undefined)}
      />
    </>
  );
}
