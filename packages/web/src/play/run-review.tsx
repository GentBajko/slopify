import type { StageKind } from "@app/kernel/pipeline.js";
import type { CostEstimate } from "@app/slices/estimate/index.js";
import type { PlayReview } from "@app/slices/play-drafts/model.js";
import type { ReactElement } from "react";
import { Fold } from "@/components/kit/fold";
import { usd } from "@/lib/format";
import { stageWords } from "@/lib/stage-words";
import { checkpointOptions, pauseLabel } from "./checkpoints";
import type { PlayFormState } from "./state";

type PauseStage = Parameters<typeof pauseLabel>[0];
type PauseSources = Parameters<typeof pauseLabel>[1]["sources"];
const pausable = (stage: StageKind): stage is PauseStage =>
  checkpointOptions.some((option) => option.stage === stage);

// The pauses this run makes, named as the Pauses and checks row names them ("Pause after the
// article (before the narration)"); once checked, each says which later steps it holds too.
export function CheckpointReview({
  selected,
  reviewed,
  sources,
}: {
  readonly selected: PlayFormState["checkpoints"];
  readonly reviewed: PlayReview["checkpointSet"];
  readonly sources: PauseSources;
}): ReactElement {
  const label = (stage: StageKind) => stageWords[stage];
  const pause = (stage: StageKind) =>
    pausable(stage) ? pauseLabel(stage, { sources }) : `Pause before ${label(stage)}`;
  if (!selected?.length)
    return <p className="text-body text-ink-2">No pauses for your approval.</p>;
  return (
    <div className="space-y-3 text-body">
      {reviewed?.length ? (
        reviewed.map((gate) => (
          <div key={`${gate.runIndex}-${gate.checkpointId}`}>
            <p className="font-medium">
              Run {gate.runIndex + 1} · {pause(gate.stage)}
            </p>
            <p className="text-small text-ink-2">
              {gate.dependents.length
                ? `Also holds: ${gate.dependents.map(label).join(", ")}.`
                : "No dependent steps."}
            </p>
          </div>
        ))
      ) : (
        <p>{selected.map(pause).join("; ")}. Check again to see which steps each pause holds.</p>
      )}
      <p className="text-small text-ink-2">
        Approval required on the project page. Starting this run does not approve these pauses.
      </p>
    </div>
  );
}

export function RunReview({
  estimates,
}: {
  readonly estimates: readonly CostEstimate[];
}): ReactElement {
  const rows =
    estimates[0]?.rows.map((r, i) => ({
      ...r,
      low: estimates.some((e) => e.rows[i]?.low === null)
        ? null
        : estimates.reduce((n, e) => n + (e.rows[i]?.low ?? 0), 0),
      high: estimates.some((e) => e.rows[i]?.high === null)
        ? null
        : estimates.reduce((n, e) => n + (e.rows[i]?.high ?? 0), 0),
      apiLow: estimates.some((e) => e.rows[i]?.onPlan === true && e.rows[i]?.apiLow == null)
        ? null
        : estimates.reduce((n, e) => n + (e.rows[i]?.apiLow ?? 0), 0),
      apiHigh: estimates.some((e) => e.rows[i]?.onPlan === true && e.rows[i]?.apiHigh == null)
        ? null
        : estimates.reduce((n, e) => n + (e.rows[i]?.apiHigh ?? 0), 0),
    })) ?? [];
  const onPlan = estimates.some((e) => e.apiLow !== undefined);
  const apiLow = estimates.reduce((n, e) => n + (e.apiLow ?? 0), 0);
  const apiHigh = estimates.reduce((n, e) => n + (e.apiHigh ?? 0), 0);
  if (estimates.length === 0) return <div />;
  const unpriced = unpricedStages(estimates);
  const headline = estimateHeadline(estimates);
  // The total is what decides a run; the stages, what each assumes and where the prices come
  // from fold away under it.
  return (
    <div className="flex flex-col gap-1">
      <p className="m-0 font-semibold">{headline}</p>
      {unpriced.length > 0 ? (
        <p className="m-0 text-small text-ink-2">
          {listed(unpriced)}: price not known, so not counted.
        </p>
      ) : null}
      <Fold
        summary="Cost by stage"
        state={`${rows.length} ${rows.length === 1 ? "stage" : "stages"}`}
      >
        <div className="flex flex-col gap-2 pb-2">
          {onPlan ? (
            <p className="m-0 text-small text-ink-2">
              {apiLow === 0 && apiHigh === 0
                ? "Steps on your subscription cost $0."
                : `Steps on your subscription cost $0 · about ${money(apiLow, apiHigh)} through the API.`}
            </p>
          ) : null}
          <ul aria-label="Cost by stage" className="m-0 list-none divide-y divide-line p-0">
            {rows.map((r) => (
              <li key={r.stage} className="py-1.5">
                <div className="flex justify-between gap-4 text-small">
                  <span>{r.stage}</span>
                  <span className="text-right tabular-nums">
                    {r.onPlan === true
                      ? r.apiLow === null || r.apiHigh === null
                        ? "$0 on your plan"
                        : `$0 on your plan · ~${money(r.apiLow, r.apiHigh)} via API`
                      : r.low === null || r.high === null
                        ? "Not known"
                        : money(r.low, r.high)}
                  </span>
                </div>
                <p className="m-0 text-label text-ink-3">{r.detail}</p>
              </li>
            ))}
          </ul>
          {[...new Set(estimates.flatMap((estimate) => estimate.assumptions))].map((note) => (
            <p key={note} className="m-0 text-small text-ink-2">
              {note}
            </p>
          ))}
          <p className="m-0 text-label text-ink-3">
            Prices checked {estimates[0]?.catalogueDate ?? "on an unknown date"}. With several
            videos, each stage shows them together.
          </p>
        </div>
      </Fold>
    </div>
  );
}
// The stages with no price here, by name, once however many videos: a run with any of them
// never reads as a total, and never as free.
function unpricedStages(estimates: readonly CostEstimate[]): readonly string[] {
  const stages = estimates[0]?.rows.map((row) => row.stage) ?? [];
  return [
    ...new Set(
      stages.filter((_stage, index) => estimates.some((one) => one.rows[index]?.low === null)),
    ),
  ];
}
// "Estimated cost: $0.40 – $1.20", "Estimated cost: at least $0.40" or "not known".
export function estimateHeadline(estimates: readonly CostEstimate[]): string {
  const low = estimates.reduce((n, e) => n + e.low, 0);
  const high = estimates.reduce((n, e) => n + e.high, 0);
  if (unpricedStages(estimates).length === 0) return `Estimated cost: ${money(low, high)}`;
  return high > 0 ? `Estimated cost: at least ${usd(low)}` : "Estimated cost: not known";
}
function money(low: number, high: number): string {
  return low === high ? usd(low) : `${usd(low)} – ${usd(high)}`;
}
// "a, b and c".
function listed(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1] ?? ""}`;
}
