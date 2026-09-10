import { rmSync, statSync } from "node:fs";
import { transact } from "../../kernel/db/tx.js";
import type { StageContext } from "../../kernel/runner/index.js";
import { setStageProgress } from "../admission/repo.js";
import { outputPath } from "../storage/layout.js";
import type { Output } from "../storage/model.js";
import { deleteOutput, insertOutput, outputsOf } from "../storage/repo.js";
import { type PreparedSubtitles, subtitleRoles } from "../subtitles/prepare.js";
import type { VideoDeps } from "./run.js";

// Commit sidecars and subtitle metadata without opening, copying or replacing the WAV.
export function writeSubtitles(
  deps: VideoDeps,
  context: StageContext,
  media: Output,
  subtitles: PreparedSubtitles | undefined,
): void {
  const projectId = context.stage.projectId;
  const previous = outputsOf(deps.db, projectId).filter((output) =>
    subtitleRoles.some((role) => role === output.role),
  );
  const { subtitleOmissions: _oldOmissions, subtitlesMode: _oldMode, ...keptMeta } = media.meta;
  const meta: Output["meta"] = {
    ...keptMeta,
    subtitlesMode: subtitles === undefined ? "off" : "files",
    ...(subtitles?.omissions?.length ? { subtitleOmissions: subtitles.omissions } : {}),
  };
  try {
    context.emit({ type: "stage.progress", projectId, stage: "video", current: 99, total: 100 });
    context.signal.throwIfAborted();
    transact(deps.db, () => {
      for (const output of previous) deleteOutput(deps.db, output.id);
      deps.db
        .prepare("UPDATE outputs SET meta = ? WHERE id = ?")
        .run(JSON.stringify(meta), media.id);
      for (const asset of subtitles?.assets ?? [])
        insertOutput(deps.db, {
          id: deps.ids.next(),
          projectId,
          stageKind: "video",
          role: asset.role,
          path: asset.path,
          originalFilename: null,
          bytes: statSync(outputPath(deps.paths, projectId, asset.path)).size,
          durationMs: null,
          meta: {},
          createdAt: deps.clock.now().toISOString(),
        });
    });
  } catch (error) {
    if (subtitles !== undefined) rmSync(subtitles.directory, { recursive: true, force: true });
    throw error;
  }
  const kept = new Set((subtitles?.assets ?? []).map((asset) => asset.path));
  for (const output of previous) {
    if (kept.has(output.path)) continue;
    try {
      rmSync(outputPath(deps.paths, projectId, output.path), { force: true });
    } catch {
      /* Boot reconciliation collects obsolete files still held by a player. */
    }
  }
  setStageProgress(deps.db, context.stage.id, 100, 100);
  context.emit({ type: "stage.progress", projectId, stage: "video", current: 100, total: 100 });
}
