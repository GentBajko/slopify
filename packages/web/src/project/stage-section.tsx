import type { StageKind } from "@app/kernel/pipeline.js";
import type { ProjectSummary, Stage } from "@app/slices/admission/model.js";
import type { Output } from "@app/slices/storage/model.js";
import { RefreshCwIcon } from "lucide-react";
import { type ReactElement, type ReactNode, useContext, useState } from "react";
import { Button } from "@/components/kit/button";
import { Callout } from "@/components/kit/callout";
import { ConfirmDialog } from "@/components/kit/dialog";
import { EmptyState } from "@/components/kit/empty-state";
import { SectionHead } from "@/components/kit/section-head";
import { Meter } from "@/components/kit/stats";
import { confirmationFor } from "./confirmations.js";
import { canRerunSection } from "./controls.js";
import { LiveWriting } from "./live-writing.js";
import { type SectionId, stageWords } from "./next-action.js";
import { NextActionBeside, type NextActionState } from "./next-action-view.js";
import { RevisionControlContext } from "./revision-action-context.js";
import { useCurrentRevisionView } from "./revision-media.js";
import { stageFraction, summaryOf } from "./summary.js";
import type { ProjectActions } from "./use-actions.js";

// One section of the project page's main column: its head (title, one meta line, its rare
// actions behind More), the next action when it concerns this section, what a refused press
// here said, and the body. Hidden sections stay mounted so an editor keeps its typing.

// Re-running a whole stage replaces its outputs: named for its result, and confirmed first.
const rerunLabels: Readonly<Record<StageKind, string>> = {
  research: "Research again",
  article: "Write the article again",
  audio: "Record the narration again",
  images: "Make all images again",
  thumbnail: "Make the thumbnails again",
  video: "Render the video again",
  document: "Render the PDF again",
};

export function rerunLabel(stage: StageKind, project: ProjectSummary): string {
  if (stage === "video" && project.config.sources.video === "off") return "Export the audio again";
  return rerunLabels[stage];
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
  // with its own words; its retry is in the command palette until it is the next action.
  const otherFailures = stages.filter(
    (stage) =>
      stage.state === "failed" &&
      stage.retryAt === undefined &&
      !(next.next?.situation === "failed" && next.next.section === id),
  );
  const running = stages.find((stage) => stage.state === "running");
  const progress = running === undefined ? undefined : stageFraction(running);
  const summary =
    meta ??
    (own === undefined
      ? undefined
      : stages
          .filter((stage) => stage.state !== "skipped")
          .map((stage) =>
            stage === own
              ? summaryOf(stage, outputs, project, resumable)
              : `${stageWords[stage.kind]}: ${summaryOf(stage, outputs, project, resumable)}`,
          )
          .join(" · "));
  return (
    <section
      hidden={!active}
      aria-label={title}
      data-tour={own === undefined ? undefined : `project-${own.kind}`}
      className="flex min-w-0 flex-col gap-5"
    >
      {head ? (
        <SectionHead
          title={title}
          {...(kicker === undefined ? {} : { kicker })}
          {...(summary === undefined || summary === "" ? {} : { meta: summary })}
        >
          {extra}
          <SectionMore stages={stages} project={project} actions={actions} />
        </SectionHead>
      ) : null}
      {progress === undefined || running === undefined ? null : (
        <Meter
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
        >
          {stage.failureReason === null ? undefined : (
            <details>
              <summary className="cursor-pointer">Error details</summary>
              <pre className="m-0 mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-small">
                {stage.failureReason}
              </pre>
            </details>
          )}
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
      {children}
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

// Re-running each of the section's stages from scratch, as a button in its head: a person who
// wants a stage made again should see how, not hunt for it behind a menu. Each asks first.
export function SectionMore({
  stages,
  project,
  actions,
}: {
  readonly stages: readonly Stage[];
  readonly project: ProjectSummary;
  readonly actions: ProjectActions;
}): ReactElement | null {
  const revisioned = useContext(RevisionControlContext);
  const view = useCurrentRevisionView();
  const [asking, setAsking] = useState<StageKind | undefined>();
  const rerunnable = stages.filter(
    (stage) =>
      stage.state !== "skipped" &&
      stage.state !== "pending" &&
      (!revisioned || (view !== undefined && canRerunSection(view, stage.kind))),
  );
  if (rerunnable.length === 0) return null;
  const busy =
    actions.pending ||
    project.status === "running" ||
    stages.some((stage) => stage.state === "running");
  const copy = asking === undefined ? undefined : confirmationFor({ kind: "rerun", stage: asking });
  return (
    <>
      {rerunnable.map((stage) => (
        <Button
          key={stage.id}
          size="small"
          disabled={busy}
          disabledReason="Wait until the work on this project is done"
          onClick={() => setAsking(stage.kind)}
        >
          <RefreshCwIcon aria-hidden="true" strokeWidth={1.75} />
          {rerunLabel(stage.kind, project)}
        </Button>
      ))}
      <ConfirmDialog
        open={asking !== undefined}
        title={asking === undefined ? "" : `${rerunLabel(asking, project)}?`}
        consequence={copy?.consequence ?? ""}
        confirmLabel={asking === undefined ? "" : rerunLabel(asking, project)}
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
