import type {
  LimitWait,
  ModelCost,
  PlanUse,
  RunCost,
  StageCost,
  UsageTotals,
} from "@app/slices/run-cost/panel.js";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { useApp } from "@/app-context";
import { SectionHead } from "@/components/kit/section-head";
import { runCostQuery } from "@/queries";
import { stageNames } from "./summary.js";

// The Run cost tab: what the run's provider calls actually cost, per stage and per model,
// what its CLI calls would have cost through the API, the usage behind both, and the share of
// each CLI plan's windows the run took. Everything comes from `GET /projects/:id/run-cost`.
export function RunCostPanel({ projectId }: { readonly projectId: string }): ReactElement {
  const { api } = useApp();
  const cost = useQuery(runCostQuery(api, projectId));
  if (cost.error !== null)
    return (
      <p role="alert" className="text-body text-red">
        {`The run cost could not be loaded: ${cost.error.message} Reload the page to try again.`}
      </p>
    );
  if (cost.data === undefined)
    return (
      <div role="status" aria-label="Loading run cost" className="flex flex-col gap-3">
        <span className="h-5 w-64 rounded-control bg-panel2" />
        <span className="h-40 rounded-panel border border-line bg-panel" />
      </div>
    );
  return <Panel cost={cost.data} />;
}

function Panel({ cost }: { readonly cost: RunCost }): ReactElement {
  if (cost.calls === 0 && cost.byStage.length === 0)
    return (
      <p className="text-body text-ink2">
        Nothing has been spent yet. The cost of each provider call appears here as the run makes it.
      </p>
    );
  const onPlan = cost.byModel.some((row) => row.onPlan);
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-title font-bold">
          {`${cost.unpriced > 0 ? "Known cost" : "Cost"}: ${money(cost.cost)}`}
        </p>
        {cost.unpriced > 0 ? (
          <p className="text-body text-ink2">
            {`Plus ${count(cost.unpriced, "call")} the model catalogue has no price for.`}
          </p>
        ) : null}
        {onPlan ? <p className="text-body text-ink2">{planLine(cost)}</p> : null}
        {cost.plans.map((plan) => (
          <p key={plan.account} className="text-body text-ink2">
            {planUse(plan)}
          </p>
        ))}
      </div>

      <section>
        <SectionHead title="By stage" />
        <Table
          label="Run cost by stage"
          head={["Stage", "Cost", "Via API", "Usage", "Time"]}
          rows={cost.byStage.map((row) => ({
            key: row.stage,
            cells: [
              stageNames[row.stage],
              lineCost(row),
              apiCost(row),
              usage(row) || "—",
              row.wallMs === null ? "—" : duration(row.wallMs),
            ],
          }))}
        />
      </section>

      <section>
        <SectionHead title="By model" />
        <Table
          label="Run cost by model"
          head={["Provider · model", "Cost", "Via API", "Usage", "Calls"]}
          rows={cost.byModel.map((row) => ({
            key: `${row.provider}/${row.model}/${row.kind}`,
            cells: [
              modelName(row),
              lineCost(row),
              apiCost(row),
              usage(row) || "—",
              whole.format(row.calls),
            ],
          }))}
        />
      </section>

      <p className="text-small text-ink2">
        {`In total: ${usage(cost.totals) || "no reported usage"} · ${duration(cost.totals.wallMs)} of stage time.`}
      </p>
      <p className="text-small text-ink3">
        {`Priced from the model catalogue${cost.catalogueDate === null ? "" : ` of ${cost.catalogueDate}`} when each call finished. Retries that failed are not charged here; taxes and included credits are not counted.`}
      </p>
    </div>
  );
}

function Table({
  label,
  head,
  rows,
}: {
  readonly label: string;
  readonly head: readonly string[];
  readonly rows: readonly { readonly key: string; readonly cells: readonly ReactNode[] }[];
}): ReactElement {
  return (
    <div className="overflow-x-auto rounded-panel border border-line bg-panel">
      <table aria-label={label} className="w-full border-collapse">
        <thead>
          <tr className="border-b border-line">
            {head.map((title, index) => (
              <th
                key={title}
                className={`engraved px-4 py-3 text-ink3 ${index === 0 ? "text-left" : "text-right"}`}
              >
                {title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-line last:border-b-0">
              {row.cells.map((cell, index) => (
                <td
                  // biome-ignore lint/suspicious/noArrayIndexKey: the columns are fixed.
                  key={index}
                  className={`px-4 py-3 align-top text-small ${index === 0 ? "font-semibold" : "text-right tabular-nums"}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// What the status line says while a stage waits for a CLI's plan to reset.
export function limitWaitMessage(waits: readonly LimitWait[]): string | undefined {
  const first = waits[0];
  if (first === undefined) return undefined;
  const names = [...new Set(waits.map((wait) => wait.name))].join(" and ");
  const when =
    first.resetsAt === null
      ? `checking again at ${clock(first.retryAt)}`
      : `resets at ${clock(first.resetsAt)}`;
  return `Waiting for ${names} limits (${when}). The run carries on by itself; work that does not need ${names} keeps going.`;
}

// "CLI calls: $0 on your plan · ~$1.20 via API".
export function planLine(cost: Pick<RunCost, "apiEquivalent" | "apiUnpriced">): string {
  const api = cost.apiEquivalent ?? 0;
  if (api === 0 && cost.apiUnpriced > 0)
    return "CLI calls: $0 on your plan · no API price is listed for their models.";
  const unpriced =
    cost.apiUnpriced > 0 ? ` (plus ${count(cost.apiUnpriced, "call")} with no API price)` : "";
  return `CLI calls: $0 on your plan · ~${money(api)} via API${unpriced}.`;
}

// "This run used ~3% of your weekly Codex limit", or a plain word that it is not known.
export function planUse(plan: PlanUse): string {
  if (!plan.reported)
    return `${plan.name} did not report its plan limits for this run, so the share it used is not known.`;
  if (plan.windows.length === 0) return `${plan.name} reported no limit windows for this run.`;
  return plan.windows
    .map((window) => {
      const name =
        window.kind === "five_hour" ? "5-hour" : window.kind === "weekly" ? "weekly" : "current";
      const used =
        // Codex reports whole percents, so a short run can read as no change at all.
        window.usedPercent < 1 ? "under 1%" : `~${percent.format(window.usedPercent)}%`;
      const now = `now at ${percent.format(window.nowPercent)}%${window.resetsAt === null ? "" : `, resets ${day(window.resetsAt)}`}`;
      return `This run used ${used} of your ${name} ${plan.name} limit (${now}).`;
    })
    .join(" ");
}

function lineCost(row: StageCost | ModelCost): string {
  if (row.calls === 0) return "—";
  if ("onPlan" in row && row.onPlan) return "$0 on plan";
  return row.unpriced > 0
    ? row.unpriced === row.calls
      ? "Unknown"
      : `${money(row.cost)} + unknown`
    : money(row.cost);
}

function apiCost(row: StageCost | ModelCost): string {
  if (row.apiEquivalent === null) return "—";
  if (row.apiUnpriced > 0 && row.apiEquivalent === 0) return "No API price";
  return `~${money(row.apiEquivalent)}`;
}

function modelName(row: ModelCost): string {
  const model = row.model === "" ? "default model" : row.model;
  return row.apiModel === null
    ? `${row.provider} · ${model}`
    : `${row.provider} · ${model} (as ${row.apiModel})`;
}

export function usage(totals: UsageTotals): string {
  const parts: string[] = [];
  if (totals.tokensIn + totals.tokensOut > 0)
    parts.push(
      `${compact(totals.tokensIn)} in / ${compact(totals.tokensOut)} out tokens${totals.cachedTokens > 0 ? ` (${compact(totals.cachedTokens)} cached)` : ""}`,
    );
  if (totals.characters > 0) parts.push(`${compact(totals.characters)} characters`);
  if (totals.images > 0) parts.push(count(totals.images, "image"));
  if (totals.seconds > 0) parts.push(`${whole.format(totals.seconds)} s of video`);
  return parts.join(" · ");
}

const whole = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const shortNumber = new Intl.NumberFormat(undefined, {
  notation: "compact",
  maximumFractionDigits: 1,
});

function compact(value: number): string {
  return value < 10_000 ? whole.format(value) : shortNumber.format(value);
}

function count(value: number, noun: string): string {
  return `${whole.format(value)} ${noun}${value === 1 ? "" : "s"}`;
}

export function money(value: number): string {
  if (value === 0) return "$0";
  if (value < 0.01) return "<$0.01";
  return `$${value.toFixed(2)}`;
}

function duration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ${seconds % 60} s`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

function clock(iso: string): string {
  const at = new Date(iso);
  const today = new Date();
  const time = at.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return at.toDateString() === today.toDateString()
    ? time
    : `${at.toLocaleDateString(undefined, { weekday: "short" })} ${time}`;
}

function day(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
