import { z } from "zod";

export const cadenceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("once"), at: z.string().datetime({ offset: true }) }).strict(),
  z
    .object({ kind: z.literal("daily"), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/) })
    .strict(),
  z
    .object({
      kind: z.literal("weekly"),
      time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      days: z.array(z.number().int().min(0).max(6)).min(1).max(7).readonly(),
    })
    .strict(),
]);
export type Cadence = z.infer<typeof cadenceSchema>;

interface LocalParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
}

export function validTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

export function nextOccurrence(cadence: Cadence, timeZone: string, now: Date): Date | null {
  if (!validTimeZone(timeZone)) return null;
  if (cadence.kind === "once") {
    const at = new Date(cadence.at);
    return Number.isNaN(at.valueOf()) || at <= now ? null : at;
  }
  const current = localParts(now, timeZone);
  const wanted = timeOf(cadence.time);
  for (let offset = 0; offset <= 8; offset++) {
    const day = new Date(Date.UTC(current.year, current.month - 1, current.day + offset));
    const weekday = day.getUTCDay();
    if (cadence.kind === "weekly" && !cadence.days.includes(weekday)) continue;
    const candidate = localToUtc(
      {
        year: day.getUTCFullYear(),
        month: day.getUTCMonth() + 1,
        day: day.getUTCDate(),
        ...wanted,
      },
      timeZone,
    );
    if (candidate > now) return candidate;
  }
  return null;
}

function timeOf(value: string): { readonly hour: number; readonly minute: number } {
  const [hour, minute] = value.split(":").map(Number);
  if (hour === undefined || minute === undefined) throw new Error("invalid schedule time");
  return { hour, minute };
}

function localParts(date: Date, timeZone: string): LocalParts {
  const fields = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = fields.find((item) => item.type === type)?.value;
    if (part === undefined) throw new Error(`timezone formatting omitted ${type}`);
    return Number(part);
  };
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
  };
}

function localToUtc(target: LocalParts, timeZone: string): Date {
  let guess = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute);
  for (let attempt = 0; attempt < 4; attempt++) {
    const actual = localParts(new Date(guess), timeZone);
    const delta =
      Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute) -
      Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute);
    if (delta === 0) break;
    guess += delta;
  }
  return new Date(guess);
}
