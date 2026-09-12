import { isDeepStrictEqual } from "node:util";
import type { FieldError } from "../admission/rules.js";
import type { RevisionPlanResult } from "../rebuild/recipe-save.js";
import type { ManifestOutput, RevisionDeps, RevisionEdit, RevisionView } from "./model.js";
import { assetPath, measureAudio, type PreparedEditAsset } from "./mutation-assets.js";
import { validateCues } from "./rules.js";

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
      message: "Save captions against the current, complete narration timeline.",
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
    if (recipe.input.kind === "local" && recipe.input.operation === "concat-narration") {
      const parts = recipe.dependsOn.map(durationFor);
      return parts.some((one) => one === undefined)
        ? undefined
        : parts.reduce<number>((sum, one) => sum + (one ?? 0), 0);
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
    Math.max(0, keys.length - 1) * plan.config.silenceGapSeconds;
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
