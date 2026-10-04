import type { CalendarEntry } from "@app/slices/studio/calendar.js";

// Calendar → Releases pages through the coming weeks two at a time. The server lists releases
// from a day ago up to eight weeks ahead (`/api/studio/releases?weeks=`), so the first page
// starts with the last day and Later stops at the eighth week.
export const pageWeeks = 2;
export const maxWeeks = 8;
const weekMs = 7 * 24 * 3_600_000;

export interface ReleaseWindow {
  // How many weeks to ask the server for: up to the end of this page.
  readonly weeks: number;
  readonly start: Date | undefined;
  readonly end: Date;
  readonly hasEarlier: boolean;
  readonly hasLater: boolean;
}

export function releaseWindow(page: number, now: Date): ReleaseWindow {
  const last = Math.ceil(maxWeeks / pageWeeks) - 1;
  const at = Math.min(Math.max(0, page), last);
  const weeks = Math.min(maxWeeks, (at + 1) * pageWeeks);
  return {
    weeks,
    start: at === 0 ? undefined : new Date(now.getTime() + at * pageWeeks * weekMs),
    end: new Date(now.getTime() + weeks * weekMs),
    hasEarlier: at > 0,
    hasLater: at < last,
  };
}

export function inWindow(
  entries: readonly CalendarEntry[],
  window: ReleaseWindow,
): readonly CalendarEntry[] {
  return entries.filter((entry) => {
    const at = new Date(entry.at).getTime();
    return (
      (window.start === undefined || at >= window.start.getTime()) && at < window.end.getTime()
    );
  });
}
