import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";

// Finished A/B tests as Studio shows them, read by the extension from the video's Analytics.
// Slopify never asks YouTube's API: these are what Studio showed when the extension last looked.

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
