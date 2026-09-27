import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import type { FieldError } from "../admission/rules.js";
import type { RevisionPlanResult } from "../rebuild/recipe-save.js";
import { outputPath } from "../storage/layout.js";
import { usesVoices } from "../voices/model.js";
import { cueSpeaker } from "../voices/timing.js";
import type { ManifestOutput, RevisionDeps, RevisionEdit, RevisionView } from "./model.js";
import { assetPath, measureAudio, type PreparedEditAsset } from "./mutation-assets.js";
import { validateCues } from "./rules.js";

// Edited captions of a multi-voice run keep their speakers. A cue that comes back without one
// (the caption editor edits text and times only) takes the speaker it had before, found by the
// cue's id, and a new cue the speaker of the narration under it, from the word timing. A cue
// sent with a speaker keeps it. Runs with one voice are left as they are.
export function withCueSpeakers(
  deps: Pick<RevisionDeps, "paths">,
  base: RevisionView,
  edit: RevisionEdit,
): RevisionEdit {
  const edited = edit.content.subtitleCues;
  if (
    edited === undefined ||
    !usesVoices(edit.config) ||
    !cuesChanged(base, edit) ||
    edited.cues.every((cue) => cue.speaker !== undefined)
  )
    return edit;
  const before = new Map(
    (base.revision.content.subtitleCues?.cues ?? []).flatMap((cue) =>
      cue.speaker === undefined ? [] : [[cue.id, cue.speaker] as const],
    ),
  );
  let words: readonly { start: number; end: number; speaker?: string | undefined }[] | undefined;
  const timing = (): typeof words => {
    if (words !== undefined) return words;
    const row = base.outputs.find(
      (one) =>
        one.selected &&
        one.available &&
        one.state === "ready" &&
        one.workKey === "subtitles:timing" &&
        one.output.role === "subtitle_words",
    );
    try {
      words =
        row === undefined
          ? []
          : timedWords.parse(
              JSON.parse(
                readFileSync(
                  outputPath(deps.paths, base.revision.projectId, row.output.path),
                  "utf8",
                ),
              ),
            ).words;
    } catch {
      // Unreadable timing leaves the new cues without a speaker; they still save.
      words = [];
    }
    return words;
  };
  const cues = edited.cues.map((cue) => {
    if (cue.speaker !== undefined) return cue;
    const speaker = before.get(cue.id) ?? cueSpeaker(cue, timing() ?? []);
    return speaker === undefined ? cue : { ...cue, speaker };
  });
  return { ...edit, content: { ...edit.content, subtitleCues: { ...edited, cues } } };
}
const timedWords = z.object({
  words: z.array(
    z.object({
      start: z.number(),
      end: z.number(),
      speaker: z.string().optional(),
    }),
  ),
});

export function cuesChanged(base: RevisionView, edit: RevisionEdit): boolean {
  return (
    edit.content.subtitleCues !== undefined &&
    !isDeepStrictEqual(base.revision.content.subtitleCues, edit.content.subtitleCues)
  );
}
export async function inspectCueAudio(
  deps: RevisionDeps,
  base: RevisionView,
  edit: RevisionEdit,
  prepared: readonly PreparedEditAsset[],
): Promise<ReadonlyMap<string, number>> {
  const durations = new Map<string, number>();
  if (!cuesChanged(base, edit)) return durations;
  for (const row of [
    ...base.outputs
      .filter((row) => row.selected && row.available)
      .map((row) => ({ assetId: row.assetId, output: row.output })),
    ...prepared.map((row) => ({ assetId: row.asset.id, output: row.output })),
  ]) {
    if (!row.output.role.startsWith("audio_") || row.output.role === "audio_export") continue;
    durations.set(
      row.assetId,
      row.output.durationMs ?? (await measureAudio(deps, base.revision.projectId, row.output.path)),
    );
  }
  for (const row of base.pieces.filter(
    (row) => row.selected && row.available && row.stageKind === "audio" && row.assetId !== null,
  ))
    if (row.assetId !== null && !durations.has(row.assetId))
      durations.set(
        row.assetId,
        await measureAudio(
          deps,
          base.revision.projectId,
          assetPath(deps, base.revision.projectId, row.assetId),
        ),
      );
  for (const row of Object.values(edit.content.narrationOverrides))
    if (row.kind === "asset" && !durations.has(row.assetId))
      durations.set(
        row.assetId,
        await measureAudio(
          deps,
          base.revision.projectId,
          assetPath(deps, base.revision.projectId, row.assetId),
        ),
      );
  return durations;
}
export function validateProposedCues(
  base: RevisionView,
  edit: RevisionEdit,
  plan: Extract<RevisionPlanResult, { ok: true }>,
  prepared: readonly PreparedEditAsset[],
  durations: ReadonlyMap<string, number>,
): readonly FieldError[] {
  const cues = edit.content.subtitleCues;
  if (cues === undefined || !cuesChanged(base, edit)) return [];
  const fail = (): readonly FieldError[] => [
    {
      field: "content.subtitleCues",
      message:
        "The narration changed or is not finished, so these captions no longer line up. Reload the page and edit the captions again once narration is complete.",
    },
  ];
  const candidates = [
    ...plan.manifest.outputs
      .filter((row) => row.state === "ready")
      .map((row) => ({ key: row.workKey, assetId: row.assetId, duration: row.output.durationMs })),
    ...prepared
      .filter((row) => row.upload?.destination.kind !== "narration")
      .map((row) => ({ key: row.workKey, assetId: row.asset.id, duration: row.output.durationMs })),
  ];
  const durationFor = (key: string): number | undefined => {
    const selected = candidates.findLast((row) => row.key === key);
    if (selected !== undefined) return selected.duration ?? durations.get(selected.assetId);
    const recipe = plan.recipes.find((row) => row.key === key);
    if (recipe === undefined) return undefined;
    if (recipe.input.kind === "provided" && recipe.input.assetId !== null)
      return durations.get(recipe.input.assetId);
    // Pauses between sentences lengthen the join by what only the join measures.
    if (
      recipe.input.kind === "local" &&
      Array.isArray(recipe.input.values) &&
      recipe.input.values[2] !== undefined
    )
      return undefined;
    if (recipe.input.kind === "local" && recipe.input.operation === "concat-narration") {
      const parts = recipe.dependsOn.map(durationFor);
      return parts.some((one) => one === undefined)
        ? undefined
        : parts.reduce<number>((sum, one) => sum + (one ?? 0), 0);
    }
    // Speaker turns: each at its pace, with the gap after it (`recipe-voices.ts`).
    if (recipe.input.kind === "local" && recipe.input.operation === "concat-turns-v1") {
      const layout = Array.isArray(recipe.input.values) ? recipe.input.values[1] : undefined;
      const parts = recipe.dependsOn.map(durationFor);
      if (!Array.isArray(layout) || parts.some((one) => one === undefined)) return undefined;
      return parts.reduce<number>((sum, one, index) => {
        const [pace, gap] = Array.isArray(layout[index]) ? layout[index] : [1, 0];
        return (
          sum +
          (one ?? 0) / (typeof pace === "number" && pace > 0 ? pace : 1) +
          (typeof gap === "number" ? gap * 1000 : 0)
        );
      }, 0);
    }
    if (plan.baseFingerprints[key] !== plan.fingerprints[key]) return undefined;
    const prefix = key.replace(/:1$/, ":");
    const parts = plan.manifest.pieces.filter(
      (row) =>
        row.stageKind === "audio" &&
        row.piece.state === "done" &&
        (row.key === key || row.key.startsWith(prefix)),
    );
    if (parts.length === 0) return undefined;
    const values = parts.map((row) =>
      row.assetId === null ? undefined : durations.get(row.assetId),
    );
    return values.some((one) => one === undefined)
      ? undefined
      : values.reduce<number>((sum, one) => sum + (one ?? 0), 0);
  };
  const keys =
    plan.config.sources.audio === "provide"
      ? ["audio:provided"]
      : ["audio:intro", "audio:body:concat", "audio:outro"].filter(
          (key) => plan.fingerprints[key] !== undefined,
        );
  if (keys.length === 0) return fail();
  const parts = keys.map(durationFor);
  if (parts.some((one) => one === undefined)) return fail();
  const seconds =
    parts.reduce<number>((sum, one) => sum + (one ?? 0), 0) / 1000 +
    Math.max(0, keys.length - 1) * plan.config.silenceGapSeconds +
    // The lead-in and the tail are part of the timeline the cues are timed against.
    2 * plan.config.edgeSilenceSeconds;
  return validateCues(cues.cues, seconds);
}

export function measuredOutputs(
  deps: RevisionDeps,
  base: RevisionView,
  durations: ReadonlyMap<string, number>,
): readonly ManifestOutput[] {
  return base.outputs.flatMap((row) => {
    const durationMs = durations.get(row.assetId);
    return row.selected && row.output.durationMs === null && durationMs !== undefined
      ? [{ ...row, output: { ...row.output, id: deps.ids.next(), durationMs } }]
      : [];
  });
}
