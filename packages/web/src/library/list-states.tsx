import type { ReactElement } from "react";
import { Button } from "@/components/kit/button";
import { Callout } from "@/components/kit/callout";

// The list column and its rows: two equal columns from 1180 px. A row is two lines, its name
// and what it does, with its actions beside it once the list is 400 px wide (the list is a
// size container, kit.css) and under it in a narrower one.
export const libraryListDetail = "min-[1180px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]";
export const libraryRow = "py-2.5 @min-[400px]:grid-cols-[minmax(0,1fr)_auto] @min-[400px]:gap-3";

// The outline of a Library list while it loads: the same rows, title and meta line, so the
// list does not jump when it arrives.
export function ListSkeleton({ label }: { readonly label: string }): ReactElement {
  return (
    <ul aria-label={`${label}, loading`} aria-busy="true" className="sl-list m-0 list-none p-0">
      {[0, 1, 2].map((index) => (
        <li key={index} className="sl-row" aria-hidden="true">
          <span className="flex flex-col gap-2 py-0.5">
            <span className="h-3 w-40 rounded-control bg-sunken" />
            <span className="h-3 w-56 rounded-control bg-sunken" />
          </span>
        </li>
      ))}
    </ul>
  );
}

// A Library list that couldn't be read: what failed, the server's reason, and Try again.
export function LoadError({
  what,
  message,
  onRetry,
}: {
  readonly what: string;
  readonly message: string;
  readonly onRetry: () => void;
}): ReactElement {
  return (
    <Callout
      tone="danger"
      title={`The ${what} couldn't be loaded.`}
      actions={
        <Button size="small" onClick={onRetry}>
          Try again
        </Button>
      }
    >
      {message}
    </Callout>
  );
}
