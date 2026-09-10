import type { StageKind } from "@app/kernel/pipeline.js";
import type { ProjectSummary, Stage } from "@app/slices/admission/model.js";
import type { Output } from "@app/slices/storage/model.js";
import { Check, ChevronRight, CirclePause } from "lucide-react";
import { StageGlyph } from "@/components/glyph";
import { Lamp } from "@/components/lamp";
import { StateWord } from "@/components/state-word";
import { cn } from "@/lib/utils";
import { stageName, summaryOf } from "./summary";
import { overallProgress } from "./workspace";

export function ProjectProgress({
  stages,
  project,
}: {
  readonly stages: readonly Stage[];
  readonly project: ProjectSummary;
}) {
  const progress = overallProgress(stages);
  return (
    <div className="rounded-panel border border-line bg-panel px-5 py-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-small font-semibold">Overall progress</span>
          <span className="text-small text-ink2">
            {progress.completed} of {progress.total} stages finished
          </span>
        </div>
        <span className="text-small font-semibold tabular-nums">{progress.percent}%</span>
      </div>
      <div
        role="progressbar"
        aria-label="Overall progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.percent}
        aria-valuetext={`${progress.percent} percent; ${progress.completed} of ${progress.total} stages finished`}
        className="h-2 overflow-hidden rounded-control bg-panel2"
      >
        <div
          className={cn(
            "h-full origin-left bg-accent transition-transform duration-200 motion-reduce:transition-none",
            project.status === "failed" && "bg-red",
          )}
          style={{ transform: `scaleX(${progress.percent / 100})` }}
        />
      </div>
      <p className="mt-2 text-label text-ink3">
        Combines finished stages with progress reported by active stages.
      </p>
    </div>
  );
}

export function ProjectNavigation({
  stages,
  project,
  outputs,
  selected,
  onSelect,
}: {
  readonly stages: readonly Stage[];
  readonly project: ProjectSummary;
  readonly outputs: readonly Output[];
  readonly selected: StageKind;
  readonly onSelect: (kind: StageKind) => void;
}) {
  return (
    <nav
      aria-label="Project stages"
      className="h-fit rounded-panel border border-line bg-panel lg:sticky lg:top-6"
    >
      <div className="border-b border-line px-4 py-3">
        <h2 className="engraved text-ink3">Stages</h2>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-1">
        {stages.map((stage) => {
          const active = stage.kind === selected;
          const name = stageName(stage.kind, project.config);
          const done = stage.state === "done" || stage.state === "provided";
          return (
            <button
              key={stage.id}
              type="button"
              aria-label={`${name}, ${stage.state}`}
              aria-current={active ? "step" : undefined}
              onClick={() => onSelect(stage.kind)}
              className={cn(
                "group relative flex min-w-0 items-start gap-2 border-b border-line px-3 py-4 sm:gap-3 sm:px-4 text-left transition-colors last:border-b-0 hover:bg-panel2",
                active &&
                  "bg-panel2 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-accent",
                stage.state === "skipped" && "text-ink3",
              )}
            >
              <StageGlyph
                kind={stage.kind}
                className={cn("mt-0.5 shrink-0 text-ink2", active && "text-run-text")}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-body font-semibold">{name}</span>
                <span className="mt-1 block truncate text-label text-ink2">
                  {summaryOf(stage, outputs, project)}
                </span>
                <span className="mt-2 flex items-center gap-2">
                  <Lamp state={stage.state} />
                  <StateWord state={stage.state} announce={name} />
                </span>
              </span>
              {done ? (
                <Check
                  aria-hidden="true"
                  className="mt-1 hidden size-3.5 shrink-0 text-ink3 sm:block"
                />
              ) : stage.state === "canceled" ? (
                <CirclePause
                  aria-hidden="true"
                  className="mt-1 hidden size-3.5 shrink-0 sm:block"
                />
              ) : active ? (
                <ChevronRight
                  aria-hidden="true"
                  className="mt-1 hidden size-3.5 shrink-0 text-ink3 sm:block"
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
