import type { ReactElement } from "react";
import { updatedOn } from "./item-detail";

// "Tuesday 1 September 2026, 10:00:00 CEST": the whole moment, for a hover over a short date.
export function exactTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString(undefined, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZoneName: "short",
      });
}

// A short date (or the text given) that shows the exact time when hovered.
export function Stamp({
  iso,
  children,
}: {
  readonly iso: string;
  readonly children?: string;
}): ReactElement {
  return (
    <time dateTime={iso} title={exactTime(iso)}>
      {children ?? updatedOn(iso)}
    </time>
  );
}
