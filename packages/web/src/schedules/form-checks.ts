import { validTimeZone } from "@app/slices/schedules/calendar.js";
import { briefMax, queueMax } from "@app/slices/schedules/schema.js";

// The schedule form's own checks, each attached to the field it is about, in the order the
// fields appear, so a failed Save can mark them and move focus to the first one.

export const scheduleFields = [
  "name",
  "template",
  "once",
  "time",
  "weekdays",
  "timezone",
  "spend",
  "topics",
  "brief",
  "generation",
] as const;
export type ScheduleField = (typeof scheduleFields)[number];
export type ScheduleProblems = Partial<Readonly<Record<ScheduleField, string>>>;

// The element focused for a field's problem; topics and generation focus their own section.
export const scheduleFieldIds: Readonly<Record<ScheduleField, string>> = {
  name: "schedule-name",
  template: "schedule-template",
  once: "schedule-once",
  time: "schedule-time",
  weekdays: "schedule-weekdays",
  timezone: "schedule-timezone",
  spend: "schedule-spend",
  topics: "schedule-topics",
  brief: "schedule-brief",
  generation: "schedule-generation",
};

const fieldNames: Readonly<Record<ScheduleField, string>> = {
  name: "Name",
  template: "Template",
  once: "Run at",
  time: "Local time",
  weekdays: "Weekdays",
  timezone: "Timezone",
  spend: "Spend ceiling",
  topics: "Topics",
  brief: "Series brief",
  generation: "Topic generation",
};

export interface ScheduleCheckInput {
  readonly name: string;
  readonly templateChosen: boolean;
  readonly kind: "daily" | "weekly" | "once";
  readonly onceAt: string;
  readonly time: string;
  readonly days: readonly number[];
  readonly timezone: string;
  readonly spend: string;
  readonly topicProblems: readonly string[];
  readonly topicCount: number;
  readonly brief: string;
  readonly generationLlm: { readonly provider: string; readonly model: string } | null;
}

export function scheduleProblems(input: ScheduleCheckInput): ScheduleProblems {
  const found: Partial<Record<ScheduleField, string>> = {};
  if (input.name.trim() === "") found.name = "Give the schedule a name.";
  if (!input.templateChosen) found.template = "Choose the template each run starts from.";
  if (input.kind === "once" && input.onceAt === "")
    found.once = "Pick the date and time of the one run.";
  if (input.kind !== "once" && input.time === "") found.time = "Pick the time of day runs start.";
  if (input.kind === "weekly" && input.days.length === 0)
    found.weekdays = "Choose at least one weekday for a weekly schedule.";
  if (!validTimeZone(input.timezone.trim()))
    found.timezone =
      "Enter a timezone name like Europe/Tirane or America/New_York; start typing to see the list.";
  if (dollarsToCents(input.spend) === undefined)
    found.spend =
      "Enter the ceiling in US dollars, such as 5 or 2.50, or leave it empty for no ceiling.";
  if (input.topicProblems.length > 0)
    found.topics = `Fix the topics first. ${input.topicProblems.slice(0, 3).join(" ")}`;
  else if (input.topicCount > queueMax)
    found.topics = `Keep the list to ${String(queueMax)} topics or fewer; it has ${String(input.topicCount)}.`;
  if (input.brief.trim().length > briefMax)
    found.brief = `Keep the series brief to ${String(briefMax)} characters or fewer.`;
  if (
    input.generationLlm !== null &&
    (input.generationLlm.provider === "" || input.generationLlm.model === "")
  )
    found.generation =
      "Pick both a provider and a model for topic generation, or tick Use the template's LLM.";
  return found;
}

export function firstProblem(problems: ScheduleProblems): ScheduleField | undefined {
  return scheduleFields.find((field) => problems[field] !== undefined);
}

// The line at the top of the form: which fields to fix, by their names on screen.
export function problemSummary(problems: ScheduleProblems): string {
  const named = scheduleFields.filter((field) => problems[field] !== undefined);
  return named.map((field) => `${fieldNames[field]}: ${problems[field] ?? ""}`).join(" ");
}

// "5", "5.5" or "5.50" dollars as 550 cents; "" is no ceiling (null); anything else undefined.
export function dollarsToCents(text: string): number | null | undefined {
  const trimmed = text.trim().replace(/^\$/, "");
  if (trimmed === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return undefined;
  return Math.round(Number(trimmed) * 100);
}

export function centsToDollars(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

// Every timezone name this browser knows, for the Timezone box's suggestions.
export function timeZoneNames(): readonly string[] {
  try {
    return typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  } catch {
    return [];
  }
}
