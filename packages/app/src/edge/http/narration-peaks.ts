import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { type NarrationPeaks, narrationAudio } from "../../slices/narration/peaks.js";
import { assetPath } from "../../slices/revisions/mutation-assets.js";
import { currentRevisionId } from "../../slices/revisions/repo.js";
import { getRevisionView } from "../../slices/revisions/view.js";
import { outputPath } from "../../slices/storage/layout.js";
import { projectTitle } from "../../slices/storage/repo.js";
import type { AppDeps } from "./app.js";
import { onInvalid, problem, titleOf } from "./problem.js";

const projectParam = z.object({
  projectId: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[0-9A-Za-z_-]+$/),
});

// ceiling: a few projects' worth of pieces. An asset never changes, so a cached row is never
// stale; the oldest goes first.
const cachedPieces = 400;

export type DecodePeaks = (
  path: string,
  signal: AbortSignal,
) => Promise<{ readonly seconds: number; readonly peaks: readonly number[] }>;

// The live view's waveform: the peaks of every finished narration piece of the current
// version, fetched again each time a `narration.piece` event says one landed.
export function narrationPeakRoutes(
  deps: Pick<AppDeps, "db" | "paths" | "ids" | "clock" | "log" | "decodePeaks">,
) {
  const cache = new Map<string, { readonly seconds: number; readonly peaks: readonly number[] }>();
  return new Hono().get(
    "/:projectId/narration/peaks",
    zValidator("param", projectParam, onInvalid),
    async (c) => {
      const { projectId } = c.req.valid("param");
      if (projectTitle(deps.db, projectId) === undefined)
        return problem(c, {
          status: 404,
          title: titleOf(404),
          detail: "This project no longer exists. Go back to Projects to pick another.",
        });
      c.header("Cache-Control", "no-store");
      const revisionId = currentRevisionId(deps.db, projectId);
      const view =
        revisionId === undefined ? undefined : getRevisionView(deps, projectId, revisionId);
      if (revisionId === undefined || view === undefined)
        return c.json({
          revisionId: null,
          complete: false,
          pieces: [],
        } satisfies Omit<NarrationPeaks, "revisionId"> & { revisionId: null });
      const decode = deps.decodePeaks;
      if (decode === undefined)
        return problem(c, {
          status: 503,
          title: titleOf(503),
          detail:
            "Slopify can't draw the narration waveform because ffmpeg isn't available. Restart Slopify; if it keeps happening, use Download diagnostics in Settings and report it.",
        });
      const audio = narrationAudio(view);
      const pieces: NarrationPeaks["pieces"][number][] = [];
      for (const piece of audio.pieces) {
        let peaks = cache.get(piece.assetId);
        if (peaks === undefined) {
          try {
            peaks = await decode(
              outputPath(deps.paths, projectId, assetPath(deps, projectId, piece.assetId)),
              c.req.raw.signal,
            );
          } catch (error) {
            deps.log.write("warn", "narration.peaks", {
              projectId,
              stage: "audio",
              detail: error instanceof Error ? error.message : String(error),
            });
            continue;
          }
          cache.set(piece.assetId, peaks);
          while (cache.size > cachedPieces) {
            const oldest = cache.keys().next().value;
            if (oldest !== undefined) cache.delete(oldest);
          }
        }
        pieces.push({ key: piece.key, seconds: peaks.seconds, peaks: peaks.peaks });
      }
      return c.json({ revisionId, complete: audio.complete, pieces } satisfies NarrationPeaks);
    },
  );
}
