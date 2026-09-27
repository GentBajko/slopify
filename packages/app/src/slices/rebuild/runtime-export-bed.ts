import { z } from "zod";
import type { StageContext } from "../../kernel/runner/index.js";
import type { RevisionView } from "../revisions/model.js";
import { outputPath } from "../storage/layout.js";
import { usesAmbientBed } from "../video/ambient-bed.js";
import { probeDurationMs } from "../video/ffmpeg.js";
import type { PlanBed } from "../video/plan.js";
import type { ExportExecutionDeps } from "./runtime-export.js";

// The long video's ambient bed as the plan takes it (`video/ambient-bed.ts`), or undefined for
// none. The user's own file is checked readable before the render, so a bad file is named as
// the ambient sound rather than as a failed render.
export async function exportBed(
  deps: ExportExecutionDeps,
  context: StageContext,
  view: RevisionView,
): Promise<PlanBed | undefined> {
  const config = view.revision.config;
  const bed = config.ambientBed;
  if (bed === undefined || !usesAmbientBed(config)) return undefined;
  const settings = {
    levelDb: bed.levelDb,
    fadeInSeconds: bed.fadeInSeconds,
    tailSeconds: bed.tailSeconds,
  };
  if (bed.source !== "upload")
    return { source: { kind: "noise", preset: bed.source }, ...settings };
  const fix =
    "Make the video again from Play with another file under Video and style → Ambient sound, or pick Rain, Fireplace or Wind there instead.";
  const assetId = view.revision.content.ambientBed;
  const row = z
    .object({ path: z.string() })
    .safeParse(
      assetId === undefined
        ? undefined
        : deps.db
            .prepare("SELECT path FROM project_assets WHERE project_id=? AND id=?")
            .get(context.work.projectId, assetId),
    );
  if (!row.success)
    throw new Error(`The ambient sound's audio file is no longer in the project. ${fix}`);
  const path = outputPath(deps.paths, context.work.projectId, row.data.path);
  let durationMs: number;
  try {
    durationMs = await probeDurationMs(deps.ffmpeg, path, context.signal, deps.log);
  } catch (error) {
    context.signal.throwIfAborted();
    throw new Error(
      `The ambient sound's audio file couldn't be read as audio (${error instanceof Error ? error.message : String(error)}). ${fix}`,
    );
  }
  if (durationMs <= 0) throw new Error(`The ambient sound's audio file holds no sound. ${fix}`);
  return { source: { kind: "file", path }, ...settings };
}
