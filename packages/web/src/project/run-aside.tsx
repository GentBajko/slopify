import type { ProjectSummary, Stage } from "@app/slices/admission/model.js";
import { etaLabel, stageEta } from "@app/slices/eta/model.js";
import type { RunCost } from "@app/slices/run-cost/panel.js";
import type { Output } from "@app/slices/storage/model.js";
import type { ReactElement } from "react";
import { Button } from "@/components/kit/button";
import { SectionHead } from "@/components/kit/section-head";
import { Meter } from "@/components/kit/stats";
import type { Tone } from "@/components/kit/status";
import { type Step, Steps } from "@/components/kit/steps";
import { heldWord, retryingWord, stageStateWord } from "@/lib/state-words";
import type { HeldGate } from "./next-action.js";
import { stageWords } from "./next-action.js";
import { money, workDuration } from "./run-cost.js";
import { finalOutput, summaryOf } from "./summary.js";

// The right rail under the next action: the run's steps with their times and one detail
// line each, then what the run has cost so far and its share of the plan limits.

const toneOf = (stage: Stage, held: boolean): Tone => {
  if (held) return "waiting";
  switch (stage.state) {
    case "running":
      return "running";
    case "done":
    case "provided":
      return "done";
    case "failed":
      return stage.retryAt === undefined ? "failed" : "waiting";
    default:
      return "off";
  }
};

const stateWord = (stage: Stage, held: boolean): string => {
  if (held) return heldWord;
  if (stage.state === "failed" && stage.retryAt !== undefined) return retryingWord;
  return stageStateWord[stage.state];
};

// "6 min", "41 s", "1 h 52 min": how long a step took, or has taken so far.
export function elapsed(stage: Stage, now: number): string | undefined {
  if (stage.startedAt === null) return undefined;
  const start = Date.parse(stage.startedAt);
  const end = stage.finishedAt === null ? now : Date.parse(stage.finishedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return undefined;
  const seconds = Math.round((end - start) / 1000);
  // A provided step took no time of its own; "0 s" would say nothing.
  if (seconds < 1) return undefined;
  if (seconds < 60) return `${String(seconds)} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${String(minutes)} min`;
  return `${String(Math.floor(minutes / 60))} h ${String(minutes % 60)} min`;
}

// A running step's line ends with its time left, recomputed every second (`slices/eta`):
// "12 of 40 chunks · about 4 min left", or "time left unknown" when nothing gives one.
function withEta(detail: string | undefined, stage: Stage, now: number): string | undefined {
  const eta = stageEta(stage, now);
  if (eta === undefined) return detail;
  return detail === undefined || detail === "" ? etaLabel(eta) : `${detail} · ${etaLabel(eta)}`;
}

export function runSteps({
  stages,
  outputs,
  project,
  resumable,
  held,
  now,
}: {
  readonly stages: readonly Stage[];
  readonly outputs: readonly Output[];
  readonly project: ProjectSummary;
  readonly resumable: boolean;
  readonly held: readonly HeldGate[];
  readonly now: number;
}): readonly Step[] {
  return stages
    .filter((stage) => stage.state !== "skipped")
    .map((stage) => {
      const isHeld = held.some((gate) => gate.stage === stage.kind);
      const time = elapsed(stage, now);
      return {
        id: stage.id,
        name:
          stage.kind === "video" && finalOutput(project.config) === "audio"
            ? "Audio export"
            : stageWords[stage.kind],
        tone: toneOf(stage, isHeld),
        state: stateWord(stage, isHeld),
        ...(time === undefined ? {} : { time }),
        detail: isHeld
          ? "Approve it under Checkpoints to carry on."
          : withEta(summaryOf(stage, outputs, project, resumable), stage, now),
      };
    });
}

// A step changing state is said aloud ("Video: running"), wherever the steps are on screen
// (below 1180px the steps list is left out, so this is not part of it).
export function StageAnnouncements({
  stages,
}: {
  readonly stages: readonly Stage[];
}): ReactElement {
  return (
    <div className="sr-only">
      {stages
        .filter((stage) => stage.state !== "skipped")
        .map((stage) => (
          <span key={stage.id} role="status" aria-live="polite">
            {`${stageWords[stage.kind]}: ${stage.state}`}
          </span>
        ))}
    </div>
  );
}

export function RunSteps({ steps }: { readonly steps: readonly Step[] }): ReactElement {
  return (
    <section aria-labelledby="run-steps-title" className="flex flex-col gap-2">
      <SectionHead id="run-steps-title" title="Run" size="small" className="pb-0" />
      <Steps steps={steps} label="Run steps" dense />
    </section>
  );
}

const percent = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

// "$3.37 spent · ~$9.10 via API", then each plan's share: "Codex: 14% of your weekly limit".
export function CostSoFar({
  cost,
  onOpen,
}: {
  readonly cost: RunCost | undefined;
  // Opens the Cost section, the breakdown by stage.
  readonly onOpen?: () => void;
}): ReactElement | null {
  if (cost === undefined || (cost.calls === 0 && cost.byStage.length === 0)) return null;
  const windows = cost.plans.flatMap((plan) =>
    plan.reported
      ? plan.windows.map((window) => ({
          key: `${plan.account}/${window.kind}`,
          name: plan.name,
          window:
            window.kind === "five_hour"
              ? "5-hour"
              : window.kind === "weekly"
                ? "weekly"
                : "current",
          used: window.usedPercent,
          now: window.nowPercent,
        }))
      : [],
  );
  return (
    <section aria-labelledby="cost-so-far-title" className="flex flex-col gap-3">
      <SectionHead id="cost-so-far-title" title="Cost so far" size="small" className="pb-0">
        {onOpen === undefined ? null : (
          <Button variant="quiet" size="small" onClick={onOpen}>
            By stage
          </Button>
        )}
      </SectionHead>
      <p className="m-0 text-small text-ink-2">
        <strong className="text-ink">{money(cost.cost)}</strong>
        {cost.unpriced > 0 ? " known, spent" : " spent"}
        {cost.apiEquivalent === null ? null : ` · ~${money(cost.apiEquivalent)} via API`}
        {/* The run's working time once it has stopped; while it runs the clock above counts. */}
        {cost.run === null || cost.run.running
          ? null
          : ` · ${workDuration(cost.run.workingMs)} of work`}
      </p>
      {windows.map((row) => {
        const used = row.used < 1 ? "under 1%" : `${percent.format(row.used)}%`;
        const name = `${row.window} ${row.name} limit`;
        return (
          <div key={row.key} className="flex flex-col gap-1">
            <p className="m-0 text-small text-ink-2">{`${row.name}: ${used} of your ${row.window} limit`}</p>
            <Meter
              value={row.used / 100}
              label={`Share of the ${name} this run used`}
              valueText={`${used} of your ${name}; now at ${percent.format(row.now)}%`}
              tone={row.now >= 80 ? "waiting" : "accent"}
            />
          </div>
        );
      })}
    </section>
  );
}
