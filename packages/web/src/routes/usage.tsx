import type { StageTokens, Usage } from "@app/slices/telemetry/usage.js";
import { useQuery } from "@tanstack/react-query";
import { useApp } from "@/app-context";
import { RailGroup } from "@/components/rail";
import type { Tally } from "@/components/tally";
import { TallyBoard, TallySkeleton } from "@/components/tally";
import { stageNames } from "@/project/summary";
import { usageQuery } from "@/queries";

// 10 Usage: this install's own numbers, the same ones the marketing page aggregates
// (uiux/screens/10-usage.md). Everything on it comes from `GET /api/usage`, which
// computes it from the local event log and never touches the collector, so the page is
// as truthful offline as on.
//
// The provider and model attribution in the table below is this screen's by design
// (`logic/16` §Q128): it is local, it is the user's own machine, and it is what makes the
// token totals checkable. The per-model breakdown on the public counters is a different
// thing and was deferred on 2026-09-03.
export function UsageRoute() {
  const { api } = useApp();
  const usage = useQuery(usageQuery(api));

  return (
    <div className="flex max-w-[1100px] flex-col gap-6">
      <div>
        <h1 className="mb-1 text-title font-bold tracking-[-0.01em]">Usage</h1>
        <p className="text-body text-ink2">
          This machine only. The same counters, anonymised, feed slopify.stream.
        </p>
      </div>

      {usage.error === null ? null : (
        <RailGroup>
          <p className="px-4 py-[14px] text-body text-red">{usage.error.message}</p>
        </RailGroup>
      )}

      {usage.data === undefined ? (
        usage.error === null ? (
          <>
            <TallySkeleton cells={5} />
            <TableSkeleton />
          </>
        ) : null
      ) : (
        <Board usage={usage.data} />
      )}
    </div>
  );
}

function Board({ usage }: { readonly usage: Usage }) {
  // "Fresh install: counters at 0 with the teaching line." Nothing has been counted, which
  // is different from a run whose stages reported no tokens.
  const fresh = Object.values(usage.counters).every((count) => count === 0);
  return (
    <>
      <TallyBoard counters={countersOf(usage)} />
      {fresh ? (
        <p className="-mt-3 text-body text-ink2">Numbers appear after your first run.</p>
      ) : null}

      <div className="overflow-hidden rounded-panel border border-line bg-panel">
        <table aria-label="Tokens by stage" className="w-full table-fixed border-collapse">
          <thead>
            <tr className="border-b border-line">
              <Head className="w-[24%]">Tokens by stage</Head>
              <Head className="w-[38%]">Provider · model</Head>
              <Head className="w-[19%] text-right">Tokens in</Head>
              <Head className="w-[19%] text-right">Tokens out</Head>
            </tr>
          </thead>
          <tbody>
            {usage.byStage.map((row) => (
              <tr
                key={`${row.stage}/${row.provider}/${row.model ?? ""}`}
                className="border-b border-line last:border-b-0"
              >
                <Cell className="truncate font-semibold">{stageNames[row.stage]}</Cell>
                <Cell className="truncate text-ink2">{namedBy(row)}</Cell>
                <Cell className="text-right tabular-nums">{whole.format(row.tokensIn)}</Cell>
                <Cell className="text-right tabular-nums">{whole.format(row.tokensOut)}</Cell>
              </tr>
            ))}
          </tbody>
        </table>
        {usage.byStage.length === 0 ? (
          <p className="px-4 py-5 text-small text-ink3">No stages have run yet.</p>
        ) : null}
      </div>

      <p className="engraved text-ink3">
        {`Machine ID ${usage.machineId ?? "not made yet"} · Slopify ${usage.appVersion}`}
      </p>
    </>
  );
}

function Head({ children, className }: { readonly children: string; readonly className: string }) {
  return <th className={`engraved px-4 py-3 text-left text-ink3 ${className}`}>{children}</th>;
}

function Cell({ children, className }: { readonly children: string; readonly className: string }) {
  return <td className={`px-4 py-3 align-top text-small ${className}`}>{children}</td>;
}

// "Provider · model", and the provider alone when the adapter reported no model, so no
// row ever ends in a dangling separator.
function namedBy(row: StageTokens): string {
  return row.model === null ? row.provider : `${row.provider} · ${row.model}`;
}

const whole = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const tenths = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const short = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });

// The counter labels are the marketing page's own (uiux/screens/10-usage.md, Copy). The
// API answers in seconds because `logic/16` §Q132 wants the sum of the log; turning them
// into hours is this screen's job. A token total runs to the billions, and nine grouped
// digits in a 32 px face would wrap the cell, so past a million it reads compact.
function countersOf(usage: Usage): readonly Tally[] {
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

function TableSkeleton() {
  return (
    <RailGroup>
      {[0, 1, 2, 3].map((index) => (
        <div
          key={index}
          className="flex items-center gap-[14px] border-b border-line px-4 py-3 last:border-b-0"
        >
          <span className="h-3 w-24 rounded-control bg-panel2" />
          <span className="h-3 w-56 rounded-control bg-panel2" />
          <span className="ml-auto h-3 w-20 rounded-control bg-panel2" />
          <span className="h-3 w-20 rounded-control bg-panel2" />
        </div>
      ))}
    </RailGroup>
  );
}
