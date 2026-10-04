import { type ReactElement, useState } from "react";
import { Button } from "@/components/kit/button";

// How many rows a long list draws at first: a Studio export can hold thousands of titles, and
// drawing every row at once makes the tab slow to open.
export const rowsAtOnce = 200;

// The first `limit` items, and a way to draw more. A new search or a new file starts over.
export function useBounded<T>(
  items: readonly T[],
  resetOn: unknown,
): {
  readonly shown: readonly T[];
  readonly hidden: number;
  readonly more: () => void;
} {
  const [state, setState] = useState({ limit: rowsAtOnce, resetOn });
  const limit = Object.is(state.resetOn, resetOn) ? state.limit : rowsAtOnce;
  if (!Object.is(state.resetOn, resetOn)) setState({ limit: rowsAtOnce, resetOn });
  return {
    shown: items.length > limit ? items.slice(0, limit) : items,
    hidden: Math.max(0, items.length - limit),
    more: () => setState({ limit: limit + rowsAtOnce, resetOn }),
  };
}

// "Show 200 more · 1,800 not shown" under a bounded list; nothing once every row is drawn.
export function ShowMore({
  hidden,
  onMore,
}: {
  readonly hidden: number;
  readonly onMore: () => void;
}): ReactElement | null {
  if (hidden === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-3">
      <Button size="small" onClick={onMore}>
        {`Show ${Math.min(hidden, rowsAtOnce).toLocaleString("en")} more`}
      </Button>
      <span className="text-small text-ink-2">{`${hidden.toLocaleString("en")} not shown`}</span>
    </div>
  );
}
