import type { DatabaseSync } from "node:sqlite";
import type { StageActivity } from "../admission/model.js";
import { currentRevisionId } from "../revisions/repo.js";

// What a running Video stage is doing, in the words a person uses. The stage counts its steps,
// but most of them (each short's pictures and renders) only exist once the shorts are picked,
// so "9 of 11" became "10 of 50" and the meter went backwards. Named, each step counts only
// its own things: "drawing the shorts' pictures (12 of 38)", "rendering the video (45%)".

interface Row {
  readonly key: string;
  readonly state: string;
  readonly current: number | null;
  readonly total: number | null;
}

function percentOf(row: Row | undefined): number | undefined {
  if (row?.current === null || row?.total === null || row === undefined || !row.total)
    return undefined;
  return Math.max(0, Math.min(99, Math.floor((row.current / row.total) * 100)));
}

// The steps of a kind, done of all, while one of them runs.
function counted(rows: readonly Row[], match: RegExp): { done: number; total: number } | undefined {
  const own = rows.filter((row) => match.test(row.key));
  if (!own.some((row) => row.state === "running")) return undefined;
  return { done: own.filter((row) => row.state === "done").length, total: own.length };
}

export function videoActivity(db: DatabaseSync, projectId: string): StageActivity | undefined {
  const head = currentRevisionId(db, projectId);
  if (head === undefined) return undefined;
  const rows: Row[] = db
    .prepare(
      `SELECT r.work_key AS key, w.state AS state, w.progress_current AS current, w.progress_total AS total
       FROM revision_work_reservations r JOIN revision_work w ON w.id = r.work_id
       WHERE r.revision_id = ? AND w.project_id = ? AND w.kind = 'video'`,
    )
    .all(head, projectId)
    .map((row) => ({
      key: String(row.key),
      state: String(row.state),
      current: typeof row.current === "number" ? row.current : null,
      total: typeof row.total === "number" ? row.total : null,
    }));
  const running = (key: string) => rows.find((row) => row.key === key && row.state === "running");
  const percent = (label: string, row: Row | undefined): StageActivity => {
    const value = percentOf(row);
    return value === undefined ? { label } : { label, percent: value };
  };
  if (running("export:video")) return percent("rendering the video", running("export:video"));
  if (running("export:wav")) return percent("exporting the audio", running("export:wav"));
  if (running("voices:files")) return { label: "making the MP3 and M4B" };
  const renders = counted(rows, /^shorts:\d+:render$/);
  if (renders !== undefined) return { label: "rendering the shorts", ...renders };
  const pictures = counted(rows, /^shorts:\d+:image:\d+$/);
  if (pictures !== undefined) return { label: "drawing the shorts' pictures", ...pictures };
  const prompts = counted(rows, /^shorts:\d+:prompts$/);
  if (prompts !== undefined) return { label: "planning the shorts' pictures", ...prompts };
  if (running("shorts:pick")) return { label: "picking the shorts" };
  if (running("youtube:description")) return { label: "writing the YouTube description" };
  if (running("subtitles:timing"))
    return percent("timing the captions", running("subtitles:timing"));
  if (running("subtitles:cues") || running("subtitles:files"))
    return { label: "writing the captions" };
  return undefined;
}
