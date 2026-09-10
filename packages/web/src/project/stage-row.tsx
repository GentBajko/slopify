import type { ProjectSummary, Stage } from "@app/slices/admission/model.js";
import type { ProviderStatus } from "@app/slices/settings/model.js";
import type { Output } from "@app/slices/storage/model.js";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { StageGlyph } from "@/components/glyph";
import { StateWord } from "@/components/state-word";
import { LiveWriting } from "./live-writing.js";
import { RefusalLine } from "./parts.js";
import { unreadyFor } from "./readiness.js";
import { attempts, stageName, summaryOf } from "./summary.js";
import type { ProjectActions } from "./use-actions.js";

const titles = {
  research: "Research notes",
  article: "Article workspace",
  audio: "Narration",
  images: "Image library",
  thumbnail: "Thumbnail preview",
  video: "Preview & export",
} as const;

export function StageRow({
  stage,
  project,
  outputs,
  providers,
  actions,
  children,
  active = true,
}: {
  readonly stage: Stage;
  readonly project: ProjectSummary;
  readonly outputs: readonly Output[];
  readonly providers: readonly ProviderStatus[];
  readonly actions: ProjectActions;
  readonly children: ReactNode;
  readonly active?: boolean;
}) {
  const name = stageName(stage.kind, project.config);
  const held = project.status === "paused" ? { ...actions, pending: true } : actions;
  const unready = unreadyFor(stage.kind, project.config, providers);
  const refused = actions.refusal?.stage === stage.kind ? actions.refusal.message : undefined;
  const retryable = stage.state === "failed" || stage.state === "canceled";
  const hasOutput = outputs.some(
    (output) => output.stageKind === stage.kind && output.role !== "instructions",
  );
  const openBody =
    hasOutput ||
    stage.state === "running" ||
    stage.state === "done" ||
    stage.state === "provided" ||
    (stage.kind === "video" && stage.state !== "skipped");
  const progress =
    stage.progressTotal === null || stage.progressTotal <= 0
      ? undefined
      : Math.min(
          100,
          Math.max(0, Math.round(((stage.progressCurrent ?? 0) / stage.progressTotal) * 100)),
        );
  return (
    <section
      data-tour={`project-${stage.kind}`}
      hidden={!active}
      aria-label={`${name} workspace`}
      className={active ? "min-w-0 rounded-panel border border-line bg-panel" : "hidden"}
    >
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
        <StageGlyph kind={stage.kind} className="text-ink2" />
        <div className="min-w-0 flex-1">
          <h2 className="text-row font-bold">
            {stage.kind === "video" && name === "Audio export"
              ? "Listen & export"
              : titles[stage.kind]}
          </h2>
          <p className="mt-1 text-small text-ink2">{summaryOf(stage, outputs, project)}</p>
        </div>
        <StateWord state={stage.state} />
      </div>
      {stage.state === "running" ? (
        <div className="border-b border-line px-5 py-3">
          <div className="mb-2 flex justify-between text-small text-run-text">
            <span>{name} in progress</span>
            {progress === undefined ? (
              <span>Waiting for provider progress</span>
            ) : (
              <span className="tabular-nums">{progress}%</span>
            )}
          </div>
          <div
            role="progressbar"
            aria-label={`${name} progress`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            className="h-1.5 overflow-hidden rounded-control bg-panel2"
          >
            <div
              className="h-full origin-left bg-accent"
              style={{ transform: `scaleX(${(progress ?? 0) / 100})` }}
            />
          </div>
        </div>
      ) : null}
      {retryable ? (
        <div className="m-5 rounded-control border border-red/30 bg-red-tint p-4">
          <div className="flex flex-wrap items-center gap-3">
            <p className="min-w-0 flex-1 text-small text-red">
              {stage.state === "failed" ? `${name} needs attention.` : `${name} was canceled.`}
            </p>
            <span className="text-label text-ink2">{attempts(stage)}</span>
            <button
              type="button"
              disabled={unready !== undefined || held.pending}
              onClick={() => held.run({ kind: "retry", stage: stage.kind })}
              className="rounded-control border border-red px-3 py-2 text-small text-ink hover:bg-panel2 disabled:opacity-50"
            >
              {unready?.label ?? "Retry stage"}
            </button>
          </div>
          <p className="mt-2 text-small text-ink2">
            {project.status === "paused"
              ? "Resume the project to continue with its saved settings."
              : "Retry keeps completed outputs. To change the provider or model, open Run settings."}
          </p>
          {stage.failureReason ? (
            <details className="mt-3">
              <summary className="cursor-pointer text-small text-red">Error details</summary>
              <span className="mt-2 block max-h-48 overflow-auto whitespace-pre-wrap break-words text-label text-ink2">
                {stage.failureReason}
              </span>
            </details>
          ) : null}
          {unready ? (
            <p className="mt-3 text-small text-ink2">
              {unready.label} for {unready.provider}.{" "}
              <Link to="/settings" className="underline underline-offset-4">
                Open Settings
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}
      {refused ? (
        <div className="px-5 pt-4">
          <RefusalLine message={refused} onDismiss={actions.dismissRefusal} />
        </div>
      ) : null}
      {stage.state === "running" &&
      stage.kind !== "article" &&
      stage.kind !== "images" &&
      stage.kind !== "video" ? (
        <LiveWriting projectId={project.id} stage={stage.kind} />
      ) : null}
      {openBody ? (
        children
      ) : !retryable ? (
        <div className="flex min-h-64 flex-col items-center justify-center gap-3 p-8 text-center">
          <StageGlyph kind={stage.kind} className="size-8 text-ink3" />
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
