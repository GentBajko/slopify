import type { ReactNode } from "react";
import { RailGroup } from "@/components/rail";

// What an editor shows instead of its form: the two-column outline while the list it
// reads the row from is still in flight, and a sentence with the way back when there is
// no row to show. Both editors draw them, and `sheet` below is the one panel style the
// forms use, so the outline cannot drift from the form it stands in for.
export const sheet = "rounded-panel border border-line bg-panel p-[18px]";

export function EditorSkeleton() {
  return (
    <div className="mx-auto grid max-w-[1440px] grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className={`${sheet} flex flex-col gap-[14px]`}>
        <span className="h-8 w-64 rounded-control bg-panel2" />
        <span className="h-[520px] rounded-control bg-panel2" />
      </div>
      <div className={`${sheet} flex flex-col gap-3`}>
        <span className="h-3 w-28 rounded-control bg-panel2" />
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
    <div className="mx-auto max-w-[1440px]">
      <RailGroup>
        <p className="px-4 py-[14px] text-body text-red">{children}</p>
      </RailGroup>
      {back}
    </div>
  );
}

// The link inside an `EditorNotice`, so both editors phrase the way back the same.
export const backLink = "mt-[10px] inline-block text-small text-run-text underline";
