import type { ProjectState } from "@app/kernel/pipeline.js";
import type {
  ModelCost,
  PlanUse,
  RunCost,
  StageCost,
  UsageTotals,
} from "@app/slices/run-cost/panel.js";
import { isSampleStandIn, providers as services } from "@app/slices/settings/model.js";
import { useQueries, useQuery } from "@tanstack/react-query";
import { TimerIcon } from "lucide-react";
import { type ReactElement, useEffect, useState } from "react";
import { useApp } from "@/app-context";
import { Callout } from "@/components/kit/callout";
import { SectionHead } from "@/components/kit/section-head";
import { type Column, DataTable, Meter, Stat, Stats } from "@/components/kit/stats";
import { usd, wholeNumber } from "@/lib/format";
import { modelsQuery } from "@/lib/models";
import { stageWords } from "@/lib/stage-words";
import { runCostQuery } from "@/queries";
import { accountLine, shareLabel, shareLine, shareValue, windowName } from "./plan-share.js";

// The Cost section: what the project's calls to each service cost, per step and per service and
// model, what its CLI calls would have cost through the API, the usage behind both, and the
// share of each CLI plan's windows the run took. Everything comes from
// `GET /projects/:id/run-cost`. The total cost and working time are the status column's cost
// line, so the section does not repeat them as big numbers: what only it can say leads (the
// API equivalent, the plan meters), then the tables, then the totals as one line under them.
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

// The tables' columns. "Via API" (what a CLI plan's calls would cost through the provider's
// API) only when some row has such a figure; a column of dashes says nothing.
function stageColumns(api: boolean): readonly Column<StageCost>[] {
  return [
    { id: "stage", header: "Step", cell: (row) => <strong>{stageWords[row.stage]}</strong> },
    { id: "cost", header: "Cost", numeric: true, cell: lineCost },
    ...(api ? [{ id: "api", header: "Via API", numeric: true, cell: apiCost }] : []),
    { id: "usage", header: "Usage", numeric: true, cell: stageUsage },
    {
      id: "time",
      header: "Working time",
      numeric: true,
      cell: (row) => (row.wallMs === null ? "—" : workDuration(row.wallMs)),
    },
  ];
}

function modelColumns(
  api: boolean,
  name: (row: ModelCost) => string,
): readonly Column<ModelCost>[] {
  return [
    { id: "model", header: "Service · model", cell: (row) => <strong>{name(row)}</strong> },
    { id: "cost", header: "Cost", numeric: true, cell: lineCost },
    ...(api ? [{ id: "api", header: "Via API", numeric: true, cell: apiCost }] : []),
    { id: "usage", header: "Usage", numeric: true, cell: (row) => usage(row) || "—" },
    { id: "calls", header: "Calls", numeric: true, cell: (row) => wholeNumber.format(row.calls) },
  ];
}

// The Video step draws the shorts' own pictures: said so, so it does not read as the video
// drawing its images again.
function stageUsage(row: StageCost): string {
  const said = usage(row);
  if (said === "") return "—";
  return row.stage === "video" && row.images > 0
    ? said.replace(count(row.images, "image"), `${count(row.images, "image")} for the shorts`)
    : said;
}

function Panel({ cost }: { readonly cost: RunCost }): ReactElement {
  const names = useServiceNames(cost.byModel);
  if (cost.calls === 0 && cost.byStage.length === 0)
    return (
      <p className="m-0 text-body text-ink-2">
        Nothing has been spent yet. The cost of each call to a service appears here as the run makes
        it.
      </p>
    );
  const onPlan = cost.byModel.some((row) => row.onPlan);
  const viaApi =
    cost.byStage.some((row) => row.apiEquivalent !== null) ||
    cost.byModel.some((row) => row.apiEquivalent !== null);
  const meters = cost.plans.flatMap((plan) =>
    plan.reported ? plan.windows.map((window) => ({ plan, window })) : [],
  );
  const stats = cost.apiEquivalent !== null || meters.length > 0;
  const notes = cost.unpriced > 0 || onPlan || cost.plans.length > 0;
  return (
    <div className="flex max-w-[860px] flex-col gap-6">
      {!stats && !notes ? null : (
        <section aria-label="Run cost summary" className="flex flex-col gap-3">
          {stats ? (
            <Stats className="[grid-template-columns:repeat(auto-fit,minmax(140px,max-content))] gap-x-12">
              {cost.apiEquivalent === null ? null : (
                <Stat value={`~${usd(cost.apiEquivalent)}`} label="same work via API" />
              )}
              {meters.map(({ plan, window }) => {
                const name = `${windowName(window.kind)} ${plan.name} limit`;
                const used = shareValue(window);
                return (
                  <Stat
                    key={`${plan.account}/${window.kind}`}
                    value={used}
                    label={shareLabel(window, name)}
                  >
                    <Meter
                      value={(window.usedPercent ?? 0) / 100}
                      label={`Share of the ${name} this run used`}
                      valueText={`${used} of your ${name}; the account is at ${percent.format(window.nowPercent)}%`}
                      tone={window.nowPercent >= 80 ? "waiting" : "accent"}
                    />
                  </Stat>
                );
              })}
            </Stats>
          ) : null}
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
      )}

      <section aria-label="By step" className="flex flex-col gap-2">
        <SectionHead
          as="h3"
          title="By step"
          meta="What each step has cost so far, retries and work made again included; working time is how long its work ran, over every run."
          className="pb-0"
        />
        <div className="overflow-x-auto">
          <DataTable
            caption="Run cost by step"
            columns={stageColumns(viaApi)}
            rows={cost.byStage}
            rowKey={(row) => row.stage}
          />
        </div>
      </section>

      <section aria-label="By model" className="flex flex-col gap-2">
        <SectionHead
          as="h3"
          title="By model"
          meta={
            viaApi
              ? "Cost is what each service charged for its calls. A signed-in tool such as Claude Code costs $0 on its plan; Via API is what the same work would cost through the service's API."
              : "Cost is what each service charged for its calls."
          }
          className="pb-0"
        />
        <div className="overflow-x-auto">
          <DataTable
            caption="Run cost by model"
            columns={modelColumns(viaApi, names)}
            rows={cost.byModel}
            rowKey={(row) => `${row.provider}/${row.model}/${row.kind}`}
          />
        </div>
      </section>

      <div className="flex flex-col gap-1">
        <p className="m-0 text-small text-ink-2">
          {`In total: ${usd(cost.cost)}${cost.unpriced > 0 ? " known" : ""} · ${usage(cost.totals) || "no reported usage"} · ${workDuration(cost.totals.wallMs)} working, over every run.`}
        </p>
        <p className="m-0 text-small text-ink-3">
          {`Priced from the model catalogue${cost.catalogueDate === null ? "" : ` of ${cost.catalogueDate}`} when each call finished. Retries that failed are not charged here; taxes and included credits are not counted.`}
        </p>
      </div>
    </div>
  );
}

// "CLI calls: $0 on your plan · ~$1.20 via API".
export function planLine(cost: Pick<RunCost, "apiEquivalent" | "apiUnpriced">): string {
  const api = cost.apiEquivalent ?? 0;
  if (api === 0 && cost.apiUnpriced > 0)
    return "CLI calls: $0 on your plan · no API price is listed for their models.";
  const unpriced =
    cost.apiUnpriced > 0 ? ` (plus ${count(cost.apiUnpriced, "call")} with no API price)` : "";
  return `CLI calls: $0 on your plan · ~${usd(api)} via API${unpriced}.`;
}

// Each window's share of the run and the account's own reading beside it, or a plain word
// that it is not known.
export function planUse(plan: PlanUse): string {
  if (!plan.reported)
    return `${plan.name} did not report its plan limits for this run, so the share it used is not known.`;
  if (plan.windows.length === 0) return `${plan.name} reported no limit windows for this run.`;
  return plan.windows
    .map((window) => `${shareLine(plan, window)} ${accountLine(plan, window)}`)
    .join(" ");
}

function lineCost(row: StageCost | ModelCost): string {
  if (row.calls === 0) return "—";
  if ("onPlan" in row && row.onPlan) return "$0 on plan";
  if ("provider" in row && isSampleStandIn(row.provider)) return "$0 · sample, free";
  return row.unpriced > 0
    ? row.unpriced === row.calls
      ? "Not known"
      : `${usd(row.cost)} + not known`
    : usd(row.cost);
}

function apiCost(row: StageCost | ModelCost): string {
  if (row.apiEquivalent === null) return "—";
  if (row.apiUnpriced > 0 && row.apiEquivalent === 0) return "No API price";
  return `~${usd(row.apiEquivalent)}`;
}

// "Inworld · Inworld TTS-2": each service and model by the names Create shows, from the model
// catalogue; an id stands in only while the catalogue is loading or does not know it. A
// sample's stand-in is named for what it is ("Sample artist").
function useServiceNames(rows: readonly ModelCost[]): (row: ModelCost) => string {
  const { api } = useApp();
  const ids = [...new Set(rows.map((row) => row.provider))].filter((id) => !isSampleStandIn(id));
  const lists = useQueries({ queries: ids.map((id) => modelsQuery(api, id)) });
  return (row) => {
    if (isSampleStandIn(row.provider))
      return `Sample ${row.provider.slice("sample-".length).replaceAll("-", " ")}`;
    const service = services.find((one) => one.id === row.provider)?.displayName ?? row.provider;
    const models = lists[ids.indexOf(row.provider)]?.data?.models ?? [];
    const name = (id: string) => models.find((one) => one.id === id)?.name ?? id;
    const model = row.model === "" ? "its default model" : name(row.model);
    return row.apiModel === null
      ? `${service} · ${model}`
      : `${service} · ${model} (as ${name(row.apiModel)})`;
  };
}

export function usage(totals: UsageTotals): string {
  const parts: string[] = [];
  if (totals.tokensIn + totals.tokensOut > 0)
    parts.push(
      `${compact(totals.tokensIn)} in / ${compact(totals.tokensOut)} out tokens${totals.cachedTokens > 0 ? ` (${compact(totals.cachedTokens)} cached)` : ""}`,
    );
  if (totals.characters > 0) parts.push(`${compact(totals.characters)} characters`);
  if (totals.images > 0) parts.push(count(totals.images, "image"));
  if (totals.seconds > 0) parts.push(`${wholeNumber.format(totals.seconds)} s of video`);
  return parts.join(" · ");
}

const percent = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const shortNumber = new Intl.NumberFormat(undefined, {
  notation: "compact",
  maximumFractionDigits: 1,
});

function compact(value: number): string {
  return value < 10_000 ? wholeNumber.format(value) : shortNumber.format(value);
}

function count(value: number, noun: string): string {
  return `${wholeNumber.format(value)} ${noun}${value === 1 ? "" : "s"}`;
}

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
