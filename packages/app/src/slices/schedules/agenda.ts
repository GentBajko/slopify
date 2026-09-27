import { z } from "zod";
import { derive } from "../../kernel/runner/graph.js";
import { projectPaused, stageStandingsByProject } from "../admission/repo.js";
import { queueEntries } from "../batch/index.js";
import { nextOccurrence } from "./calendar.js";
import type { ScheduleDeps } from "./model.js";
import { scheduleRows } from "./repo.js";
import {
  type Calendar,
  type CalendarRun,
  calendarMaxDays,
  type ScheduleSummary,
} from "./schema.js";
import { renderedTitle } from "./topic-list.js";

// Enough for a run every day of the longest range, with room for a queue.
const occurrencesMax = 1000;
const dayMs = 24 * 60 * 60_000;

export type CalendarResult =
  | { readonly ok: true; readonly value: Calendar }
  | { readonly ok: false; readonly reason: "invalid-input" };

// Everything the coming weeks hold between `from` and `to`: every run a live schedule will
// make, with the topic it will use; every project running in the range or finished in it; and
// every batch item still waiting its turn.
export function calendarRange(
  deps: Pick<ScheduleDeps, "db" | "clock" | "template">,
  from: Date,
  to: Date,
): CalendarResult {
  if (
    Number.isNaN(from.valueOf()) ||
    Number.isNaN(to.valueOf()) ||
    to <= from ||
    to.valueOf() - from.valueOf() > calendarMaxDays * dayMs
  )
    return { ok: false, reason: "invalid-input" };
  const now = deps.clock.now();
  const runs = scheduleRows(deps.db)
    .flatMap((schedule) => upcomingRuns(deps, schedule, now, from, to))
    .sort((a, b) => a.at.localeCompare(b.at) || a.scheduleName.localeCompare(b.scheduleName));
  return {
    ok: true,
    value: {
      from: from.toISOString(),
      to: to.toISOString(),
      runs,
      projects: projectsIn(deps, from, to),
      queued: queued(deps),
    },
  };
}

// Run k from now uses the k-th queued topic. A schedule that does not find its own topics
// completes when its queue empties, so its runs stop there; one with no queue at all runs the
// template as saved every time.
function upcomingRuns(
  deps: Pick<ScheduleDeps, "template">,
  schedule: ScheduleSummary,
  now: Date,
  from: Date,
  to: Date,
): CalendarRun[] {
  if (schedule.deletedAt !== null) return [];
  if (schedule.status !== "active" && schedule.status !== "paused") return [];
  const paused = schedule.status === "paused";
  // A paused schedule resumes from the next occurrence after the moment Resume is pressed.
  let at: Date | null =
    schedule.nextRunAt === null
      ? null
      : paused
        ? nextOccurrence(schedule.cadence, schedule.timezone, now)
        : new Date(schedule.nextRunAt);
  const template = deps.template(schedule.templateId, schedule.templateVersion);
  const templateName = template?.name ?? null;
  const form = template?.document.form;
  const { items } = schedule;
  const generation = schedule.topicGeneration.mode;
  const held = generation === "hold" ? schedule.topics.held : 0;
  const runs: CalendarRun[] = [];
  for (let k = 0; at !== null && at < to && k < occurrencesMax; k++) {
    if (generation === "off" && items.length > 0 && k >= items.length) break;
    const queuedTopic = items[k];
    // Known for a queued topic, and for a run of the template as saved; a held or generated
    // topic has no text yet.
    const known = queuedTopic !== undefined || generation === "off";
    if (at >= from)
      runs.push({
        at: at.toISOString(),
        scheduleId: schedule.id,
        scheduleName: schedule.name,
        scheduleVersion: schedule.version,
        paused,
        templateId: schedule.templateId,
        templateVersion: schedule.templateVersion,
        templateName,
        index: queuedTopic === undefined ? null : k,
        topic: queuedTopic?.title ?? null,
        topicSource:
          queuedTopic !== undefined
            ? "queued"
            : generation === "off"
              ? "template"
              : k < items.length + held
                ? "held"
                : "generated",
        renderedTitle:
          form !== undefined && known ? renderedTitle(form, schedule, queuedTopic) : null,
      });
    if (schedule.cadence.kind === "once") break;
    at = nextOccurrence(schedule.cadence, schedule.timezone, new Date(at.valueOf() + 1000));
  }
  return runs;
}

const projectRow = z.object({
  id: z.string(),
  title: z.string(),
  created_at: z.string(),
  finished_at: z.string().nullable(),
});

// Running (or waiting) projects made before `to`, and finished ones whose last stage ended in
// the range.
function projectsIn(deps: Pick<ScheduleDeps, "db">, from: Date, to: Date): Calendar["projects"] {
  const standings = stageStandingsByProject(deps.db);
  const fromSchedule = new Map<string, string>();
  for (const row of deps.db
    .prepare(
      `SELECT DISTINCT admitted.value AS project_id, schedule_runs.schedule_id
       FROM schedule_runs, json_each(schedule_runs.project_ids_json) AS admitted`,
    )
    .all()) {
    const parsed = z.object({ project_id: z.string(), schedule_id: z.string() }).parse(row);
    fromSchedule.set(parsed.project_id, parsed.schedule_id);
  }
  return deps.db
    .prepare(
      `SELECT projects.id,projects.title,projects.created_at,max(stages.finished_at) AS finished_at
       FROM projects LEFT JOIN stages ON stages.project_id=projects.id
       WHERE projects.created_at<? GROUP BY projects.id ORDER BY projects.created_at,projects.id`,
    )
    .all(to.toISOString())
    .flatMap((row) => {
      const project = projectRow.parse(row);
      const state = derive(standings.get(project.id) ?? [], projectPaused(deps.db, project.id));
      const terminal =
        state === "done" || state === "partial" || state === "failed" || state === "canceled";
      if (terminal) {
        const ended = project.finished_at ?? project.created_at;
        if (ended < from.toISOString() || ended >= to.toISOString()) return [];
      }
      return [
        {
          id: project.id,
          title: project.title,
          state,
          createdAt: project.created_at,
          finishedAt: terminal ? (project.finished_at ?? project.created_at) : null,
          scheduleId: fromSchedule.get(project.id) ?? null,
        },
      ];
    });
}

function queued(deps: Pick<ScheduleDeps, "db">): Calendar["queued"] {
  return queueEntries(deps.db).flatMap((entry) => {
    if (entry.state === "finished") return [];
    const row = deps.db
      .prepare(
        `SELECT projects.title, batches.created_at FROM projects, batches
         WHERE projects.id=? AND batches.id=?`,
      )
      .get(entry.projectId, entry.batchId);
    if (row === undefined) return [];
    const parsed = z.object({ title: z.string(), created_at: z.string() }).parse(row);
    return [
      {
        projectId: entry.projectId,
        title: parsed.title,
        batchId: entry.batchId,
        position: entry.position,
        state: entry.state,
        queuedAt: parsed.created_at,
      },
    ];
  });
}
