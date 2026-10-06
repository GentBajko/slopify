import type { DatabaseSync } from "node:sqlite";

// The YouTube video each upload became, and its A/B test waiting to start
// (`0045-youtube-videos.sql`). `short` is null for the long video, as in the fill queue.

export type AbState = "none" | "waiting" | "started" | "failed";
export type TaskState = "none" | "waiting" | "done" | "failed";
const taskState = (value: unknown): TaskState =>
  value === "waiting" || value === "done" || value === "failed" ? value : "none";

export interface YoutubeVideo {
  readonly projectId: string;
  readonly short: number | null;
  readonly videoId: string;
  readonly recordedAt: string;
  // "filled": the extension filled its upload, which may still be cancelled; "done": Studio
  // said it was scheduled or published, or its link was pasted.
  readonly uploadState: "filled" | "done";
  readonly abState: AbState;
  // The Details page touches after a confirmed upload (a short's related video, the long
  // video's end screen and captions), and the pinned comment once it is public.
  readonly finishState: TaskState;
  readonly finishMessage: string | null;
  readonly commentState: TaskState;
  readonly commentMessage: string | null;
  // Why it failed, or what the extension said when it started.
  readonly abMessage: string | null;
  readonly abAt: string | null;
  // What Studio's Content list says about its checks (copyright, ad suitability), as the
  // extension last read it: "ok", or the words Studio shows; null until read.
  readonly checks: string | null;
}

// A YouTube video id: 11 letters, digits, `-` and `_`.
export const videoIdPattern = /^[A-Za-z0-9_-]{11}$/;

// The id inside a link as Studio and YouTube show it (youtu.be/ID, watch?v=ID, /shorts/ID,
// studio's /video/ID/edit), or the bare id.
export function videoIdOf(text: string): string | undefined {
  const trimmed = text.trim();
  if (videoIdPattern.test(trimmed)) return trimmed;
  const match =
    /(?:youtu\.be\/|[?&]v=|\/shorts\/|\/video\/|\/live\/|\/embed\/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/.exec(
      trimmed,
    );
  return match?.[1];
}

const slot = (short: number | null): number => short ?? 0;

function rowOf(row: Record<string, unknown>): YoutubeVideo {
  const short = Number(row.short);
  return {
    projectId: String(row.project_id),
    short: short === 0 ? null : short,
    videoId: String(row.video_id),
    recordedAt: String(row.recorded_at),
    uploadState: row.upload_state === "filled" ? "filled" : "done",
    abState: String(row.ab_state) as AbState,
    finishState: taskState(row.finish_state),
    finishMessage: typeof row.finish_message === "string" ? row.finish_message : null,
    commentState: taskState(row.comment_state),
    commentMessage: typeof row.comment_message === "string" ? row.comment_message : null,
    abMessage: typeof row.ab_message === "string" ? row.ab_message : null,
    abAt: typeof row.ab_at === "string" ? row.ab_at : null,
    checks: typeof row.checks === "string" ? checksWord(row.checks) : null,
  };
}

// Records (or replaces) the video an upload became: "filled" from the upload dialog, "done"
// once confirmed or pasted. A new video id starts its A/B test over; a confirmed video isn't
// taken back to "filled" by filling it again.
export function recordVideo(
  db: DatabaseSync,
  projectId: string,
  short: number | null,
  videoId: string,
  at: string,
  state: "filled" | "done" = "done",
): void {
  db.prepare(
    `INSERT INTO youtube_videos(project_id,short,video_id,recorded_at,upload_state) VALUES (?,?,?,?,?)
     ON CONFLICT(project_id,short) DO UPDATE SET
       ab_state=CASE WHEN video_id=excluded.video_id THEN ab_state ELSE 'none' END,
       ab_message=CASE WHEN video_id=excluded.video_id THEN ab_message ELSE NULL END,
       ab_at=CASE WHEN video_id=excluded.video_id THEN ab_at ELSE NULL END,
       upload_state=CASE WHEN video_id=excluded.video_id AND upload_state='done' THEN 'done'
         ELSE excluded.upload_state END,
       video_id=excluded.video_id, recorded_at=excluded.recorded_at`,
  ).run(projectId, slot(short), videoId, at, state);
}

// Studio said the upload was scheduled or published. False when no such upload was filled.
export function confirmUpload(
  db: DatabaseSync,
  projectId: string,
  short: number | null,
  videoId: string,
): boolean {
  return (
    db
      .prepare(
        "UPDATE youtube_videos SET upload_state='done' WHERE project_id=? AND short=? AND video_id=?",
      )
      .run(projectId, slot(short), videoId).changes > 0
  );
}

export function forgetVideo(db: DatabaseSync, projectId: string, short: number | null): void {
  db.prepare("DELETE FROM youtube_videos WHERE project_id=? AND short=?").run(
    projectId,
    slot(short),
  );
}

export function projectVideos(db: DatabaseSync, projectId: string): readonly YoutubeVideo[] {
  return db
    .prepare("SELECT * FROM youtube_videos WHERE project_id=? ORDER BY short")
    .all(projectId)
    .map(rowOf);
}

export function videoOf(
  db: DatabaseSync,
  projectId: string,
  short: number | null,
): YoutubeVideo | undefined {
  const row = db
    .prepare("SELECT * FROM youtube_videos WHERE project_id=? AND short=?")
    .get(projectId, slot(short));
  return row === undefined ? undefined : rowOf(row);
}

export function setTaskState(
  db: DatabaseSync,
  task: "finish" | "comment",
  projectId: string,
  short: number | null,
  state: TaskState,
  message: string | null,
): void {
  const column = task === "finish" ? "finish" : "comment";
  db.prepare(
    `UPDATE youtube_videos SET ${column}_state=?, ${column}_message=? WHERE project_id=? AND short=?`,
  ).run(state, message, projectId, slot(short));
}

export function waitingTasks(
  db: DatabaseSync,
  task: "finish" | "comment",
): readonly YoutubeVideo[] {
  const column = task === "finish" ? "finish_state" : "comment_state";
  return db
    .prepare(`SELECT * FROM youtube_videos WHERE ${column}='waiting' ORDER BY recorded_at`)
    .all()
    .map(rowOf);
}

// Every video on YouTube, for the numbers the extension reads from Studio.
// Every video recorded, on YouTube or only started (`filled`), newest first.
export function recordedVideos(db: DatabaseSync): readonly YoutubeVideo[] {
  return db.prepare("SELECT * FROM youtube_videos ORDER BY recorded_at DESC").all().map(rowOf);
}

export function doneVideos(db: DatabaseSync): readonly YoutubeVideo[] {
  return db
    .prepare("SELECT * FROM youtube_videos WHERE upload_state='done' ORDER BY recorded_at DESC")
    .all()
    .map(rowOf);
}

// The long video uploaded last before this project's, for its end screen ("the previous
// episode"), when the project names none.
export function previousLongVideo(db: DatabaseSync, projectId: string): string | undefined {
  const own = db
    .prepare("SELECT recorded_at FROM youtube_videos WHERE project_id=? AND short=0")
    .get(projectId);
  const row = db
    .prepare(
      `SELECT video_id FROM youtube_videos WHERE short=0 AND project_id<>? AND upload_state='done'
       AND (? IS NULL OR recorded_at < ?) ORDER BY recorded_at DESC LIMIT 1`,
    )
    .get(projectId, own?.recorded_at ?? null, own?.recorded_at ?? null);
  return typeof row?.video_id === "string" ? row.video_id : undefined;
}

// Studio's word on a known video's checks, read from its Content list row. Studio shows a clear
// video's Restrictions as "None", or as "—" with "No notices… reaching viewers and earning";
// both are kept as "ok", anything else as Studio's words (a claim, a limit).
export function checksWord(text: string): string {
  const plain = text.replace(/\s+/g, " ").trim();
  return /^(none|[—–-]?\s*no notices.*)$/i.test(plain) || /^[—–-]$/.test(plain) ? "ok" : plain;
}

export function setChecks(db: DatabaseSync, videoId: string, checks: string): void {
  db.prepare("UPDATE youtube_videos SET checks=? WHERE video_id=?").run(
    checksWord(checks),
    videoId,
  );
}
