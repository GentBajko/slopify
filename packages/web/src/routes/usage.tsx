import type { StageTokens, Usage } from "@app/slices/telemetry/usage.js";
import { useQuery } from "@tanstack/react-query";
import { useApp } from "@/app-context";
import { Board, BoardColumn } from "@/components/kit/board";
import { EmptyState } from "@/components/kit/empty-state";
import { ButtonLink } from "@/components/kit/link";
import { type Column, DataTable, Stat, Stats } from "@/components/kit/stats";
import { wholeNumber } from "@/lib/format";
import { stageWords } from "@/lib/stage-words";
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
        <Numbers usage={usage.data} />
      )}
    </div>
  );
}

// What each part of the video read and wrote, in the words the notice uses ("how much text each
// AI read and wrote"); the unit, tokens, is said once under the counters.
const stageColumns: readonly Column<StageTokens>[] = [
  { id: "stage", header: "Part", cell: (row) => stageWords[row.stage] },
  { id: "model", header: "Service · model", cell: (row) => namedBy(row) },
  { id: "in", header: "Read", numeric: true, cell: (row) => wholeNumber.format(row.tokensIn) },
  {
    id: "out",
    header: "Written",
    numeric: true,
    cell: (row) => wholeNumber.format(row.tokensOut),
  },
];

// This computer's random number, as the notice calls it, and the version each count carries.
function machineLine(usage: Usage): string {
  return usage.machineId === null
    ? `Nothing is counted until you press Start counting · Slopify ${usage.appVersion}`
    : `This computer's random number: ${usage.machineId} · Slopify ${usage.appVersion}`;
}

// The counters and the table side by side on a wide screen, stacked on a narrow one. A fresh
// install has nothing to count: it says so once, with the way to make the first video, rather
// than five zeros over an empty table.
function Numbers({ usage }: { readonly usage: Usage }) {
  const fresh =
    Object.values(usage.counters).every((count) => count === 0) && usage.byStage.length === 0;
  if (fresh)
    return (
      <div className="flex flex-col gap-3">
        <EmptyState
          title="Nothing made yet"
          actions={
            <ButtonLink variant="primary" to="/play">
              Make your first video
            </ButtonLink>
          }
        >
          After your first video, this page shows what this computer made and how much text the AI
          read and wrote for it.
        </EmptyState>
        <p className="m-0 text-small text-ink-3">{machineLine(usage)}</p>
      </div>
    );
  return (
    <Board split="even">
      <BoardColumn>
        <div className="flex flex-col gap-3">
          <Stats>
            {countersOf(usage).map((counter) => (
              <Stat key={counter.label} label={counter.label} value={counter.value} />
            ))}
          </Stats>
          <p className="m-0 text-small text-ink-2">
            AI text is counted in tokens: pieces of about three quarters of a word.
          </p>
        </div>
        <p className="m-0 text-small text-ink-3">{machineLine(usage)}</p>
      </BoardColumn>

      {usage.byStage.length === 0 ? null : (
        <BoardColumn>
          <div className="min-w-0 overflow-x-auto">
            <DataTable
              caption="AI text by part of the video"
              columns={stageColumns}
              rows={usage.byStage}
              rowKey={(row) => `${row.stage}/${row.provider}/${row.model ?? ""}`}
              className="min-w-[480px] [&_td]:pr-4 [&_th]:pr-4"
            />
          </div>
        </BoardColumn>
      )}
    </Board>
  );
}

// "Provider · model", and the provider alone when the adapter reported no model, so no
// row ever ends in a dangling separator.
function namedBy(row: StageTokens): string {
  return row.model === null ? row.provider : `${row.provider} · ${row.model}`;
}

const tenths = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const short = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });

// The counter labels follow the marketing page's, in plain words: its "Tokens used" is the
// AI text read and written here. The API answers in seconds, because that is the sum of the
// log; turning them into hours is this screen's job. A token total runs to the billions, and
// nine grouped digits in a 32 px face would wrap the cell, so past a million it reads compact.
function countersOf(usage: Usage): readonly { readonly label: string; readonly value: string }[] {
  const counters = usage.counters;
  return [
    { label: "Videos made", value: wholeNumber.format(counters.videosMade) },
    { label: "Hours of narration", value: tenths.format(counters.audioSeconds / 3600) },
    { label: "Images made", value: wholeNumber.format(counters.imagesMade) },
    {
      label: "AI text read and written",
      value:
        counters.tokensUsed < 1_000_000
          ? wholeNumber.format(counters.tokensUsed)
          : short.format(counters.tokensUsed),
    },
    { label: "Projects", value: wholeNumber.format(counters.projects) },
  ];
}

function StatsSkeleton({ cells }: { readonly cells: number }) {
  return (
    <div className="sl-stats">
      {Array.from({ length: cells }, (_, index) => index).map((index) => (
        <div key={index} className="flex flex-col gap-2">
          <span className="h-8 w-20 rounded-control bg-sunken" />
          <span className="h-3 w-24 rounded-control bg-sunken" />
        </div>
      ))}
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="border-t border-line">
      {[0, 1, 2, 3].map((index) => (
        <div key={index} className="flex items-center gap-4 border-b border-line py-3">
          <span className="h-3 w-24 rounded-control bg-sunken" />
          <span className="h-3 w-56 max-w-[40%] rounded-control bg-sunken" />
          <span className="ml-auto h-3 w-20 rounded-control bg-sunken" />
          <span className="h-3 w-20 rounded-control bg-sunken" />
        </div>
      ))}
    </div>
  );
}
