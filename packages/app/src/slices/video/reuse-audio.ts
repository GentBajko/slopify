import { readFileSync, statSync } from "node:fs";
import { z } from "zod";
import type { Paths } from "../../kernel/paths.js";
import { outputPath } from "../storage/layout.js";
import type { Output } from "../storage/model.js";

const planSchema = z.object({
  sampleRate: z.number(),
  channels: z.number(),
  codec: z.string(),
  gapSeconds: z.number(),
  totalSeconds: z.number(),
  audio: z.array(z.object({ kind: z.string(), path: z.string().nullable(), seconds: z.number() })),
  output: z.string(),
  sourceIds: z.array(z.string()).optional(),
});
export type AudioExportRecord = z.infer<typeof planSchema>;

// Old releases did not record source IDs. Their relative timeline plus source dates and
// file metadata let subtitle-only edits reuse those exports without a one-time re-encode.
export function reusableAudioExport(
  paths: Paths,
  projectId: string,
  outputs: readonly Output[],
  plan: AudioExportRecord,
): Output | undefined {
  const media = outputs.find((output) => output.role === "audio_export");
  const record = outputs.find((output) => output.role === "render_params");
  if (media === undefined || record === undefined) return undefined;
  let saved: z.infer<typeof planSchema>;
  try {
    saved = planSchema.parse(
      JSON.parse(readFileSync(outputPath(paths, projectId, record.path), "utf8")),
    );
    const { sourceIds: previousIds, ...previousPlan } = saved;
    const { sourceIds, ...currentPlan } = plan;
    if (
      JSON.stringify(previousPlan) !== JSON.stringify(currentPlan) ||
      (previousIds !== undefined && JSON.stringify(previousIds) !== JSON.stringify(sourceIds))
    )
      return undefined;
    const wav = statSync(outputPath(paths, projectId, media.path));
    if (
      !wav.isFile() ||
      wav.size !== media.bytes ||
      media.durationMs !== Math.round(plan.totalSeconds * 1000)
    )
      return undefined;
    for (const segment of plan.audio) {
      if (segment.path === null) continue;
      const source = outputs.find(
        (output) =>
          ["audio_body", "audio_intro", "audio_outro"].includes(output.role) &&
          output.path === segment.path,
      );
      if (
        source === undefined ||
        !Number.isFinite(Date.parse(source.createdAt)) ||
        Date.parse(source.createdAt) > Date.parse(media.createdAt)
      )
        return undefined;
      const file = statSync(outputPath(paths, projectId, source.path));
      if (!file.isFile() || file.size !== source.bytes || file.mtimeMs > wav.mtimeMs)
        return undefined;
    }
    return media;
  } catch {
    // Missing/corrupt old records or files require a normal export.
    return undefined;
  }
}
