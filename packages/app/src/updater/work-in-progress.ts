import type { DatabaseSync } from "node:sqlite";
import { derive } from "../kernel/runner/graph.js";
import { projectPaused, stagesOf } from "../slices/admission/repo.js";
import { sampleOwner } from "../slices/template-studio/repo.js";

// A scheduled run this close is treated as running: a restart then could land on its time,
// and a schedule that skips missed runs would skip it.
export const scheduledSoonMs = 10 * 60_000;

// What an update must wait for, named for "installs when … finishes"; undefined when nothing
// is. An update never installs while a job is going: a step running or about to run, a step
// waiting to try again, a batch with videos still to make, a narration chunk about to be
// recorded again, a schedule writing topics or due to start a run, a picture being made, and
// what `live` names (model checks, an assistant answer). A template studio's hidden sample is
// named as the studio's, never by its own title.
export function workInProgress(
  db: DatabaseSync,
  inflight: (projectId: string) => boolean,
  now: number,
  live?: () => string | undefined,
): string | undefined {
  const projects = db
    .prepare(
      "SELECT id, title FROM projects WHERE id NOT IN (SELECT project_id FROM project_trash)",
    )
    .all()
    .flatMap((row) =>
      typeof row.id === "string" && typeof row.title === "string"
        ? [{ id: row.id, title: row.title }]
        : [],
    );
  const nameOf = (project: { readonly id: string; readonly title: string }): string => {
    const owner = sampleOwner(db, project.id);
    return owner === undefined ? project.title : `the studio sample of ${owner.name}`;
  };
  for (const project of projects) {
    if (inflight(project.id)) return nameOf(project);
    if (projectPaused(db, project.id)) continue;
    // Running, or waiting to try a step again (`derive`); or between two steps, with work
    // admitted and free to start. Work held for a person (a review checkpoint) doesn't count.
    const state = derive(stagesOf(db, project.id));
    if (state === "running") return nameOf(project);
    if (
      state === "pending" &&
      db
        .prepare(
          "SELECT 1 FROM revision_work WHERE project_id=? AND state IN ('pending','running') AND dispatch_state='allowed' LIMIT 1",
        )
        .get(project.id) !== undefined
    )
      return nameOf(project);
  }
  const queued = db
    .prepare(
      `SELECT p.id, p.title FROM project_queue q JOIN projects p ON p.id=q.project_id
       WHERE q.state IN ('queued','active')
         AND q.project_id NOT IN (SELECT project_id FROM project_trash)
         AND q.project_id NOT IN (SELECT project_id FROM project_controls WHERE paused=1)
       LIMIT 1`,
    )
    .get();
  if (typeof queued?.id === "string" && typeof queued.title === "string")
    return nameOf({ id: queued.id, title: queued.title });
  const retry = db
    .prepare(
      `SELECT p.id, p.title FROM narration_retries r JOIN projects p ON p.id=r.project_id
       WHERE r.state='pending' LIMIT 1`,
    )
    .get();
  if (typeof retry?.id === "string" && typeof retry.title === "string")
    return nameOf({ id: retry.id, title: retry.title });
  const schedule = db
    .prepare(
      `SELECT name FROM schedules WHERE deleted_at IS NULL AND (
         (status='active' AND next_run_at IS NOT NULL AND next_run_at <= ?)
         OR (topics_generating_at IS NOT NULL
             AND (topics_generated_at IS NULL OR topics_generated_at < topics_generating_at)
             AND (topics_failed_at IS NULL OR topics_failed_at < topics_generating_at))
       ) LIMIT 1`,
    )
    .get(new Date(now + scheduledSoonMs).toISOString());
  if (typeof schedule?.name === "string") return schedule.name;
  // A paid picture call, or a design template's sample, still being made.
  const picture = db
    .prepare(
      `SELECT d.name AS name, r.name AS template FROM designs d
       LEFT JOIN design_templates t ON t.id=d.sample_of
       LEFT JOIN design_template_revisions r ON r.template_id=t.id AND r.version=t.head_version
       WHERE d.id IN (SELECT design_id FROM design_steps WHERE state='making')
          OR d.id IN (SELECT design_id FROM design_template_samples WHERE state='making')
       LIMIT 1`,
    )
    .get();
  if (picture !== undefined) {
    if (typeof picture.template === "string") return `the studio sample of ${picture.template}`;
    if (typeof picture.name === "string") return picture.name;
  }
  const sample = db
    .prepare(
      `SELECT r.name AS name FROM design_template_samples s
       JOIN design_templates t ON t.id=s.template_id
       JOIN design_template_revisions r ON r.template_id=t.id AND r.version=t.head_version
       WHERE s.state='making' LIMIT 1`,
    )
    .get();
  if (typeof sample?.name === "string") return `the studio sample of ${sample.name}`;
  return live?.();
}
