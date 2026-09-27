import type { StageTokens, Usage } from "@app/slices/telemetry/usage.js";
import { useQuery } from "@tanstack/react-query";
import { useApp } from "@/app-context";
import { type Column, DataTable, Stat, Stats } from "@/components/kit/stats";
import { stageNames } from "@/project/summary";
import { usageQuery } from "@/queries";

// 10 Usage: this install's own numbers, the same ones the marketing page aggregates. Everything
// on it comes from `GET /api/usage`, which computes it from the local event log and never
// touches the collector, so the page is as truthful offline as on.
//
// The provider and model attribution in the table below is this screen's by design: it is
// local, it is the user's own machine, and it is what makes the token totals checkable. The
// per-model breakdown on the public counters is a different thing and was deferred on
// 2026-09-03.
// Rendered as the Usage section of Settings.
export function UsageBoard() {
  const { api } = useApp();
  const usage = useQuery(usageQuery(api));

  return (
    <div className="flex flex-col gap-8">
      {usage.error === null ? null : (
        <p role="alert" className="m-0 text-body text-danger">
          {usage.error.message}
        </p>
      )}

      {usage.data === undefined ? (
        usage.error === null ? (
          <>
            <StatsSkeleton cells={5} />
            <TableSkeleton />
          </>
        ) : null
      ) : (
        <Board usage={usage.data} />
      )}
    </div>
  );
}

const stageColumns: readonly Column<StageTokens>[] = [
  { id: "stage", header: "Stage", cell: (row) => stageNames[row.stage] },
  { id: "model", header: "Provider · model", cell: (row) => namedBy(row) },
  { id: "in", header: "Tokens in", numeric: true, cell: (row) => whole.format(row.tokensIn) },
  { id: "out", header: "Tokens out", numeric: true, cell: (row) => whole.format(row.tokensOut) },
];

function Board({ usage }: { readonly usage: Usage }) {
  // Fresh install: counters at 0 with the teaching line. Nothing has been counted, which is
  // different from a run whose stages reported no tokens.
  const fresh = Object.values(usage.counters).every((count) => count === 0);
  return (
    <>
      <div>
        <Stats>
          {countersOf(usage).map((counter) => (
            <Stat key={counter.label} label={counter.label} value={counter.value} />
          ))}
        </Stats>
        {fresh ? (
          <p className="m-0 mt-3 text-body text-ink-2">Numbers appear after your first run.</p>
        ) : null}
      </div>

      <div className="min-w-0 overflow-x-auto">
        <DataTable
          caption="Tokens by stage"
          columns={stageColumns}
          rows={usage.byStage}
          rowKey={(row) => `${row.stage}/${row.provider}/${row.model ?? ""}`}
          empty="No stages have run yet."
          className="min-w-[480px] [&_td]:pr-4 [&_th]:pr-4"
        />
      </div>

      <p className="m-0 text-small text-ink-3">
        {`Machine ID ${usage.machineId ?? "not made yet"} · Slopify ${usage.appVersion}`}
      </p>
    </>
  );
}

// "Provider · model", and the provider alone when the adapter reported no model, so no
// row ever ends in a dangling separator.
function namedBy(row: StageTokens): string {
  return row.model === null ? row.provider : `${row.provider} · ${row.model}`;
}

const whole = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const tenths = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const short = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });

// The counter labels are the marketing page's own. The API answers in seconds, because that
// is the sum of the log; turning them into hours is this screen's job. A token total runs to
// the billions, and nine grouped digits in a 32 px face would wrap the cell, so past a
// million it reads compact.
function countersOf(usage: Usage): readonly { readonly label: string; readonly value: string }[] {
  const counters = usage.counters;
  return [
    { label: "Videos made", value: whole.format(counters.videosMade) },
    { label: "Hours of audio", value: tenths.format(counters.audioSeconds / 3600) },
    { label: "Images made", value: whole.format(counters.imagesMade) },
    {
      label: "Tokens used",
      value:
        counters.tokensUsed < 1_000_000
          ? whole.format(counters.tokensUsed)
          : short.format(counters.tokensUsed),
    },
    { label: "Projects", value: whole.format(counters.projects) },
  ];
}

function StatsSkeleton({ cells }: { readonly cells: number }) {
  return (
    <div className="sl-stats">
      {Array.from({ length: cells }, (_, index) => index).map((index) => (
        <div key={index} className="flex flex-col gap-2">
          <span className="h-8 w-20 rounded-control bg-raised" />
          <span className="h-3 w-24 rounded-control bg-raised" />
        </div>
      ))}
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="border-t border-line">
      {[0, 1, 2, 3].map((index) => (
        <div key={index} className="flex items-center gap-[14px] border-b border-line py-3">
          <span className="h-3 w-24 rounded-control bg-raised" />
          <span className="h-3 w-56 max-w-[40%] rounded-control bg-raised" />
          <span className="ml-auto h-3 w-20 rounded-control bg-raised" />
          <span className="h-3 w-20 rounded-control bg-raised" />
        </div>
      ))}
    </div>
  );
}
