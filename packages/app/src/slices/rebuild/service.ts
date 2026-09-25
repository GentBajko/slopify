import type { CatalogueStore } from "../../catalog/store.js";
import type { ProjectEvent } from "../../kernel/events.js";
import type { Runner } from "../../kernel/runner/index.js";
import { withProjectControl } from "../control/lock.js";
import type { ProviderValidation } from "../control/providers.js";
import type { RevisionDeps } from "../revisions/model.js";
import { requestHash } from "../revisions/mutation-request.js";
import { currentRevisionId } from "../revisions/repo.js";
import { getRevisionView } from "../revisions/view.js";
import type { ProviderStatus } from "../settings/model.js";
import {
  previewRebuildSchema,
  type RebuildAdmission,
  type RebuildPreview,
  type RebuildResult,
  type RebuildSelection,
  startRebuildSchema,
} from "./model.js";
import { executionSnapshotSchema, planPreview, reviewStillCovers } from "./preview-plan.js";
import { admissionReceipt, admitPreview, previewById, storePreview } from "./repo.js";
import { checkReadiness, localReadiness } from "./service-readiness.js";

export interface RebuildDeps extends RevisionDeps {
  readonly runner: Runner;
  readonly catalogue: CatalogueStore;
  readonly providers: () => Promise<readonly ProviderStatus[]>;
  readonly modelsFor: NonNullable<ProviderValidation["modelsFor"]>;
  readonly emit: (projectId: string, event: ProjectEvent) => void;
}
export function rebuildConfirmations(
  required: readonly string[],
  confirmed: readonly string[],
  unknownCosts: number,
  acknowledged: boolean,
): "review-required" | "cost-ack-required" | undefined {
  const given = new Set(confirmed);
  if (
    given.size !== confirmed.length ||
    required.length !== given.size ||
    required.some((key) => !given.has(key))
  )
    return "review-required";
  if (unknownCosts > 0 && !acknowledged) return "cost-ack-required";
  return undefined;
}
export async function previewRebuild(
  deps: RebuildDeps,
  input: {
    readonly projectId: string;
    readonly baseRevisionId: string;
    readonly request: RebuildSelection;
  },
): Promise<RebuildResult<RebuildPreview>> {
  const parsed = previewRebuildSchema.safeParse({
    baseRevisionId: input.baseRevisionId,
    request: input.request,
  });
  if (!parsed.success)
    return {
      ok: false,
      reason: "invalid-selection",
      fields: parsed.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    };
  const view = getRevisionView(deps, input.projectId, input.baseRevisionId);
  if (view === undefined)
    return {
      ok: false,
      reason: currentRevisionId(deps.db, input.projectId) === undefined ? "no-project" : "conflict",
    };
  if (!view.current) return { ok: false, reason: "conflict" };
  const plan = planPreview(deps, view, deps.catalogue.read(), input.request, deps.ids.next());
  if (!plan.ok) return plan;
  storePreview(deps, plan.value.preview, plan.value.execution);
  return { ok: true, value: plan.value.preview };
}
export async function startRebuild(
  deps: RebuildDeps,
  input: {
    readonly projectId: string;
    readonly baseRevisionId: string;
    readonly idempotencyKey: string;
    readonly previewId: string;
    readonly acknowledgeUnknownCosts: boolean;
    readonly confirmedProvidedWorkKeys: readonly string[];
  },
): Promise<RebuildResult<RebuildAdmission>> {
  const { projectId, ...body } = input;
  const parsed = startRebuildSchema.safeParse(body);
  if (!parsed.success)
    return {
      ok: false,
      reason: "invalid-selection",
      fields: parsed.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    };
  const hash = requestHash("rebuild", input.baseRevisionId, parsed.data);
  const replay = admissionReceipt(deps.db, projectId, input.idempotencyKey, hash);
  if (replay !== undefined) {
    if (replay.ok) wake(deps, projectId, replay.value);
    return replay;
  }
  const preview = previewById(deps.db, projectId, input.previewId);
  const view = getRevisionView(deps, projectId, input.baseRevisionId);
  if (view === undefined)
    return {
      ok: false,
      reason: currentRevisionId(deps.db, projectId) === undefined ? "no-project" : "conflict",
    };
  if (!view.current) return { ok: false, reason: "conflict" };
  if (preview === undefined || preview.baseRevisionId !== input.baseRevisionId)
    return { ok: false, reason: "stale-preview" };
  const confirmation = rebuildConfirmations(
    preview.providedReuseRequired,
    input.confirmedProvidedWorkKeys,
    preview.costs.unknown,
    input.acknowledgeUnknownCosts,
  );
  if (confirmation !== undefined) return { ok: false, reason: confirmation };
  const row = deps.db
    .prepare("SELECT execution_json FROM rebuild_previews WHERE id=? AND project_id=?")
    .get(preview.id, projectId);
  if (typeof row?.execution_json !== "string") return { ok: false, reason: "stale-preview" };
  const snapshot = executionSnapshotSchema.parse(JSON.parse(row.execution_json));
  let ready: Awaited<ReturnType<typeof checkReadiness>>;
  try {
    ready = await checkReadiness(deps, snapshot, view);
  } catch {
    deps.log.write("warn", "project.rebuild", {
      projectId,
      detail: "Provider readiness could not be loaded.",
    });
    return { ok: false, reason: "readiness" };
  }
  if (ready.fields.length > 0) return { ok: false, reason: "readiness", fields: ready.fields };
  return withProjectControl(deps.db, projectId, () => {
    const again = admissionReceipt(deps.db, projectId, input.idempotencyKey, hash);
    if (again !== undefined) {
      if (again.ok) wake(deps, projectId, again.value);
      return again;
    }
    if (currentRevisionId(deps.db, projectId) !== input.baseRevisionId)
      return { ok: false, reason: "conflict" };
    const current = getRevisionView(deps, projectId, input.baseRevisionId);
    if (current === undefined) return { ok: false, reason: "no-project" };
    const catalogue = deps.catalogue.read();
    const fresh = planPreview(deps, current, catalogue, preview.selection, preview.id);
    if (!fresh.ok || !reviewStillCovers(preview, snapshot, fresh.value))
      return { ok: false, reason: "stale-preview" };
    const fields = localReadiness(deps, snapshot, current, ready.providers, catalogue);
    if (fields.length > 0) return { ok: false, reason: "readiness", fields };
    const admitted = admitPreview(deps, {
      preview,
      planningCatalogue: catalogue,
      idempotencyKey: input.idempotencyKey,
      requestHash: hash,
    });
    if (admitted.ok) {
      deps.emit(projectId, { type: "project.updated", projectId });
      wake(deps, projectId, admitted.value);
    }
    return admitted;
  });
}
function wake(deps: RebuildDeps, projectId: string, admission: RebuildAdmission): void {
  const owned =
    deps.db
      .prepare(
        "SELECT 1 FROM revision_work WHERE project_id=? AND admission_id=? AND state!='done' AND dispatch_state='allowed' LIMIT 1",
      )
      .get(projectId, admission.admissionId) !== undefined;
  const unfinished =
    owned ||
    admission.workIds.some(
      (id) =>
        deps.db
          .prepare(
            "SELECT 1 FROM revision_work WHERE id=? AND project_id=? AND state!='done' AND dispatch_state='allowed'",
          )
          .get(id, projectId) !== undefined,
    );
  if (!unfinished && admission.replayed) return;
  try {
    deps.runner.tick(projectId);
  } catch {
    deps.log.write("warn", "project.rebuild", {
      projectId,
      detail: "Rebuild was admitted but the runner could not be notified.",
    });
  }
}
