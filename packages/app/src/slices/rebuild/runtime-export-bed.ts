import { errorText } from "../../kernel/errors.js";
import { editSettings } from "../../kernel/ports/settings-places.js";
import type { StageContext } from "../../kernel/runner/index.js";
import type { RevisionView } from "../revisions/model.js";
import { assetPathOrUndefined } from "../revisions/mutation-assets.js";
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
  const fix = `Choose another file under Ambient sound in ${editSettings.sound}, or pick Rain, Fireplace or Wind there instead.`;
  const assetId = view.revision.content.ambientBed;
  const saved =
    assetId === undefined ? undefined : assetPathOrUndefined(deps, context.work.projectId, assetId);
  if (saved === undefined)
    throw new Error(`The ambient sound's audio file is no longer in the project. ${fix}`);
  const path = outputPath(deps.paths, context.work.projectId, saved);
  let durationMs: number;
  try {
    durationMs = await probeDurationMs(deps.ffmpeg, path, context.signal, deps.log);
  } catch (error) {
    context.signal.throwIfAborted();
    throw new Error(
      `The ambient sound's audio file couldn't be read as audio (${errorText(error)}). ${fix}`,
    );
  }
  if (durationMs <= 0) throw new Error(`The ambient sound's audio file holds no sound. ${fix}`);
  return { source: { kind: "file", path }, ...settings };
}
