import type { ScheduleCreate, ScheduleSummary } from "@app/slices/schedules/model.js";
import type { Api } from "@/api";
import { createSchedule, type ScheduleReply, scheduleAction } from "./api";

// "Morning stories (copy)", then "(copy 2)" and on, unused among the names given.
export function copyName(name: string, taken: readonly string[]): string {
  const used = new Set(taken);
  for (let n = 1; ; n += 1) {
    const suffix = n === 1 ? " (copy)" : ` (copy ${String(n)})`;
    const candidate = `${name.slice(0, 200 - suffix.length)}${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
}

// A copy's settings: everything but its topic queue, which stays with the original so the same
// topics are not made twice.
export function duplicateInput(
  schedule: ScheduleSummary,
  id: string,
  name: string,
): ScheduleCreate {
  return {
    id,
    name,
    templateId: schedule.templateId,
    templateVersion: schedule.templateVersion,
    cadence: schedule.cadence,
    timezone: schedule.timezone,
    missedPolicy: schedule.missedPolicy,
    overlapPolicy: schedule.overlapPolicy,
    spendLimitCents: schedule.spendLimitCents,
    items: [],
    topicKeyword: schedule.topicKeyword,
    values: schedule.values,
    brief: schedule.brief,
    topicGeneration: schedule.topicGeneration,
    releases: schedule.releases,
  };
}

// Duplicate: a paused copy, so nothing runs before the person has looked at it.
export async function duplicateSchedule(
  api: Api,
  schedule: ScheduleSummary,
  taken: readonly string[],
): Promise<ScheduleReply<ScheduleSummary>> {
  const name = copyName(schedule.name, taken);
  const created = await createSchedule(api, duplicateInput(schedule, crypto.randomUUID(), name));
  if (!created.ok)
    return {
      ...created,
      message:
        created.reason === "not-due"
          ? `“${schedule.name}” wasn't duplicated: its one-time run has already passed. Press New schedule and choose a time in the future instead.`
          : `“${schedule.name}” wasn't duplicated: ${created.message}`,
    };
  const paused = await scheduleAction(api, created.value.id, "pause", created.value.version);
  return paused.ok
    ? paused
    : {
        ...paused,
        message: `“${name}” was made but couldn't be paused: ${paused.message} Press Pause on its row before its first run.`,
      };
}
