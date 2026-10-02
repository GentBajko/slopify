import { listProjects } from "../admission/repo.js";
import { type PackDeps, uploadPack } from "./pack.js";
import { readPlan } from "./plan.js";
import { seriesOf } from "./plan-model.js";
import { allReleases, lineSlots, readLeadHours, releasesOf } from "./releases.js";
import { videoOf } from "./videos.js";

// Calendar → Releases: each long video due in the coming weeks with its shorts, each item
// with its release, the time it must be uploaded by and where it stands; the posting plan's
// free times; and the finished projects that could fill them.

export type ItemState =
  // Its file isn't made yet.
  | "not-ready"
  // Ready, and still in time to upload.
  | "ready"
  // Past its upload-by time and not on YouTube.
  | "late"
  // Filled in Studio but not confirmed (cancelled, or left as a draft).
  | "filled"
  // Scheduled or published on YouTube.
  | "scheduled";

export interface CalendarItem {
  readonly short: number;
  readonly title: string;
  readonly at: string | null;
  readonly uploadBy: string | null;
  readonly state: ItemState;
  readonly checks: string | null;
  readonly videoId: string | null;
}

export interface CalendarEntry {
  readonly at: string;
  readonly line: string | null;
  readonly series: string;
  // Null for a free time of the plan.
  readonly project: { readonly id: string; readonly title: string } | null;
  readonly items: readonly CalendarItem[];
}

export interface ReleaseCalendar {
  readonly leadHours: number;
  readonly timeZone: string;
  readonly from: string;
  readonly until: string;
  readonly entries: readonly CalendarEntry[];
  // Finished projects with no release yet (or set to "not scheduled"), for a free time.
  readonly candidates: readonly {
    readonly id: string;
    readonly title: string;
    readonly series: string;
  }[];
}

const hourMs = 60 * 60 * 1000;

export function releaseCalendar(
  deps: PackDeps,
  options: { readonly now: Date; readonly weeks: number; readonly candidates: readonly string[] },
): ReleaseCalendar {
  const { now } = options;
  const plan = readPlan(deps.db);
  const leadMs = readLeadHours(deps.db) * hourMs;
  const from = new Date(now.getTime() - 24 * hourMs);
  const until = new Date(now.getTime() + options.weeks * 7 * 24 * hourMs);
  const inWindow = (iso: string) => {
    const at = Date.parse(iso);
    return at >= from.getTime() && at < until.getTime();
  };
  const projects = new Map(listProjects(deps.db).map((project) => [project.id, project]));
  const longs = allReleases(deps.db).filter(
    (release) => release.short === 0 && projects.has(release.projectId) && inWindow(release.at),
  );
  const seriesOfLine = (line: string | null) =>
    plan.rows.find((row) => row.name === line)?.series ?? "";

  const entries: CalendarEntry[] = longs.map((long) => {
    const project = projects.get(long.projectId);
    const pack = uploadPack(deps, long.projectId);
    const releases = releasesOf(deps.db, long.projectId);
    const items = pack.ok ? pack.pack.items : [];
    return {
      at: long.at,
      line: long.line,
      series: project === undefined ? "" : seriesOf(project.config),
      project: { id: long.projectId, title: project?.title ?? "" },
      items: items.map((item) => {
        const short = item.short ?? 0;
        const at = releases.find((release) => release.short === short)?.at;
        const release = at === undefined || at === "" ? null : at;
        const uploadBy = release === null ? null : new Date(Date.parse(release) - leadMs);
        const video = videoOf(deps.db, long.projectId, item.short ?? null);
        const state: ItemState =
          video?.uploadState === "done"
            ? "scheduled"
            : video?.uploadState === "filled"
              ? "filled"
              : item.video === null
                ? "not-ready"
                : uploadBy !== null && now.getTime() > uploadBy.getTime()
                  ? "late"
                  : "ready";
        return {
          short,
          title: item.title,
          at: release,
          uploadBy: uploadBy?.toISOString() ?? null,
          state,
          checks: video?.checks ?? null,
          videoId: video?.videoId ?? null,
        };
      }),
    };
  });

  // The plan's long-video times no project holds (the hour is free), from now on.
  const takenHours = new Set(
    allReleases(deps.db).map((release) => Math.floor(Date.parse(release.at) / hourMs)),
  );
  for (const slot of lineSlots(plan, now, until))
    if (!takenHours.has(Math.floor(Date.parse(slot.longAt) / hourMs)))
      entries.push({
        at: slot.longAt,
        line: slot.row,
        series: seriesOfLine(slot.row),
        project: null,
        items: [],
      });

  const scheduled = new Set(
    allReleases(deps.db)
      .filter((release) => release.short === 0)
      .map((release) => release.projectId),
  );
  return {
    leadHours: readLeadHours(deps.db),
    timeZone: plan.timeZone,
    from: from.toISOString(),
    until: until.toISOString(),
    entries: entries.toSorted((left, right) => Date.parse(left.at) - Date.parse(right.at)),
    candidates: options.candidates.flatMap((id) => {
      const project = projects.get(id);
      if (project === undefined || scheduled.has(id)) return [];
      return [{ id, title: project.title, series: seriesOf(project.config) }];
    }),
  };
}
