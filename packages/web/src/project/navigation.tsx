import type { StageKind } from "@app/kernel/pipeline.js";
import type { ProjectSummary, Stage } from "@app/slices/admission/model.js";
import type { Output } from "@app/slices/storage/model.js";
import { StageGlyph } from "@/components/glyph";
import { Lamp } from "@/components/lamp";
import { StateWord } from "@/components/state-word";
import { cn } from "@/lib/utils";
import { stageName, summaryOf } from "./summary";
import { overallProgress } from "./workspace";

// The rundown: one cell for the whole run and one per stage, in a single row under the page
// bar. It is the project's navigation, its progress and its status at once, so none of those
// is said a second time further down the page. A running stage pulses here and only here.
export function RundownStrip({
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
  const progress = overallProgress(stages);
  return (
    <div className="mb-4 grid min-w-0 grid-cols-1 overflow-hidden rounded-panel border border-line bg-panel sm:grid-cols-[112px_minmax(0,1fr)]">
      <div className="flex items-center gap-3 border-b border-line px-4 py-3 sm:flex-col sm:items-start sm:justify-center sm:gap-1 sm:border-r sm:border-b-0">
        <span className="engraved text-ink3">Run</span>
        <span className="text-row font-bold tabular-nums">{progress.percent}%</span>
        <div
          role="progressbar"
          aria-label="Overall progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress.percent}
          aria-valuetext={`${progress.percent} percent; ${progress.completed} of ${progress.total} stages finished`}
          title={`${progress.completed} of ${progress.total} stages finished`}
          className="h-1 min-w-16 flex-1 overflow-hidden rounded-control bg-panel2 sm:w-full sm:flex-none"
        >
          <div
            className={cn(
              "h-full origin-left bg-lamp-run transition-transform duration-200 motion-reduce:transition-none",
              project.status === "failed" && "bg-red",
            )}
            style={{ transform: `scaleX(${progress.percent / 100})` }}
          />
        </div>
      </div>
      <nav
        aria-label="Project stages"
        className="relative min-w-0 overflow-x-auto [scrollbar-width:thin]"
      >
        <div className="grid min-w-[640px] grid-cols-6">
          {stages.map((stage) => {
            const active = stage.kind === selected;
            const name = stageName(stage.kind, project.config);
            return (
              <button
                key={stage.id}
                type="button"
                aria-label={`${name}, ${stage.state}`}
                aria-current={active ? "step" : undefined}
                onClick={() => onSelect(stage.kind)}
                className={cn(
                  "flex min-w-0 flex-col items-start gap-1 border-r border-line px-3 py-3 text-left last:border-r-0 hover:bg-panel2 focus-visible:outline-offset-[-3px]",
                  active && "bg-panel2 shadow-[inset_0_-2px_0_var(--color-lamp-run)]",
                  stage.state === "skipped" && "text-ink3",
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Lamp state={stage.state} />
                  <span className="truncate font-semibold">{name}</span>
                </span>
                <StateWord state={stage.state} announce={name} />
                <span className="flex w-full min-w-0 items-center gap-1 text-label text-ink2">
                  <StageGlyph kind={stage.kind} className="size-[13px] shrink-0 text-ink3" />
                  <span className="truncate">{summaryOf(stage, outputs, project)}</span>
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
