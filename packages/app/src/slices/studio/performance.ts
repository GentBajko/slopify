import { listProjects } from "../admission/repo.js";
import { defaultChannelId } from "../channels/model.js";
import { projectChannels } from "../channels/repo.js";
import { type PackDeps, uploadPack } from "./pack.js";
import { releasesOf } from "./releases.js";
import { projectStats, type VideoStats } from "./stats.js";
import { projectVideos } from "./videos.js";

// Channels → YouTube: every project of a channel that is on YouTube, its long video and each
// short with Studio's numbers as the extension last read them, and the channel's totals for
// long videos and shorts apart. Nothing here asks YouTube: it is what Studio showed.

export interface PerformanceRow {
  readonly short: number | null;
  readonly title: string;
  readonly videoId: string | null;
  // When it went (or goes) out, from its release time; null for an upload made outside the
  // release calendar (Slopify doesn't know when that one was published).
  readonly releasedAt: string | null;
  readonly stats: VideoStats | null;
}

export interface PerformanceProject {
  readonly projectId: string;
  readonly title: string;
  readonly long: PerformanceRow | null;
  readonly shorts: readonly PerformanceRow[];
}

export interface PerformanceTotals {
  readonly videos: number;
  readonly views: number;
  // Null when Studio showed none of them (most shorts).
  readonly impressions: number | null;
  // Click-through rate over all impressions (each video's CTR weighted by its impressions).
  readonly ctr: number | null;
  // Average view duration weighted by views, seconds.
  readonly averageViewSeconds: number | null;
  readonly watchHours: number;
}

export interface ChannelPerformance {
  readonly projects: readonly PerformanceProject[];
  readonly long: PerformanceTotals;
  readonly shorts: PerformanceTotals;
  // The newest read among the channel's videos.
  readonly readAt: string | null;
}

function totals(rows: readonly PerformanceRow[]): PerformanceTotals {
  const read = rows.flatMap((row) => (row.stats === null ? [] : [row.stats]));
  const sum = (pick: (stats: VideoStats) => number | null) =>
    read.reduce((total, stats) => total + (pick(stats) ?? 0), 0);
  const impressions = sum((stats) => stats.impressions);
  const clicks = read.reduce(
    (total, stats) =>
      total +
      (stats.impressions !== null && stats.ctr !== null
        ? (stats.impressions * stats.ctr) / 100
        : 0),
    0,
  );
  const viewed = read.filter((stats) => stats.views !== null && stats.averageViewSeconds !== null);
  const viewWeight = viewed.reduce((total, stats) => total + (stats.views ?? 0), 0);
  return {
    videos: rows.length,
    views: sum((stats) => stats.views),
    impressions: read.some((stats) => stats.impressions !== null) ? impressions : null,
    ctr: impressions > 0 ? Math.round((clicks / impressions) * 1000) / 10 : null,
    averageViewSeconds:
      viewWeight > 0
        ? Math.round(
            viewed.reduce(
              (total, stats) => total + (stats.views ?? 0) * (stats.averageViewSeconds ?? 0),
              0,
            ) / viewWeight,
          )
        : null,
    watchHours: Math.round(sum((stats) => stats.watchHours) * 10) / 10,
  };
}

export function channelPerformance(deps: PackDeps, channelId: string): ChannelPerformance {
  const channels = projectChannels(deps.db);
  const projects: PerformanceProject[] = [];
  for (const project of listProjects(deps.db)) {
    if ((channels.get(project.id) ?? defaultChannelId) !== channelId) continue;
    const videos = projectVideos(deps.db, project.id).filter((one) => one.uploadState === "done");
    const stats = projectStats(deps.db, project.id);
    if (videos.length === 0 && stats.length === 0) continue;
    const releases = releasesOf(deps.db, project.id);
    const pack = uploadPack(deps, project.id);
    const items = pack.ok ? pack.pack.items : [];
    const row = (short: number | null): PerformanceRow | null => {
      const video = videos.find((one) => one.short === short);
      const numbers = stats.find((one) => one.short === short) ?? null;
      if (video === undefined && numbers === null) return null;
      const release = releases.find((one) => one.short === (short ?? 0))?.at;
      const item = items.find((one) => (one.short ?? null) === short);
      return {
        short,
        title: item?.title ?? (short === null ? project.title : `Short ${String(short)}`),
        videoId: video?.videoId ?? numbers?.videoId ?? null,
        releasedAt: release !== undefined && release !== "" ? release : null,
        stats: numbers,
      };
    };
    const shortNumbers = [
      ...new Set([
        ...videos.flatMap((one) => (one.short === null ? [] : [one.short])),
        ...stats.flatMap((one) => (one.short === null ? [] : [one.short])),
      ]),
    ].toSorted((left, right) => left - right);
    projects.push({
      projectId: project.id,
      title: project.title,
      long: row(null),
      shorts: shortNumbers.flatMap((short) => {
        const one = row(short);
        return one === null ? [] : [one];
      }),
    });
  }
  const longs = projects.flatMap((one) => (one.long === null ? [] : [one.long]));
  const shorts = projects.flatMap((one) => one.shorts);
  const reads = [...longs, ...shorts].flatMap((one) =>
    one.stats === null ? [] : [one.stats.readAt],
  );
  return {
    projects: projects.toSorted(
      (left, right) =>
        Date.parse(right.long?.releasedAt ?? right.shorts[0]?.releasedAt ?? "") -
          Date.parse(left.long?.releasedAt ?? left.shorts[0]?.releasedAt ?? "") || 0,
    ),
    long: totals(longs),
    shorts: totals(shorts),
    readAt: reads.toSorted().at(-1) ?? null,
  };
}
