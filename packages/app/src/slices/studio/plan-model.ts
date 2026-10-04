import { z } from "zod";

// The posting plan's shapes, with nothing from the server, so the web app can import them.

export const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const slotSchema = z.object({
  day: z.number().int().min(0).max(6),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
});
const rowSchema = z.object({
  // An inner id, never shown: a release keeps the line it came from.
  name: z.string().trim().min(1).max(20),
  // Which projects the line takes: "" takes any, else only a project of that series.
  series: z.string().trim().max(100).default(""),
  long: slotSchema,
  shorts: z.array(slotSchema).max(10),
  // A line from a schedule's release times (never stored here): it takes only that schedule's
  // projects, preferring the ones its run day (`runDay`) made, in the schedule's time zone, and
  // the calendar shows the schedule's name (`label`).
  schedule: z.string().optional(),
  runDay: z.number().int().min(0).max(6).optional(),
  timeZone: z.string().optional(),
  label: z.string().optional(),
});
export const postingPlanSchema = z.object({
  timeZone: z.string().min(1).max(100),
  rows: z.array(rowSchema).max(14),
});
export type PostingPlan = z.infer<typeof postingPlanSchema>;
export type PlanLine = PostingPlan["rows"][number];
export type PlanSlot = z.infer<typeof slotSchema>;

// How long before its release a video must be uploaded and scheduled, so YouTube's copyright
// and ad-suitability checks finish while it is still private.
export const leadHoursDefault = 24;
export const leadHoursMax = 168;

// A project's series: what its titles keep after the topic, read from the title pattern (else
// the title) after its last "|": "{{Topic}} | Stories To Sleep To" → "Stories To Sleep To".
// A title without one has no series and fits only a line that takes any.
export function seriesOf(config: {
  readonly title: string;
  readonly titlePattern?: string | undefined;
}): string {
  const source = config.titlePattern ?? config.title;
  const at = source.lastIndexOf("|");
  if (at < 0) return "";
  return source
    .slice(at + 1)
    .replace(/\{\{[^{}]*\}\}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
