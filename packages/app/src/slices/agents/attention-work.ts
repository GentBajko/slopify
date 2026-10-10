import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { Paths } from "../../kernel/paths.js";
import { liveProject } from "../admission/repo.js";
import { releaseCalendar } from "../studio/calendar.js";
import type { AttentionEntry } from "./attention.js";

// A row a source could not read: it is left out and logged, and the rest still list.
export type SkipRow = (source: string, value: unknown, error: unknown) => void;

export function rowsOf<T>(
  rows: readonly unknown[],
  source: string,
  skip: SkipRow,
  entries: (value: unknown) => readonly T[],
): T[] {
  return rows.flatMap((value) => {
    try {
      return entries(value);
    } catch (error) {
      skip(source, value, error);
      return [];
    }
  });
}

const stageRow = z.object({
  project_id: z.string(),
  title: z.string(),
  kind: z.string(),
  failure_reason: z.string().nullable(),
  finished_at: z.string().nullable(),
  head: z.string().nullable(),
  retrying: z.number(),
});

// A narration chunk that stopped matching its text is recorded again by Slopify itself
// (`rebuild/narration-retry.ts`): pending (also while it waits for a busy project), or started
// after the failure it answers. A short whose pick stopped fails the video stage the same way.
export function failedSteps(db: DatabaseSync, skip: SkipRow): readonly AttentionEntry[] {
  const rows = db
    .prepare(
      `SELECT s.project_id, p.title, s.kind, s.failure_reason, s.finished_at, h.revision_id AS head,
         (s.kind IN ('audio','video') AND EXISTS (SELECT 1 FROM narration_retries n WHERE n.project_id=s.project_id
           AND (n.state='pending' OR (n.state='started' AND n.updated_at>=COALESCE(s.finished_at,''))))) AS retrying
       FROM stages s
       JOIN projects p ON p.id=s.project_id
       LEFT JOIN project_heads h ON h.project_id=s.project_id
       WHERE s.state='failed' AND ${liveProject("s", "project_id")}`,
    )
    .all();
  return rowsOf(rows, "failed steps", skip, (value) => {
    const row = stageRow.parse(value);
    const retrying = row.retrying === 1;
    return [
      {
        kind: "failed-step",
        since: row.finished_at ?? "",
        projectId: row.project_id,
        title: row.title,
        stage: row.kind,
        itemKey: null,
        reason:
          row.failure_reason ??
          "The step failed without saying why. Try it again with retry_stage.",
        autoRetryInFlight: retrying,
        agentCanAct: !retrying,
        ids: {
          id: row.project_id,
          kind: row.kind,
          ...(row.head === null ? {} : { baseRevisionId: row.head }),
        },
        tools: [
          "get_project",
          "read_narration_chunks",
          "get_revision",
          "save_revision",
          "preview_rebuild",
          "start_rebuild",
          "resume_project",
          "retry_stage",
          "soften_stage",
        ],
      } satisfies AttentionEntry,
    ];
  });
}

const pausedRow = z.object({
  id: z.string(),
  title: z.string(),
  updated_at: z.string(),
  head: z.string().nullable(),
});

// No pause reason is stored: any paused run is the agent's to continue once nothing in the
// project still needs fixing, whoever paused it.
export function pausedRuns(db: DatabaseSync, skip: SkipRow): readonly AttentionEntry[] {
  const rows = db
    .prepare(
      `SELECT p.id, p.title, p.updated_at, h.revision_id AS head FROM projects p
       JOIN project_controls c ON c.project_id=p.id AND c.paused=1
       LEFT JOIN project_heads h ON h.project_id=p.id
       WHERE ${liveProject("p")}`,
    )
    .all();
  return rowsOf(rows, "paused runs", skip, (value) => {
    const row = pausedRow.parse(value);
    return [
      {
        kind: "paused-run",
        since: row.updated_at,
        projectId: row.id,
        title: row.title,
        stage: null,
        itemKey: null,
        reason:
          "Paused: nothing runs until Continue the run (resume_project). Read get_project first: continue it once nothing it shows still needs fixing.",
        autoRetryInFlight: false,
        agentCanAct: true,
        ids: { id: row.id, ...(row.head === null ? {} : { baseRevisionId: row.head }) },
        tools: ["get_project", "resume_project"],
      } satisfies AttentionEntry,
    ];
  });
}

const topicsRow = z.object({
  id: z.string(),
  name: z.string(),
  held: z.number(),
  since: z.string(),
});

export function heldTopics(db: DatabaseSync, skip: SkipRow): readonly AttentionEntry[] {
  const rows = db
    .prepare(
      `SELECT s.id, s.name, count(t.id) AS held, min(t.created_at) AS since FROM schedules s
       JOIN schedule_topics t ON t.schedule_id=s.id AND t.state='held'
       WHERE s.deleted_at IS NULL GROUP BY s.id, s.name`,
    )
    .all();
  return rowsOf(rows, "held topics", skip, (value) => {
    const row = topicsRow.parse(value);
    return [
      {
        kind: "held-topics",
        since: row.since,
        projectId: null,
        title: row.name,
        stage: null,
        itemKey: null,
        reason: `${String(row.held)} suggested ${row.held === 1 ? "topic waits" : "topics wait"} for approval.`,
        autoRetryInFlight: false,
        agentCanAct: true,
        ids: { id: row.id },
        tools: ["list_held_topics", "approve_topics", "reject_topics", "approve_all_topics"],
      } satisfies AttentionEntry,
    ];
  });
}

// Calendar → Releases' "Late · upload now": the agent reports it; uploading is the person's.
export function lateUploads(
  deps: { readonly db: DatabaseSync; readonly paths: Paths },
  now: Date,
): readonly AttentionEntry[] {
  return releaseCalendar(deps, { now, weeks: 2, candidates: [] }).entries.flatMap((entry) =>
    entry.project === null
      ? []
      : entry.items
          .filter((item) => item.state === "late")
          .map((item) => {
            const project = entry.project;
            return {
              kind: "late-upload",
              since: item.uploadBy ?? item.at ?? entry.at,
              projectId: project?.id ?? null,
              title: project?.title ?? "",
              stage: "video",
              itemKey: item.short === 0 ? "video" : `short:${String(item.short)}`,
              reason: `Late · upload now: "${item.title}" was due to be uploaded by ${item.uploadBy ?? "now"} for its release at ${item.at ?? entry.at}. Uploading is the person's: report it.`,
              autoRetryInFlight: false,
              agentCanAct: false,
              ids: { id: project?.id ?? "", short: String(item.short) },
              tools: ["get_upload_pack", "get_project_releases"],
            } satisfies AttentionEntry;
          }),
  );
}

const videoRow = z.object({
  project_id: z.string(),
  title: z.string(),
  short: z.number(),
  recorded_at: z.string(),
  finish_state: z.string(),
  finish_message: z.string().nullable(),
  comment_state: z.string(),
  comment_message: z.string().nullable(),
  ab_state: z.string(),
  ab_message: z.string().nullable(),
  ab_at: z.string().nullable(),
});

// What the Studio extension could not finish on YouTube's side: the agent reports it.
export function extensionFailures(db: DatabaseSync, skip: SkipRow): readonly AttentionEntry[] {
  const rows = db
    .prepare(
      `SELECT v.project_id, p.title, v.short, v.recorded_at, v.finish_state, v.finish_message,
         v.comment_state, v.comment_message, v.ab_state, v.ab_message, v.ab_at
       FROM youtube_videos v JOIN projects p ON p.id=v.project_id
       WHERE (v.finish_state='failed' OR v.comment_state='failed' OR v.ab_state='failed')
         AND ${liveProject("v", "project_id")}`,
    )
    .all();
  return rowsOf(rows, "extension failures", skip, (value) => {
    const row = videoRow.parse(value);
    const touches = [
      row.finish_state === "failed"
        ? {
            what: "The finishing touches in YouTube Studio (end screen, captions, related video)",
            message: row.finish_message,
            at: row.recorded_at,
          }
        : undefined,
      row.comment_state === "failed"
        ? { what: "The pinned comment", message: row.comment_message, at: row.recorded_at }
        : undefined,
      row.ab_state === "failed"
        ? { what: "The A/B test", message: row.ab_message, at: row.ab_at ?? row.recorded_at }
        : undefined,
    ].filter((touch) => touch !== undefined);
    return touches.map(
      (touch) =>
        ({
          kind: "extension-failure",
          since: touch.at,
          projectId: row.project_id,
          title: row.title,
          stage: "video",
          itemKey: row.short === 0 ? "video" : `short:${String(row.short)}`,
          reason: `${touch.what} failed: ${touch.message ?? "the extension gave no reason."} Fixing it is the extension's or the person's: report it.`,
          autoRetryInFlight: false,
          agentCanAct: false,
          ids: { id: row.project_id, short: String(row.short) },
          tools: ["get_youtube_videos"],
        }) satisfies AttentionEntry,
    );
  });
}
