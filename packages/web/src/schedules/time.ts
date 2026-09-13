/// <reference lib="esnext.temporal" />

import { Temporal } from "@js-temporal/polyfill";

function parts(value: Date, timeZone: string): string {
  const fields = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const field = (name: Intl.DateTimeFormatPartTypes): string => {
    const found = fields.find((part) => part.type === name);
    if (!found) throw new Error("Could not resolve the selected timezone.");
    return found.value;
  };
  return `${field("year")}-${field("month")}-${field("day")}T${field("hour")}:${field("minute")}`;
}

export function localScheduleTime(value: string, timeZone: string): string {
  return parts(new Date(value), timeZone);
}

export function scheduleInstant(local: string, timeZone: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local))
    throw new Error("Choose a valid date and time for the one-off run.");
  const wall = Temporal.PlainDateTime.from(local, { overflow: "reject" });
  const zoned = wall.toZonedDateTime(timeZone, { disambiguation: "compatible" });
  if (!wall.equals(zoned.toPlainDateTime()))
    throw new Error(
      "This local time does not exist in the selected timezone. Choose another time.",
    );
  return zoned.toInstant().toString({ smallestUnit: "millisecond" });
}

export function formatScheduleDate(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
