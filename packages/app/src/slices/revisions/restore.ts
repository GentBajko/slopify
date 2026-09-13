import { transact } from "../../kernel/db/tx.js";
import { carryCheckpointGates } from "../checkpoints/recovery.js";
import { planRevision } from "../rebuild/recipe-save.js";
import { transitionRevisionWork } from "../rebuild/repo.js";
import { projectStandings } from "../rebuild/runtime-store.js";
import type { ProjectRevision, RevisionDeps, RevisionMutationResult } from "./model.js";
import {
  checkMutation,
  insertReceipt,
  refusal,
  requestHash,
  requiredView,
} from "./mutation-request.js";
import { advanceHead, logicalKeys } from "./mutations.js";
import { cloneManifest, ensureRevisionStages, projectSelected } from "./projection.js";
import { insertRevision } from "./repo.js";
import { getRevisionView } from "./view.js";
export interface RestoreRevisionInput {
  readonly projectId: string;
  readonly baseRevisionId: string;
  readonly idempotencyKey: string;
  readonly targetRevisionId: string;
}
export async function restoreRevision(
  deps: RevisionDeps,
  input: RestoreRevisionInput,
): Promise<RevisionMutationResult> {
  const identity = {
    ...input,
    operation: "restore" as const,
    hash: requestHash("restore", input.baseRevisionId, {
      targetRevisionId: input.targetRevisionId,
    }),
  };
  return transact(deps.db, (): RevisionMutationResult => {
    const checked = checkMutation(deps, identity);
    if (checked !== undefined) return checked;
    const target = getRevisionView(deps, input.projectId, input.targetRevisionId);
    if (target === undefined) return refusal(deps, input.projectId, "no-revision");
    const base = requiredView(deps, input.projectId, input.baseRevisionId);
    const comparison = planRevision(base, {
      config: target.revision.config,
      content: target.revision.content,
    });
    const revision: ProjectRevision = {
      ...target.revision,
      id: deps.ids.next(),
      parentId: base.revision.id,
      restoredFromId: target.revision.id,
      createdAt: deps.clock.now().toISOString(),
    };
    insertRevision(deps.db, revision);
    ensureRevisionStages(deps, revision);
    cloneManifest(deps, revision, {
      outputs: target.outputs.filter((row) => row.selected),
      pieces: target.pieces.filter((row) => row.selected),
    });
    if (!advanceHead(deps.db, input.projectId, input.baseRevisionId, revision))
      throw new Error("Project head changed during the restore transaction.");
    transitionRevisionWork(deps, {
      projectId: input.projectId,
      baseRevisionId: input.baseRevisionId,
      revisionId: revision.id,
      fingerprints: revision.fingerprints,
      ...(comparison.ok ? { baseFingerprints: comparison.baseFingerprints } : {}),
      logicalKeys: logicalKeys(deps, input.projectId, input.baseRevisionId, revision.fingerprints),
    });
    carryCheckpointGates(deps, input.baseRevisionId, revision);
    projectSelected(deps.db, revision);
    projectStandings(deps, revision.projectId);
    insertReceipt(deps, identity, revision.id);
    return { ok: true, view: requiredView(deps, input.projectId, revision.id), duplicate: false };
  });
}
