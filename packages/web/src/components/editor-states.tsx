import type { ReactNode } from "react";
import { Callout } from "@/components/kit/callout";

// What an editor shows instead of its form: the two-column outline while the list it
// reads the row from is still in flight, and a sentence with the way back when there is
// no row to show. Both editors draw them, and `sheet` below is the one panel style the
// forms use, so the outline cannot drift from the form it stands in for.
export const sheet = "rounded-media border border-line bg-surface p-4";

export function EditorSkeleton() {
  return (
    <div className="mx-auto grid max-w-[1440px] grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className={`${sheet} flex flex-col gap-4`}>
        <span className="h-8 w-64 rounded-control bg-sunken" />
        <span className="h-[520px] rounded-control bg-sunken" />
      </div>
      <div className="flex flex-col gap-3 pt-1">
        <span className="h-3 w-28 rounded-control bg-sunken" />
      </div>
    </div>
  );
}

// `back` is a node rather than a route: the two editors return to two different lists,
// each on the tab the template belonged to.
export function EditorNotice({
  children,
  back,
}: {
  readonly children: string;
  readonly back: ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-3">
      <Callout tone="danger" title="This can't be opened.">
        {children}
      </Callout>
      {back}
    </div>
  );
}

// The link inside an `EditorNotice`, so both editors phrase the way back the same.
export const backLink = "inline-block text-small text-accent-ink underline underline-offset-[3px]";
