/// <reference lib="esnext.temporal" />

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
  const current = Temporal.Instant.fromEpochMilliseconds(now.valueOf())
    .toZonedDateTimeISO(timeZone)
    .toPlainDate();
  const wanted = Temporal.PlainTime.from(cadence.time);
  for (let offset = 0; offset <= 8; offset++) {
    const day = current.add({ days: offset });
    if (cadence.kind === "weekly" && !cadence.days.includes(day.dayOfWeek % 7)) continue;
    const candidate = day.toPlainDateTime(wanted).toZonedDateTime(timeZone, {
      disambiguation: "compatible",
    });
    if (candidate.epochMilliseconds > now.valueOf()) return new Date(candidate.epochMilliseconds);
  }
  return null;
}
