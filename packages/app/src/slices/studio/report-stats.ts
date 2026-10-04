import type { DatabaseSync } from "node:sqlite";
import type { ReportRow, StudioReport } from "./report.js";
import { saveStats } from "./stats.js";
import { doneVideos } from "./videos.js";

// Studio's export holds every video's numbers: each one Slopify uploaded gets them as its
// project's numbers (the project page and Channels → YouTube), so the extension needn't open
// each video's Analytics. A column the export doesn't have is left empty.

const find = (report: StudioReport, test: RegExp, not?: RegExp): number =>
  report.columns.findIndex((column) => test.test(column.label) && !not?.test(column.label));

export function statsFromReport(db: DatabaseSync, report: StudioReport, readAt: string): number {
  const at = {
    impressions: find(report, /impressions/i, /rate|ctr/i),
    ctr: find(report, /click-through rate|ctr/i),
    views: find(report, /^views$/i),
    averageViewSeconds: find(report, /^average view duration$/i),
    watchHours: find(report, /^watch time \(hours\)$/i),
  };
  const value = (row: ReportRow, index: number): number | null => {
    const one = index < 0 ? null : row.values[index];
    return typeof one === "number" ? one : null;
  };
  const rows = new Map(report.rows.map((row) => [row.videoId, row]));
  let saved = 0;
  for (const video of doneVideos(db)) {
    const row = rows.get(video.videoId);
    if (row === undefined) continue;
    saveStats(db, {
      projectId: video.projectId,
      short: video.short,
      videoId: video.videoId,
      readAt,
      impressions: value(row, at.impressions),
      ctr: value(row, at.ctr),
      views: value(row, at.views),
      averageViewSeconds: value(row, at.averageViewSeconds),
      watchHours: value(row, at.watchHours),
    });
    saved += 1;
  }
  return saved;
}
