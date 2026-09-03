// The tally board: five counters in tabular Barlow 700 at 32 px with engraved labels, on a
// `--panel` sheet. 01 shows the world's totals in it and 10 shows this machine's, so the board
// itself knows neither - it is handed formatted strings and lays them out.

export interface Tally {
  readonly label: string;
  readonly value: string;
}

export function TallyBoard({ counters }: { readonly counters: readonly Tally[] }) {
  return (
    <dl className="m-0 grid grid-cols-2 overflow-hidden rounded-panel border border-line bg-panel md:grid-cols-5">
      {counters.map((counter) => (
        // The label is written first so a screen reader hears the name before the number,
        // and the column is reversed so the eye meets the number first. The -1 px pull
        // makes neighbouring cells share one divider, the way rails do.
        <div
          key={counter.label}
          className="-ml-px flex flex-col-reverse gap-2 border-l border-line p-[18px]"
        >
          <dt className="engraved text-ink3">{counter.label}</dt>
          <dd className="m-0 text-counter font-bold tabular-nums tracking-[-0.01em]">
            {counter.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

// The same board with nothing in it yet: the shape arrives before the numbers do.
export function TallySkeleton({ cells }: { readonly cells: number }) {
  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-panel border border-line bg-panel md:grid-cols-5">
      {Array.from({ length: cells }, (_, index) => index).map((index) => (
        <div key={index} className="-ml-px flex flex-col gap-2 border-l border-line p-[18px]">
          <span className="h-8 w-20 rounded-control bg-panel2" />
          <span className="h-3 w-24 rounded-control bg-panel2" />
        </div>
      ))}
    </div>
  );
}
