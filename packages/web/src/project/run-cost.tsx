import type { ProjectState } from "@app/kernel/pipeline.js";
import type {
  LimitWait,
  ModelCost,
  PlanUse,
  RunCost,
  StageCost,
  UsageTotals,
} from "@app/slices/run-cost/panel.js";
import { useQuery } from "@tanstack/react-query";
import { ReceiptIcon, TimerIcon } from "lucide-react";
import { type ReactElement, useEffect, useState } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Callout } from "@/components/kit/callout";
import { SectionHead } from "@/components/kit/section-head";
import { type Column, DataTable, Meter, Stat, Stats } from "@/components/kit/stats";
import { usd } from "@/lib/format";
import { runCostQuery } from "@/queries";
import { limitNames, limitWaitLine } from "./limit-wait.js";
import { stageNames } from "./summary.js";

// The Run cost tab: what the run's provider calls actually cost, per stage and per model,
// what its CLI calls would have cost through the API, the usage behind both, and the share of
// each CLI plan's windows the run took. Everything comes from `GET /projects/:id/run-cost`.
// A row of big numbers first (paid, via API, plan meters, this run's time), then the tables.
export function RunCostPanel({ projectId }: { readonly projectId: string }): ReactElement {
  const { api } = useApp();
  const cost = useQuery(runCostQuery(api, projectId));
  if (cost.error !== null)
    return (
      <Callout tone="danger" title="The run cost could not be loaded.">
        {`${cost.error.message} Reload the page to try again.`}
      </Callout>
    );
  if (cost.data === undefined)
    return (
      <div role="status" aria-label="Loading run cost" className="flex flex-col gap-8">
        <span className="h-16 max-w-3xl rounded-control bg-sunken" />
        <span className="h-40 rounded-control bg-sunken" />
      </div>
    );
  return <Panel cost={cost.data} />;
}

// The run's cost in one line on the project page once the run has ended (done, done with
// problems, failed or canceled), at every width, with the way to the full Cost section.
// Nothing while it runs, waits, or spent nothing.
export function RunCostSummary({
  cost,
  status,
  onOpen,
}: {
  readonly cost: RunCost | undefined;
  readonly status: ProjectState;
  readonly onOpen: () => void;
}): ReactElement | null {
  if (cost === undefined || !ended.has(status) || (cost.calls === 0 && cost.byStage.length === 0))
    return null;
  const parts = [
    `${status === "done" || status === "partial" ? "This run cost" : "Spent so far"} ${money(cost.cost)}${cost.unpriced > 0 ? " plus unpriced calls" : ""}`,
    ...(cost.apiEquivalent === null ? [] : [`~${money(cost.apiEquivalent)} via API`]),
    ...(cost.run === null ? [] : [`${workDuration(cost.run.workingMs)} of work`]),
  ];
  return (
    <section
      aria-label="Run cost"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line pb-3 text-small text-ink-2"
    >
      <span>{parts.join(" · ")}</span>
      <Button variant="quiet" size="small" onClick={onOpen}>
        <ReceiptIcon aria-hidden="true" strokeWidth={1.75} />
        See cost by stage
      </Button>
    </section>
  );
}

const ended: ReadonlySet<ProjectState> = new Set(["done", "partial", "failed", "canceled"]);

// "Working for 9 min 30 s": the current run's working time on the project page, ticking each
// second while a step runs and holding still while it pauses or waits ("9 min 30 s of work so
// far"); `measuredAt` is when the server counted it. Nothing before the current revision's
// run starts or once it ended, where the cost line says how long it worked.
export function RunClock({
  cost,
  status,
  measuredAt,
}: {
  readonly cost: RunCost | undefined;
  readonly status: ProjectState;
  readonly measuredAt: number;
}): ReactElement | null {
  const run = cost?.run ?? null;
  const running = status === "running";
  const on = run?.current === true && !ended.has(status);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);
  if (!on || run === null) return null;
  // While a step runs the clock counts every second from the last reading; the page reads the
  // server's figure again every 20 seconds, so it never drifts far. While the project only waits
  // (a plan limit, a review) the server's figure holds, and so does the clock, rather than
  // counting up and snapping back at each reading.
  const ms = run.workingMs + (running && run.running ? Math.max(0, now - measuredAt) : 0);
  const working = running ? stopwatch(ms) : workDuration(ms);
  return (
    <>
      <span aria-hidden="true">·</span>
      <span
        role="timer"
        aria-label="Run time"
        className={
          running
            ? "inline-flex items-center gap-1.5 rounded-full bg-accent/15 px-2.5 py-0.5 font-semibold text-ink tabular-nums"
            : "inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-0.5 font-semibold text-ink-2 tabular-nums"
        }
      >
        <TimerIcon aria-hidden="true" strokeWidth={2} className="size-3.5 shrink-0" />
        {running ? `Working · ${working}` : `${working} of work so far`}
      </span>
    </>
  );
}

const stageColumns: readonly Column<StageCost>[] = [
  { id: "stage", header: "Stage", cell: (row) => <strong>{stageNames[row.stage]}</strong> },
  { id: "cost", header: "Cost", numeric: true, cell: lineCost },
  { id: "api", header: "Via API", numeric: true, cell: apiCost },
  { id: "usage", header: "Usage", numeric: true, cell: (row) => usage(row) || "—" },
  {
    id: "time",
    header: "Working time",
    numeric: true,
    cell: (row) => (row.wallMs === null ? "—" : workDuration(row.wallMs)),
  },
];

const modelColumns: readonly Column<ModelCost>[] = [
  { id: "model", header: "Provider · model", cell: (row) => <strong>{modelName(row)}</strong> },
  { id: "cost", header: "Cost", numeric: true, cell: lineCost },
  { id: "api", header: "Via API", numeric: true, cell: apiCost },
  { id: "usage", header: "Usage", numeric: true, cell: (row) => usage(row) || "—" },
  { id: "calls", header: "Calls", numeric: true, cell: (row) => whole.format(row.calls) },
];

function windowName(kind: PlanUse["windows"][number]["kind"]): string {
  return kind === "five_hour" ? "5-hour" : kind === "weekly" ? "weekly" : "current";
}

function Panel({ cost }: { readonly cost: RunCost }): ReactElement {
  if (cost.calls === 0 && cost.byStage.length === 0)
    return (
      <p className="m-0 text-body text-ink-2">
        Nothing has been spent yet. The cost of each provider call appears here as the run makes it.
      </p>
    );
  const onPlan = cost.byModel.some((row) => row.onPlan);
  const meters = cost.plans.flatMap((plan) =>
    plan.reported ? plan.windows.map((window) => ({ plan, window })) : [],
  );
  return (
    <div className="flex flex-col gap-8">
      <section aria-label="Run cost summary" className="flex flex-col gap-3">
        <Stats>
          <Stat
            value={money(cost.cost)}
            label={cost.unpriced > 0 ? "known cost, paid to providers" : "paid to providers"}
          />
          {cost.apiEquivalent === null ? null : (
            <Stat value={`~${money(cost.apiEquivalent)}`} label="same work via API" />
          )}
          {meters.map(({ plan, window }) => {
            const name = `${windowName(window.kind)} ${plan.name} limit`;
            const used = window.usedPercent < 1 ? "<1%" : `${percent.format(window.usedPercent)}%`;
            return (
              <Stat key={`${plan.account}/${window.kind}`} value={used} label={`of ${name}`}>
                <Meter
                  value={window.usedPercent / 100}
                  label={`Share of the ${name} this run used`}
                  valueText={`${used} of your ${name}; now at ${percent.format(window.nowPercent)}%`}
                  tone={window.nowPercent >= 80 ? "waiting" : "accent"}
                />
              </Stat>
            );
          })}
          {cost.run === null ? null : (
            <Stat value={workDuration(cost.run.workingMs)} label="this run's working time" />
          )}
        </Stats>
        <div className="flex flex-col gap-1 text-small text-ink-2">
          {cost.unpriced > 0 ? (
            <p className="m-0">
              {`Plus ${count(cost.unpriced, "call")} the model catalogue has no price for.`}
            </p>
          ) : null}
          {onPlan ? <p className="m-0">{planLine(cost)}</p> : null}
          {cost.plans.map((plan) => (
            <p key={plan.account} className="m-0">
              {planUse(plan)}
            </p>
          ))}
        </div>
      </section>

      <section aria-label="By stage">
        <SectionHead title="By stage" info="project.cost.by-stage" className="mb-3" />
        <div className="overflow-x-auto">
          <DataTable
            caption="Run cost by stage"
            columns={stageColumns}
            rows={cost.byStage}
            rowKey={(row) => row.stage}
          />
        </div>
      </section>

      <section aria-label="By model">
        <SectionHead title="By model" info="project.cost.by-model" className="mb-3" />
        <div className="overflow-x-auto">
          <DataTable
            caption="Run cost by model"
            columns={modelColumns}
            rows={cost.byModel}
            rowKey={(row) => `${row.provider}/${row.model}/${row.kind}`}
          />
        </div>
      </section>

      <div className="flex flex-col gap-1">
        <p className="m-0 text-small text-ink-2">
          {`In total: ${usage(cost.totals) || "no reported usage"} · ${workDuration(cost.totals.wallMs)} working, over every run.`}
        </p>
        <p className="m-0 text-small text-ink-3">
          {`Priced from the model catalogue${cost.catalogueDate === null ? "" : ` of ${cost.catalogueDate}`} when each call finished. Retries that failed are not charged here; taxes and included credits are not counted.`}
        </p>
      </div>
    </div>
  );
}

// What the status line says while a stage waits for a CLI's plan to reset.
export function limitWaitMessage(waits: readonly LimitWait[]): string | undefined {
  const line = limitWaitLine(waits, clock);
  if (line === undefined) return undefined;
  const names = limitNames(waits);
  return `${line}. The run carries on by itself; work that does not need ${names} keeps going.`;
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
      const name = windowName(window.kind);
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

export const money = usd;

// "1:03:27": a clock that visibly counts, for a run in progress.
export function stopwatch(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${String(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

export function workDuration(ms: number): string {
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
