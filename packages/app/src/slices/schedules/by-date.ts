/// <reference lib="esnext.temporal" />

import { validTimeZone } from "./calendar.js";

// When a design schedule makes its next piece: each row of its table holds a date (the
// template's date field, typed YYYY-MM-DD), and the piece is made `daysBefore` days ahead of it
// at `time` in the schedule's time zone. A row whose day to make it has passed while its date
// is still to come is made at once; a row whose date is over is due at once too, so the
// scheduler can skip it and say so. Pure; `nextOccurrence` (the other cadences) is untouched.

export interface DesignOccurrence {
  readonly at: Date;
  // The row's position in the schedule's table.
  readonly index: number;
  // The row's date is before today, so it is skipped rather than made.
  readonly over: boolean;
}

interface Row {
  readonly values: Readonly<Record<string, string>>;
}

export function rowDate(row: Row, dateField: string): Temporal.PlainDate | undefined {
  const value = (row.values[dateField] ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  try {
    return Temporal.PlainDate.from(value, { overflow: "reject" });
  } catch {
    return undefined;
  }
}

export function designOccurrences(
  rows: readonly Row[],
  dateField: string,
  daysBefore: number,
  time: string,
  timeZone: string,
  now: Date,
): readonly DesignOccurrence[] {
  if (!validTimeZone(timeZone)) return [];
  const today = Temporal.Instant.fromEpochMilliseconds(now.valueOf())
    .toZonedDateTimeISO(timeZone)
    .toPlainDate();
  const wanted = Temporal.PlainTime.from(time);
  const found: DesignOccurrence[] = [];
  for (const [index, row] of rows.entries()) {
    const date = rowDate(row, dateField);
    if (date === undefined) continue;
    const over = Temporal.PlainDate.compare(date, today) < 0;
    const planned = date
      .subtract({ days: daysBefore })
      .toPlainDateTime(wanted)
      .toZonedDateTime(timeZone, { disambiguation: "compatible" }).epochMilliseconds;
    found.push({
      at: new Date(over ? now.valueOf() : Math.max(planned, now.valueOf())),
      index,
      over,
    });
  }
  // Soonest first; rows due at the same moment keep their table order.
  return found.toSorted((a, b) => a.at.valueOf() - b.at.valueOf() || a.index - b.index);
}

export function nextDesignOccurrence(
  rows: readonly Row[],
  dateField: string,
  daysBefore: number,
  time: string,
  timeZone: string,
  now: Date,
): DesignOccurrence | null {
  return designOccurrences(rows, dateField, daysBefore, time, timeZone, now)[0] ?? null;
}
