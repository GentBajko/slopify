import type { DatabaseSync } from "node:sqlite";
import { derive } from "../../kernel/runner/graph.js";
import { projectPaused, stagesOf } from "../admission/repo.js";
import { changeCheckpoints } from "../checkpoints/change.js";
import { listCheckpoints } from "../checkpoints/repo.js";
import type { PlayDraftDocument } from "../play-drafts/model.js";
import { reviewDraft } from "../play-drafts/review.js";
import { createDraft } from "../play-drafts/service.js";
import { startPlayDraft } from "../play-drafts/start.js";
import { freshTemplateDraft } from "../project-templates/setup.js";
import { currentRevisionId } from "../revisions/repo.js";
import type { ScheduleDeps } from "./model.js";
import { scheduleById } from "./repo.js";
import type { ScheduleSummary } from "./schema.js";
import { renderedTitle, scheduledValues } from "./topic-list.js";

// Preparing a scheduled video ahead (Schedules → a topic → Prepare): its project is made now,
// exactly as the schedule would make it, and runs everything but the video (research, the
// article, narration, images, the thumbnail, the PDF), held at a Before Video checkpoint. On the
// scheduled day the schedule finds it by its title and continues it (`continuePrepared`)
// instead of making another, so the day only renders.

type Topic = ScheduleSummary["items"][number];

// The draft a schedule's run starts for one topic: the template as it is now, the topic in its
// keyword, the schedule's values over the template's, and the title filled from them.
export function scheduledDocument(
  deps: ScheduleDeps,
  schedule: ScheduleSummary,
  topic: Topic | undefined,
): PlayDraftDocument | undefined {
  const template = deps.template(schedule.templateId);
  if (template === undefined) return undefined;
  const document = freshTemplateDraft(deps, template.document, {
    id: schedule.templateId,
    version: template.version,
  });
  return {
    ...document,
    form: {
      ...document.form,
      title: renderedTitle(document.form, schedule, topic),
      values: scheduledValues(document.form, schedule, topic),
    },
    variants: [],
  };
}

export type PrepareResult =
  | { readonly ok: true; readonly projectId: string; readonly title: string }
  | { readonly ok: false; readonly reason: string };

export async function prepareTopic(
  deps: ScheduleDeps,
  input: { readonly scheduleId: string; readonly title: string },
): Promise<PrepareResult> {
  const schedule = scheduleById(deps.db, input.scheduleId);
  if (schedule === undefined) return { ok: false, reason: "not-found" };
  const topic = schedule.items.find((item) => item.title === input.title);
  if (topic === undefined) return { ok: false, reason: "not-found" };
  const document = scheduledDocument(deps, schedule, topic);
  if (document === undefined) return { ok: false, reason: "missing-template" };
  const title = document.form.title;
  if (preparedProject(deps.db, schedule.id, title) !== undefined)
    return { ok: false, reason: "already-prepared" };
  const { document: held, added } = heldBeforeVideo(document);
  const draft = createDraft(deps, { id: deps.uuid(), document: held });
  if (!draft.ok) return { ok: false, reason: "conflict" };
  const review = await reviewDraft(deps, { id: draft.value.draft.id, baseVersion: 1 });
  if (!review.ok) return { ok: false, reason: review.reason };
  const high = review.value.estimates.reduce((sum, estimate) => sum + estimate.high, 0);
  if (
    schedule.spendLimitCents !== null &&
    (review.value.estimates.some((estimate) => estimate.unknown > 0) ||
      high * 100 > schedule.spendLimitCents)
  )
    return { ok: false, reason: "spend-limit" };
  const started = await startPlayDraft(deps, {
    draftId: draft.value.draft.id,
    baseVersion: 1,
    reviewId: review.value.id,
  });
  if (!started.ok) return { ok: false, reason: started.reason };
  const projectId = started.value.projectIds[0];
  if (projectId === undefined) return { ok: false, reason: "conflict" };
  deps.db
    .prepare(
      "INSERT INTO prepared_videos(project_id,schedule_id,title,added_checkpoint,prepared_at) VALUES (?,?,?,?,?)",
    )
    .run(projectId, schedule.id, title, added ? 1 : 0, deps.clock.now().toISOString());
  return { ok: true, projectId, title };
}

// The draft with a Before Video checkpoint, and whether it is the preparation's own. A project
// that makes no video has nothing to hold back: it runs to the end when prepared.
export function heldBeforeVideo(document: PlayDraftDocument): {
  readonly document: PlayDraftDocument;
  readonly added: boolean;
} {
  const had = document.form.checkpoints ?? [];
  if (document.form.sources.video !== "generate" || had.includes("video"))
    return { document, added: false };
  return {
    document: { ...document, form: { ...document.form, checkpoints: [...had, "video"] } },
    added: true,
  };
}

const ended = new Set(["done", "partial", "failed", "canceled"]);

// The project a scheduled run of this title continues: one prepared for it, or else, for a run
// with a topic, an unfinished project of the same title (made by hand, say). A finished one is
// a video already made, and a new run makes a new one. A schedule without topics gives every
// run the same title, so only a prepared project counts there.
export function preparedProject(
  db: DatabaseSync,
  scheduleId: string,
  title: string,
  byTitle = true,
): { readonly projectId: string; readonly release: boolean } | undefined {
  const live = "project_id NOT IN (SELECT project_id FROM project_trash)";
  const prepared = db
    .prepare(
      `SELECT project_id, added_checkpoint FROM prepared_videos
       WHERE schedule_id=? AND title=? AND ${live} ORDER BY prepared_at DESC LIMIT 1`,
    )
    .get(scheduleId, title);
  if (typeof prepared?.project_id === "string")
    return { projectId: prepared.project_id, release: prepared.added_checkpoint === 1 };
  if (!byTitle) return undefined;
  for (const row of db
    .prepare(
      "SELECT id FROM projects WHERE title=? AND id NOT IN (SELECT project_id FROM project_trash) ORDER BY created_at DESC",
    )
    .all(title)) {
    const id = String(row.id);
    if (!ended.has(derive(stagesOf(db, id), projectPaused(db, id))))
      return { projectId: id, release: false };
  }
  return undefined;
}

// The scheduled day for a prepared video: its own Before Video hold is taken away, so the
// video renders as soon as what it needs is done. A Before Video checkpoint the template had
// stays for the person to approve.
export function continuePrepared(
  deps: ScheduleDeps,
  prepared: { readonly projectId: string; readonly release: boolean },
): void {
  if (prepared.release) {
    const head = currentRevisionId(deps.db, prepared.projectId);
    if (head !== undefined) {
      const stages = listCheckpoints(deps.db, prepared.projectId, head)
        .map((row) => row.stage)
        .filter((stage) => stage !== "video");
      changeCheckpoints(deps, { projectId: prepared.projectId, revisionId: head, stages });
    }
  }
  // Continued once: the topic is used, and the project is now the run's.
  deps.db.prepare("DELETE FROM prepared_videos WHERE project_id=?").run(prepared.projectId);
  deps.runner.tick(prepared.projectId);
}

// Which of a schedule's topics are prepared, and their projects, for the topic list.
export function preparedTopics(
  deps: ScheduleDeps,
  scheduleId: string,
): readonly { readonly title: string; readonly topic: string; readonly projectId: string }[] {
  const schedule = scheduleById(deps.db, scheduleId);
  if (schedule === undefined) return [];
  return schedule.items.flatMap((topic) => {
    const document = scheduledDocument(deps, schedule, topic);
    if (document === undefined) return [];
    const found = preparedProject(deps.db, scheduleId, document.form.title);
    return found === undefined
      ? []
      : [{ title: document.form.title, topic: topic.title, projectId: found.projectId }];
  });
}
