import { listProjects } from "../admission/repo.js";
import { type PackDeps, uploadPack } from "./pack.js";
import { projectVideos, recordVideo } from "./videos.js";

// Links read from Studio's Content list (title and video id per row), matched to projects by
// title: the long video by any of its titles (the project's own and its other titles), a short
// by its own. Only an exact title match counts (case and spacing aside), and only for an upload
// whose YouTube video isn't known yet, so nothing recorded is overwritten.

export interface StudioRow {
  readonly title: string;
  readonly videoId: string;
}

const norm = (title: string): string => title.trim().replace(/\s+/g, " ").toLowerCase();

export function backfillVideos(deps: PackDeps, rows: readonly StudioRow[], at: string): number {
  const byTitle = new Map<string, string>();
  for (const row of rows) byTitle.set(norm(row.title), row.videoId);
  if (byTitle.size === 0) return 0;
  // A video already linked to an upload is never claimed by another: two projects can have a
  // short with the same title (a remake of a topic), and only one of them made that video.
  const taken = new Set(
    deps.db
      .prepare("SELECT video_id FROM youtube_videos")
      .all()
      .map((row) => String(row.video_id)),
  );
  let found = 0;
  for (const project of listProjects(deps.db)) {
    const known = projectVideos(deps.db, project.id).filter((one) => one.uploadState === "done");
    const result = uploadPack(deps, project.id);
    if (!result.ok) continue;
    for (const item of result.pack.items) {
      const short = item.short ?? null;
      if (known.some((one) => one.short === short)) continue;
      const titles = item.pickable?.titles ?? [item.title, ...item.titles];
      const videoId = titles.map((one) => byTitle.get(norm(one))).find((one) => one !== undefined);
      if (videoId === undefined || taken.has(videoId)) continue;
      recordVideo(deps.db, project.id, short, videoId, at);
      taken.add(videoId);
      found += 1;
    }
  }
  return found;
}
