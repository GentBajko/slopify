import type { CostEstimate } from "@app/slices/estimate/index.js";
import type { PlayReview } from "@app/slices/play-drafts/model.js";
import type { ReactElement } from "react";
import { Fold } from "@/components/kit/fold";
import { usd } from "@/lib/format";
import { checkpointOptions } from "./checkpoints";
import type { PlayFormState } from "./state";

export function CheckpointReview({
  selected,
  reviewed,
}: {
  readonly selected: PlayFormState["checkpoints"];
  readonly reviewed: PlayReview["checkpointSet"];
}): ReactElement {
  const label = (stage: string) =>
    checkpointOptions.find((option) => option.stage === stage)?.label ?? stage;
  if (!selected?.length)
    return <p className="text-body text-ink-2">No review checkpoints selected.</p>;
  return (
    <div className="space-y-3 text-body">
      {reviewed?.length ? (
        reviewed.map((gate) => (
          <div key={`${gate.runIndex}-${gate.checkpointId}`}>
            <p className="font-medium">
              Run {gate.runIndex + 1} · Before {label(gate.stage)}
            </p>
            <p className="text-small text-ink-2">
              {gate.dependents.length
                ? `Also holds: ${gate.dependents.map(label).join(", ")}.`
                : "No dependent steps."}
            </p>
          </div>
        ))
      ) : (
        <p>
          Selected: {selected.map((stage) => `Before ${label(stage)}`).join(", ")}. Refresh review
          to confirm dependent steps.
        </p>
      )}
      <p className="text-small text-ink-2">
        Approval required on the project page. Starting this run does not approve these checkpoints.
      </p>
    </div>
  );
}

export function RunReview({
  estimates,
}: {
  readonly estimates: readonly CostEstimate[];
}): ReactElement {
  const low = estimates.reduce((n, e) => n + e.low, 0);
  const high = estimates.reduce((n, e) => n + e.high, 0);
  const unknown = estimates.reduce((n, e) => n + e.unknown, 0);
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
  const apiUnknown = estimates.reduce((n, e) => n + (e.apiUnknown ?? 0), 0);
  if (estimates.length === 0) return <div />;
  // The total is what decides a run; the stages, what each assumes and where the prices come
  // from fold away under it.
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 text-title-2 font-semibold">
        {unknown ? "Known subtotal: " : "Estimated total: "}
        {money(low, high)}
      </p>
      {unknown ? (
        <p className="m-0 text-small text-ink-2">
          Plus {unknown} stage charge{unknown === 1 ? "" : "s"} with unavailable pricing.
        </p>
      ) : null}
      <Fold
        summary={
          <>
            Cost by stage · {rows.length} {rows.length === 1 ? "stage" : "stages"}
          </>
        }
      >
        <div className="flex flex-col gap-3 pt-1 pb-3">
          {onPlan ? (
            <p className="m-0 text-small text-ink-2">
              {apiLow === 0 && apiHigh === 0
                ? "CLI steps: $0 on your plan · no API price is listed for their models."
                : `CLI steps: $0 on your plan · ~${money(apiLow, apiHigh)} via API${apiUnknown ? ` (plus ${String(apiUnknown)} with no API price)` : ""}.`}
            </p>
          ) : null}
          <ul aria-label="Cost by stage" className="m-0 list-none divide-y divide-line p-0">
            {rows.map((r) => (
              <li key={r.stage} className="py-2">
                <div className="flex justify-between gap-4 text-small">
                  <span>{r.stage}</span>
                  <span className="text-right tabular-nums">
                    {r.onPlan === true
                      ? r.apiLow === null || r.apiHigh === null
                        ? "$0 on your plan · API price unknown"
                        : `$0 on your plan · ~${money(r.apiLow, r.apiHigh)} via API`
                      : r.low === null || r.high === null
                        ? "Unknown"
                        : money(r.low, r.high)}
                  </span>
                </div>
                <p className="m-0 mt-0.5 text-label text-ink-3">{r.detail}</p>
              </li>
            ))}
          </ul>
          {[...new Set(estimates.flatMap((estimate) => estimate.assumptions))].map((note) => (
            <p key={note} className="m-0 text-small text-ink-2">
              {note}
            </p>
          ))}
          <p className="m-0 text-label text-ink-3">
            Catalogue verified {estimates[0]?.catalogueDate ?? "date unavailable"}. Batch rows show
            combined costs.
          </p>
        </div>
      </Fold>
    </div>
  );
}
function money(low: number, high: number): string {
  return low === high ? usd(low) : `${usd(low)} – ${usd(high)}`;
}
