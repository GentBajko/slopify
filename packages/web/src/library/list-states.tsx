import type { ReactElement } from "react";
import { Button } from "@/components/kit/button";
import { Callout } from "@/components/kit/callout";

// The list column and its rows: two equal columns from 1180 px so a row's actions sit beside
// its title on a wide screen and under it on a narrower one.
export const libraryListDetail = "min-[1180px]:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]";
export const libraryRow = "grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_auto]";

// The outline of a Library list while it loads: the same rows, title and meta line, so the
// list does not jump when it arrives.
export function ListSkeleton({ label }: { readonly label: string }): ReactElement {
  return (
    <ul aria-label={`${label}, loading`} aria-busy="true" className="sl-list m-0 list-none p-0">
      {[0, 1, 2].map((index) => (
        <li key={index} className="sl-row" aria-hidden="true">
          <span className="flex flex-col gap-2 py-[2px]">
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
