import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { ProjectState } from "../../kernel/pipeline.js";
import { derive } from "../../kernel/runner/graph.js";
import { liveProject, projectPaused, stageStandingsByProject } from "../admission/repo.js";
import { queueEntries } from "../batch/index.js";
import { sampleIds } from "../onboarding/model.js";
import { readSampleRecord } from "../onboarding/state.js";
import { limitWaitsByProject, listingWait } from "../run-cost/panel.js";
import { uploadedProjects } from "../uploads/repo.js";
import { nextOccurrence } from "./calendar.js";
import type { ScheduleDeps } from "./model.js";
import { scheduleRows } from "./repo.js";
import {
  type Calendar,
  type CalendarNeed,
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
  const template = deps.template(schedule.templateId);
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
  config: z.string(),
  created_at: z.string(),
  finished_at: z.string().nullable(),
});

// Projects the person has something to decide on in the current revision: a review
// checkpoint holding the run, or an automatic review that failed an item and waits for
// Overrule or Redo (its latest verdict, with no redo under way).
function awaitingReview(db: DatabaseSync): ReadonlySet<string> {
  const ids = db
    .prepare(
      `SELECT c.project_id AS id FROM review_checkpoints c
       JOIN project_heads h ON h.project_id=c.project_id AND h.revision_id=c.revision_id
       WHERE c.state IN ('held','pending-review') AND c.approved_at IS NULL
       UNION
       SELECT v.project_id AS id FROM review_verdicts v
       JOIN project_heads h ON h.project_id=v.project_id AND h.revision_id=v.revision_id
       WHERE v.passed=0 AND v.action IS NULL AND (v.redo_state IS NULL OR v.redo_state='failed')
       AND NOT EXISTS (SELECT 1 FROM review_verdicts n WHERE n.project_id=v.project_id
         AND n.item_key=v.item_key AND (n.created_at>v.created_at OR (n.created_at=v.created_at AND n.rowid>v.rowid)))`,
    )
    .all();
  return new Set(ids.map((row) => z.string().parse(row.id)));
}

// Whether a finished project's settings make a video: projects stored before sources were
// recorded made one.
const videoSource = z.object({ sources: z.object({ video: z.string() }).partial() }).partial();
function makesVideo(config: string): boolean {
  try {
    const parsed = videoSource.safeParse(JSON.parse(config));
    return !parsed.success || parsed.data.sources?.video !== "off";
  } catch {
    return true;
  }
}

function sampleProjectIds(db: DatabaseSync): ReadonlySet<string> {
  return new Set(
    sampleIds.flatMap((id) => {
      const record = readSampleRecord(db, id);
      return record?.projectId === undefined ? [] : [record.projectId];
    }),
  );
}

// What a project on the calendar asks of the person, if anything. The same readings Home's
// Needs you uses: a failed or paused run, or one waiting for a review.
function needsOf(state: ProjectState, reviewing: boolean): CalendarNeed | undefined {
  if (state === "failed") return "failed";
  if (state === "paused") return "paused";
  if (reviewing && state !== "canceled") return "review";
  return undefined;
}

// Running (or waiting) projects made before `to`, and finished ones whose last stage ended in
// the range, with what each needs from the person and whether its video is ready to upload.
function projectsIn(deps: Pick<ScheduleDeps, "db">, from: Date, to: Date): Calendar["projects"] {
  const standings = stageStandingsByProject(deps.db);
  const reviewing = awaitingReview(deps.db);
  const uploads = uploadedProjects(deps.db);
  const samples = sampleProjectIds(deps.db);
  const waits = limitWaitsByProject(deps.db);
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
      `SELECT projects.id,projects.title,projects.config,projects.created_at,max(stages.finished_at) AS finished_at
       FROM projects LEFT JOIN stages ON stages.project_id=projects.id
       WHERE projects.created_at<? AND ${liveProject()} GROUP BY projects.id ORDER BY projects.created_at,projects.id`,
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
      const needs = needsOf(state, reviewing.has(project.id));
      const ready =
        (state === "done" || state === "partial") &&
        makesVideo(project.config) &&
        !uploads.has(project.id) &&
        !samples.has(project.id);
      const waiting = waits.get(project.id);
      return [
        {
          id: project.id,
          title: project.title,
          state,
          createdAt: project.created_at,
          finishedAt: terminal ? (project.finished_at ?? project.created_at) : null,
          scheduleId: fromSchedule.get(project.id) ?? null,
          ...(needs === undefined ? {} : { needs }),
          ...(ready ? { readyToUpload: true } : {}),
          ...(waiting === undefined ? {} : { limitWaits: waiting.map(listingWait) }),
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
         WHERE projects.id=? AND batches.id=? AND ${liveProject()}`,
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
