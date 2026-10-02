import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";

// Studio's numbers for each known video, read by the extension from the video's Analytics
// (Reach and Engagement), and finished A/B tests as Studio shows them. Slopify never asks
// YouTube's API: these are what Studio showed when the extension last looked.

export interface VideoStats {
  readonly projectId: string;
  readonly short: number | null;
  readonly videoId: string;
  readonly readAt: string;
  readonly impressions: number | null;
  // Percent, as Studio shows it (2.2 for 2.2%).
  readonly ctr: number | null;
  readonly views: number | null;
  readonly averageViewSeconds: number | null;
  readonly watchHours: number | null;
}

export const abVariantSchema = z.object({
  title: z.string().max(200).nullable(),
  // Which thumbnail (1-3) the variant showed, when Studio says.
  thumbnail: z.number().int().min(1).max(3).nullable(),
  // Its share of watch time, percent.
  share: z.number().min(0).max(100).nullable(),
  winner: z.boolean(),
});
export type AbVariant = z.infer<typeof abVariantSchema>;

export interface AbResult {
  readonly projectId: string;
  readonly short: number | null;
  readonly videoId: string;
  readonly readAt: string;
  readonly variants: readonly AbVariant[];
}

const slot = (short: number | null): number => short ?? 0;
const num = (value: unknown): number | null => (typeof value === "number" ? value : null);

export function saveStats(db: DatabaseSync, stats: VideoStats): void {
  db.prepare(
    `INSERT INTO video_stats(project_id,short,video_id,read_at,impressions,ctr,views,average_view_seconds,watch_hours)
     VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(project_id,short) DO UPDATE SET video_id=excluded.video_id,
     read_at=excluded.read_at, impressions=excluded.impressions, ctr=excluded.ctr, views=excluded.views,
     average_view_seconds=excluded.average_view_seconds, watch_hours=excluded.watch_hours`,
  ).run(
    stats.projectId,
    slot(stats.short),
    stats.videoId,
    stats.readAt,
    stats.impressions,
    stats.ctr,
    stats.views,
    stats.averageViewSeconds,
    stats.watchHours,
  );
}

function statsOf(row: Record<string, unknown>): VideoStats {
  const short = Number(row.short);
  return {
    projectId: String(row.project_id),
    short: short === 0 ? null : short,
    videoId: String(row.video_id),
    readAt: String(row.read_at),
    impressions: num(row.impressions),
    ctr: num(row.ctr),
    views: num(row.views),
    averageViewSeconds: num(row.average_view_seconds),
    watchHours: num(row.watch_hours),
  };
}

export function projectStats(db: DatabaseSync, projectId: string): readonly VideoStats[] {
  return db
    .prepare("SELECT * FROM video_stats WHERE project_id=? ORDER BY short")
    .all(projectId)
    .map(statsOf);
}

// Each project's long video's numbers, for the Projects list.
export function longVideoStats(db: DatabaseSync): ReadonlyMap<string, VideoStats> {
  return new Map(
    db
      .prepare("SELECT * FROM video_stats WHERE short=0")
      .all()
      .map((row) => [String(row.project_id), statsOf(row)] as const),
  );
}

export function saveAbResult(db: DatabaseSync, result: AbResult): void {
  db.prepare(
    `INSERT INTO ab_results(project_id,short,video_id,read_at,variants) VALUES (?,?,?,?,?)
     ON CONFLICT(project_id,short) DO UPDATE SET video_id=excluded.video_id, read_at=excluded.read_at,
     variants=excluded.variants`,
  ).run(
    result.projectId,
    slot(result.short),
    result.videoId,
    result.readAt,
    JSON.stringify(result.variants),
  );
}

export function abResults(
  db: DatabaseSync,
): readonly (AbResult & { readonly projectTitle: string })[] {
  return db
    .prepare(
      `SELECT r.*, p.title AS project_title FROM ab_results r JOIN projects p ON p.id=r.project_id
       ORDER BY r.read_at DESC`,
    )
    .all()
    .flatMap((row) => {
      const parsed = z.array(abVariantSchema).safeParse(JSON.parse(String(row.variants)));
      if (!parsed.success) return [];
      const short = Number(row.short);
      return [
        {
          projectId: String(row.project_id),
          projectTitle: String(row.project_title),
          short: short === 0 ? null : short,
          videoId: String(row.video_id),
          readAt: String(row.read_at),
          variants: parsed.data,
        },
      ];
    });
}
