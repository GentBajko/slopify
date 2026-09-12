import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { transact } from "../../kernel/db/tx.js";
import { narrationRegenerationKey } from "../narration/plan.js";
import { recipeInputSchema } from "../rebuild/recipe-input-schema.js";
import { planRevision } from "../rebuild/recipe-save.js";
import { transitionRevisionWork } from "../rebuild/repo.js";
import { projectStandings } from "../rebuild/runtime-store.js";
import { discardPreparedAssets } from "../storage/assets.js";
import { deleteStagedFile } from "../storage/repo.js";
import { dropStagedSource } from "../storage/staging.js";
import type {
  ProjectRevision,
  RevisionDeps,
  RevisionEdit,
  RevisionMutationResult,
} from "./model.js";
import {
  validateAssetReferences,
  validateReplacementAvailability,
  validateUploads,
} from "./mutation-assets.js";
import {
  cuesChanged,
  inspectCueAudio,
  measuredOutputs,
  validateProposedCues,
} from "./mutation-cues.js";
import { prepareEditAssets } from "./mutation-prepare.js";
import { checkMutation, insertReceipt, requestHash, requiredView } from "./mutation-request.js";
import { preserveDeferredIntent } from "./mutation-work.js";
import { cloneManifest, ensureRevisionStages, projectSelected } from "./projection.js";
import { insertAsset, insertRevision } from "./repo.js";
import { validateNarrationIntent, validateTemplateIntent } from "./rules.js";
import { revisionEditSchema } from "./schema.js";

export { bindUpload } from "./mutation-assets.js";
export { restoreRevision } from "./restore.js";

export interface SaveRevisionInput {
  readonly projectId: string;
  readonly baseRevisionId: string;
  readonly idempotencyKey: string;
  readonly edit: RevisionEdit;
}
export async function saveRevision(
  deps: RevisionDeps,
  input: SaveRevisionInput,
): Promise<RevisionMutationResult> {
  const parsed = revisionEditSchema.safeParse(input.edit);
  if (!parsed.success)
    return {
      ok: false,
      reason: "invalid-edit",
      currentRevisionId: input.baseRevisionId,
      fields: parsed.error.issues.map((row) => ({
        field: row.path.join("."),
        message: row.message,
      })),
    };
  const edit = parsed.data;
  const identity = {
    ...input,
    operation: "save" as const,
    hash: requestHash("save", input.baseRevisionId, edit),
  };
  const checked = checkMutation(deps, identity);
  if (checked !== undefined) return checked;
  const base = requiredView(deps, input.projectId, input.baseRevisionId);
  const fields = [
    ...validateUploads(deps, edit),
    ...validateTemplateIntent(base, edit),
    ...validateNarrationIntent(base, edit),
    ...validateAssetReferences(deps, input.projectId, edit.content, []),
  ];
  if (fields.length > 0)
    return { ok: false, reason: "invalid-edit", currentRevisionId: base.revision.id, fields };
  const unavailable = validateReplacementAvailability(deps, base, edit);
  if (unavailable.length > 0)
    return {
      ok: false,
      reason: "invalid-edit",
      currentRevisionId: base.revision.id,
      fields: unavailable,
    };
  const { edit: supplied, assets: prepared } = await prepareEditAssets(deps, base, edit);
  try {
    const durations = await inspectCueAudio(deps, base, supplied, prepared);
    const result = transact(deps.db, (): RevisionMutationResult => {
      const checked = checkMutation(deps, identity);
      if (checked !== undefined) return checked;
      const fresh = requiredView(deps, input.projectId, input.baseRevisionId);
      const tokens = { ...fresh.revision.content.regenerationTokens };
      for (const key of new Set((edit.regenerate ?? []).map(narrationRegenerationKey)))
        tokens[key] = deps.ids.next();
      const finalEdit = {
        ...supplied,
        content: { ...supplied.content, regenerationTokens: tokens },
      };
      const outputAssets = prepared.filter((row) => row.upload?.destination.kind !== "narration");
      const inspected = measuredOutputs(deps, fresh, durations);
      const preparedManifest = {
        outputs: [
          ...outputAssets.map((row) => ({
            slot: row.slot,
            workKey: row.workKey,
            assetId: row.asset.id,
            output: row.output,
            fingerprint: "",
            state: "ready" as const,
          })),
        ],
        pieces: [],
      };
      let plan = planRevision(fresh, finalEdit, preparedManifest, inspected);
      if (!plan.ok)
        return {
          ok: false,
          reason: "invalid-edit",
          currentRevisionId: fresh.revision.id,
          fields: plan.fields,
        };
      const fields = [
        ...validateAssetReferences(
          deps,
          input.projectId,
          plan.content,
          prepared.map((row) => row.asset),
        ),
        ...validateProposedCues(fresh, finalEdit, plan, prepared, durations),
      ];
      if (fields.length > 0)
        return { ok: false, reason: "invalid-edit", currentRevisionId: fresh.revision.id, fields };
      if (cuesChanged(fresh, finalEdit) && plan.content.subtitleCues !== undefined) {
        const timing = plan.recipes.find((row) => row.key === "subtitles:timing");
        if (timing !== undefined) {
          plan = planRevision(
            fresh,
            {
              ...finalEdit,
              content: {
                ...plan.content,
                subtitleCues: {
                  ...plan.content.subtitleCues,
                  audioFingerprint: timing.logicalFingerprint,
                },
              },
            },
            preparedManifest,
            inspected,
          );
          if (!plan.ok)
            throw new Error("Validated captions could not bind to their narration timeline.");
        }
      }
      plan = preserveDeferredIntent(deps, fresh, plan);
      const revision: ProjectRevision = {
        id: deps.ids.next(),
        projectId: input.projectId,
        parentId: fresh.revision.id,
        restoredFromId: null,
        config: plan.config,
        content: plan.content,
        fingerprints: plan.fingerprints,
        createdAt: deps.clock.now().toISOString(),
      };
      insertRevision(deps.db, revision);
      ensureRevisionStages(deps, revision);
      for (const row of prepared) insertAsset(deps.db, row.asset);
      cloneManifest(deps, revision, plan.manifest);
      if (!advanceHead(deps.db, input.projectId, input.baseRevisionId, revision))
        throw new Error("Project head changed during the revision transaction.");
      transitionRevisionWork(deps, {
        projectId: input.projectId,
        baseRevisionId: input.baseRevisionId,
        revisionId: revision.id,
        fingerprints: plan.fingerprints,
        baseFingerprints: plan.baseFingerprints,
        logicalKeys: logicalKeys(deps, input.projectId, input.baseRevisionId, plan.fingerprints),
        recipes: plan.recipes,
      });
      projectSelected(deps.db, revision);
      projectStandings(deps, revision.projectId);
      insertReceipt(deps, identity, revision.id);
      for (const row of prepared)
        if (row.upload !== undefined) deleteStagedFile(deps.db, row.upload.stagedFileId);
      return { ok: true, view: requiredView(deps, input.projectId, revision.id), duplicate: false };
    });
    if (result.ok && !result.duplicate)
      for (const row of prepared)
        if (row.stagedSource !== undefined)
          dropStagedSource({ ...deps, emit: () => undefined }, row.stagedSource);
    return result;
  } finally {
    discardPreparedAssets(
      deps,
      prepared
        .map((row) => row.asset)
        .filter(
          (asset) =>
            deps.db.prepare("SELECT 1 FROM project_assets WHERE id=?").get(asset.id) === undefined,
        ),
    );
  }
}
export function advanceHead(
  db: DatabaseSync,
  projectId: string,
  baseRevisionId: string,
  revision: ProjectRevision,
): boolean {
  const result = db
    .prepare("UPDATE project_heads SET revision_id = ? WHERE project_id = ? AND revision_id = ?")
    .run(revision.id, projectId, baseRevisionId);
  if (Number(result.changes) !== 1) return false;
  db.prepare(
    "UPDATE projects SET title = ?, format = ?, config = ?, updated_at = ? WHERE id = ?",
  ).run(
    revision.config.title,
    revision.config.format,
    JSON.stringify(revision.config),
    revision.createdAt,
    projectId,
  );
  return true;
}
export function logicalKeys(
  deps: RevisionDeps,
  projectId: string,
  revisionId: string,
  fingerprints: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  const values: Record<string, string> = {};
  const rows = deps.db
    .prepare(
      "SELECT p.work_key,p.input_json,r.logical_key FROM revision_work_reservations r JOIN revision_work_pieces p ON p.id=r.piece_id AND p.work_id=r.work_id WHERE r.project_id=? AND r.revision_id=?",
    )
    .all(projectId, revisionId);
  for (const row of rows) {
    const input = recipeInputSchema.parse(JSON.parse(z.string().parse(row.input_json)));
    if (input.kind === "tts" && fingerprints[`${input.logicalKey}:1`] !== undefined)
      values[z.string().parse(row.work_key)] = `${input.logicalKey}:1`;
    else if (typeof row.logical_key === "string")
      values[z.string().parse(row.work_key)] = row.logical_key;
    else if (input.kind === "tts") values[z.string().parse(row.work_key)] = `${input.logicalKey}:1`;
  }
  return values;
}
