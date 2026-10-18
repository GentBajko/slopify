/// <reference lib="esnext.temporal" />

import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { liveProject } from "../admission/repo.js";
import { defaultChannelId } from "../channels/model.js";
import { projectChannels } from "../channels/repo.js";
import type { NoticeText } from "../notifications/rules.js";
import { weekSummary } from "../run-cost/week.js";
import { validTimeZone } from "../schedules/calendar.js";
import type { FailedRun, WeeklyReport } from "./model.js";

// ceiling: the report names this many failed steps; the rest are counted.
const failedShown = 10;
// The hour on Monday, in the person's time zone, from which the week's report is sent.
const sendHour = 9;

const stageNames: Readonly<Record<string, string>> = {
  research: "Research",
  article: "Article",
  audio: "Narration",
  images: "Images",
  thumbnail: "Thumbnail",
  video: "Video",
  document: "Document",
};

const failedRow = z.object({
  project_id: z.string(),
  title: z.string(),
  kind: z.string(),
  failure_reason: z.string().nullable(),
});

// The last week in one read: what finished and what failed, what it cost and where the plans
// stand. The same stored calls Home's This week reads; nothing is estimated.
export function weeklyReport(
  db: DatabaseSync,
  since: string,
  until: string,
  channelId?: string,
): WeeklyReport {
  const summary = weekSummary(db, since, channelId);
  const channels = channelId === undefined ? undefined : projectChannels(db);
  const failed: FailedRun[] = db
    .prepare(
      `SELECT stages.project_id, projects.title, stages.kind, stages.failure_reason
       FROM stages JOIN projects ON projects.id=stages.project_id
       WHERE stages.state='failed' AND stages.finished_at>=? AND ${liveProject()}
       ORDER BY stages.finished_at DESC, stages.id`,
    )
    .all(since)
    .map((raw) => failedRow.parse(raw))
    .filter(
      (row) =>
        channels === undefined || (channels.get(row.project_id) ?? defaultChannelId) === channelId,
    )
    .map((row) => ({
      projectId: row.project_id,
      title: row.title.trim() === "" ? "Untitled project" : row.title,
      stage: stageNames[row.kind] ?? row.kind,
      reason: row.failure_reason ?? "It stopped without a reason.",
    }));
  return {
    since,
    until,
    finished: summary.videos,
    failed: failed.slice(0, failedShown),
    failedMore: Math.max(0, failed.length - failedShown),
    cost: summary.cost,
    unpriced: summary.unpriced,
    apiEquivalent: summary.apiEquivalent,
    plans: summary.plans.map((plan) => ({
      name: plan.name,
      weeklyPercent: plan.weeklyPercent,
      fiveHourPercent: plan.fiveHourPercent,
    })),
  };
}

// The ISO week a moment falls in, in the person's time zone: "2026-W42".
export function isoWeekOf(now: Date, timeZone: string): string {
  const zone = validTimeZone(timeZone) ? timeZone : "UTC";
  const date = Temporal.Instant.fromEpochMilliseconds(now.valueOf()).toZonedDateTimeISO(zone);
  return `${String(date.yearOfWeek)}-W${String(date.weekOfYear).padStart(2, "0")}`;
}

// Whether this week's report is still to be sent: from Monday 09:00 in the person's time zone,
// once a week. A Slopify that was off on Monday sends it when it next runs that week.
export function weeklyDue(
  now: Date,
  timeZone: string,
  sentFor: string | undefined,
): { readonly due: boolean; readonly week: string } {
  const zone = validTimeZone(timeZone) ? timeZone : "UTC";
  const date = Temporal.Instant.fromEpochMilliseconds(now.valueOf()).toZonedDateTimeISO(zone);
  const week = isoWeekOf(now, zone);
  const started = date.dayOfWeek > 1 || date.hour >= sendHour;
  return { due: started && sentFor !== week, week };
}

const money = (value: number) => `$${value.toFixed(2)}`;

export function weeklyNoticeText(report: WeeklyReport): NoticeText {
  const failures = report.failed.length + report.failedMore;
  const plans = report.plans
    .filter((plan) => plan.weeklyPercent !== null)
    .map((plan) => `${plan.name} ${String(Math.round(plan.weeklyPercent ?? 0))}% of its week`);
  const named = report.failed
    .slice(0, 3)
    .map((one) => `“${one.title}” (${one.stage}): ${one.reason.replace(/[.!?\s]+$/, "")}`);
  return {
    headline: `Slopify last week: ${report.finished === 1 ? "1 video" : `${String(report.finished)} videos`} made, ${failures === 1 ? "1 step" : `${String(failures)} steps`} failed`,
    detail: [
      `Cost ${money(report.cost)}${report.unpriced > 0 ? ` plus ${String(report.unpriced)} calls with no known price` : ""}.`,
      plans.length === 0 ? "" : `Plans: ${plans.join(", ")}.`,
      named.length === 0
        ? ""
        : `Failed: ${named.join("; ")}${failures > named.length ? `; and ${String(failures - named.length)} more` : ""}. Open each project and use the button beside the failed step.`,
    ]
      .filter((line) => line !== "")
      .join(" "),
  };
}
