import { transact } from "../../kernel/db/tx.js";
import { projectPaused } from "../admission/repo.js";
import { withProjectControl } from "../control/lock.js";
import type { RevisionView } from "../revisions/model.js";
import { requestHash } from "../revisions/mutation-request.js";
import { saveRevision } from "../revisions/mutations.js";
import { currentRevisionId } from "../revisions/repo.js";
import { getRevisionView } from "../revisions/view.js";
import type { RebuildSelection } from "./model.js";
import { type PreviewPlan, planPreview } from "./preview-plan.js";
import { retainedPreviewPlan } from "./preview-retained.js";
import { recipeProviderChoice } from "./recipe-provider-choice.js";
import {
  type RecoveryRequest,
  type RecoveryResult,
  recoveryRequestSchema,
} from "./recovery-model.js";
import {
  readRecovery,
  recoveryAuthority,
  recoveryKey,
  rememberRecovery,
  reserveRecovery,
} from "./recovery-repo.js";
import {
  dependentClosure,
  recoverySelection,
  regenerationEdit,
  sectionRoots,
} from "./recovery-selection.js";
import { previewById, storePreview } from "./repo.js";
import { admitCheckedPreview, type RebuildDeps, wakeRebuild } from "./service.js";
import { checkReadiness } from "./service-readiness.js";

// Active: an invocation in flight, a provider job the head can still retrieve, or admitted
// work that can still start. Work behind a pause or a failed/canceled sibling of its
// admission never starts, and leftovers of superseded revisions never run; counting either
// would refuse every later rerun of the section.
function activeConflict(deps: RebuildDeps, projectId: string, keys: readonly string[]): boolean {
  const rows = deps.db
    .prepare(
      "SELECT p.work_key,r.logical_key FROM revision_work w " +
        "JOIN revision_work_pieces p ON p.work_id=w.id " +
        "LEFT JOIN revision_work_reservations r ON r.work_id=w.id AND r.piece_id=p.id " +
        "WHERE w.project_id=? AND (w.state='running' OR " +
        "(w.state='pending' AND p.state!='done' AND p.continuation IS NOT NULL AND " +
        "r.revision_id=(SELECT revision_id FROM project_heads WHERE project_id=w.project_id)) OR " +
        "(? AND w.state='pending' AND w.dispatch_state='allowed' AND NOT EXISTS(" +
        "SELECT 1 FROM revision_work f WHERE f.admission_id=w.admission_id " +
        "AND f.state IN ('failed','canceled'))))",
    )
    .all(projectId, projectPaused(deps.db, projectId) ? 0 : 1);
  return rows.some((row) =>
    keys.some(
      (key) =>
        row.work_key === key ||
        row.logical_key === key ||
        (key.endsWith(":future") && String(row.work_key).startsWith(key.slice(0, -6))),
    ),
  );
}
function credentialsStamp(deps: RebuildDeps, plan: PreviewPlan, view: RevisionView): string {
  const providers = new Set(
    plan.execution.recipes.flatMap((recipe) => {
      if (!plan.execution.submissions.some((row) => row.key === recipe.key && row.submit))
        return [];
      const choice = recipeProviderChoice(recipe, view.revision.config);
      return choice === undefined ? [] : [choice.provider];
    }),
  );
  const metadata = deps.db
    .prepare("SELECT provider,credential_generation FROM provider_keys ORDER BY provider")
    .all()
    .filter((row) => providers.has(String(row.provider)));
  return requestHash("recovery-credentials", view.revision.id, metadata);
}
type Prepared = {
  readonly plan: PreviewPlan;
  readonly view: RevisionView;
  readonly authority: string;
  readonly credentials: string;
  readonly rerunKeys: readonly string[];
};
export async function recoverProject(
  deps: RebuildDeps,
  projectId: string,
  raw: RecoveryRequest,
): Promise<RecoveryResult> {
  const parsed = recoveryRequestSchema.safeParse(raw);
  if (!parsed.success)
    return {
      ok: false,
      reason: "invalid-selection",
      fields: parsed.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    };
  const input = parsed.data;
  const prepared = await withProjectControl(
    deps.db,
    projectId,
    async (): Promise<Prepared | RecoveryResult> => {
      const found = readRecovery(deps, projectId, input);
      if (found !== undefined && "ok" in found) return found;
      const base = getRevisionView(deps, projectId, input.baseRevisionId);
      if (base === undefined)
        return {
          ok: false,
          reason: currentRevisionId(deps.db, projectId) === undefined ? "no-project" : "conflict",
        };
      let record = found;
      if (record === undefined) {
        if (!base.current) return { ok: false, reason: "conflict" };
        const plan = retainedPreviewPlan(deps, base, deps.catalogue.read());
        const edit =
          input.action.kind === "rerun" ? regenerationEdit(base, plan, input.action.stage) : null;
        if (edit === undefined)
          return {
            ok: false,
            reason: "invalid-selection",
            fields: [
              {
                field: "stage",
                message:
                  "This section has no generated work to rerun. Use Edit project to change its source.",
              },
            ],
          };
        record = reserveRecovery(deps, projectId, input, edit);
      }
      const authority = record.authority;
      let intentRevisionId = record.intentRevisionId;
      const finish = (result: RecoveryResult): RecoveryResult =>
        rememberRecovery(
          deps,
          projectId,
          input,
          !result.ok && intentRevisionId !== null ? { ...result, intentRevisionId } : result,
        );
      if (recoveryAuthority(deps, projectId) !== authority)
        return finish({ ok: false, reason: "control-changed" });
      let view = base;
      if (record.edit !== null) {
        const prior = retainedPreviewPlan(deps, base, deps.catalogue.read());
        const action = input.action;
        if (action.kind !== "rerun") throw new Error("Recovery edit has no rerun action");
        const affected = dependentClosure(prior.recipes, sectionRoots(base, prior, action.stage));
        const savedIntent = deps.db
          .prepare(
            "SELECT result_revision_id FROM revision_mutations WHERE project_id=? AND idempotency_key=?",
          )
          .get(projectId, recoveryKey(input, "save"));
        if (savedIntent === undefined && activeConflict(deps, projectId, affected))
          return finish({ ok: false, reason: "running" });
        const saved = await saveRevision(deps, {
          projectId,
          baseRevisionId: input.baseRevisionId,
          idempotencyKey: recoveryKey(input, "save"),
          edit: record.edit,
          beforeCommit: () =>
            activeConflict(deps, projectId, affected)
              ? {
                  ok: false,
                  reason: "invalid-edit",
                  currentRevisionId: currentRevisionId(deps.db, projectId) ?? null,
                  fields: [
                    {
                      field: "stage",
                      message:
                        "Wait for this section to finish, or Pause the project before rerunning it.",
                    },
                  ],
                }
              : undefined,
        });
        if (!saved.ok) return finish(saved);
        view = saved.view;
        intentRevisionId = view.revision.id;
        deps.db
          .prepare(
            "UPDATE project_recovery_requests SET intent_revision_id=? WHERE project_id=? AND idempotency_key=?",
          )
          .run(view.revision.id, projectId, input.idempotencyKey);
      }
      if (currentRevisionId(deps.db, projectId) !== view.revision.id)
        return finish({ ok: false, reason: "conflict" });
      const plan = retainedPreviewPlan(deps, view, deps.catalogue.read());
      const rerunKeys =
        input.action.kind === "rerun"
          ? dependentClosure(plan.recipes, sectionRoots(view, plan, input.action.stage))
          : [];
      const selection: RebuildSelection =
        input.action.kind === "rerun"
          ? { kind: "selected", workKeys: rerunKeys }
          : recoverySelection(plan, input.action.kind === "retry" ? input.action.stage : undefined);
      if (selection.kind === "selected" && selection.workKeys.length === 0)
        return finish({
          ok: false,
          reason: "invalid-selection",
          fields: [
            {
              field: "stage",
              message: "This section has no enabled work. Use Edit project to change its source.",
            },
          ],
        });
      const preview = planPreview(deps, view, deps.catalogue.read(), selection, deps.ids.next());
      if (!preview.ok) return finish(preview);
      if (preview.value.preview.providedReuseRequired.length > 0)
        return finish({
          ok: false,
          reason: "review-required",
          fields: preview.value.preview.providedReuseRequired.map((key) => ({
            field: key,
            message:
              "Review changed supplied content or manual captions in Edit project or Advanced rebuild review.",
          })),
        });
      const blocked = preview.value.preview.work.filter((row) => row.disposition === "blocked");
      if (blocked.length > 0)
        return finish({
          ok: false,
          reason: "readiness",
          fields: blocked.map((row) => ({ field: row.key, message: row.reason })),
        });
      if (
        input.action.kind === "rerun" &&
        input.action.stage === "video" &&
        preview.value.preview.work.some(
          (row) => row.kind === "provider" && row.disposition !== "reuse",
        )
      )
        return finish({
          ok: false,
          reason: "readiness",
          fields: [
            {
              field: "video",
              message:
                "Source media is incomplete. Use Resume to recover it before rerunning the export.",
            },
          ],
        });
      if (rerunKeys.length > 0 && activeConflict(deps, projectId, rerunKeys))
        return finish({ ok: false, reason: "running" });
      storePreview(deps, preview.value.preview, preview.value.execution);
      const stored = previewById(deps.db, projectId, preview.value.preview.id);
      if (stored === undefined) throw new Error("Stored recovery preview is missing.");
      return {
        plan: { preview: stored, execution: preview.value.execution },
        view,
        authority,
        rerunKeys,
        credentials: credentialsStamp(deps, preview.value, view),
      };
    },
  );
  if ("ok" in prepared) return prepared;
  let ready: Awaited<ReturnType<typeof checkReadiness>>;
  try {
    ready = await checkReadiness(deps, prepared.plan.execution, prepared.view);
  } catch {
    deps.log.write("warn", "project.recovery", {
      projectId,
      ...(input.action.kind === "resume" ? {} : { stage: input.action.stage }),
      detail: "Provider readiness could not be loaded.",
    });
    ready = {
      fields: [{ field: "provider", message: "Check provider readiness and try Resume." }],
      providers: [],
    };
  }
  let admittedHere = false;
  const result = await withProjectControl(deps.db, projectId, () =>
    transact(deps.db, (): RecoveryResult => {
      const receipt = readRecovery(deps, projectId, input);
      if (receipt !== undefined && "ok" in receipt) return receipt;
      if (receipt === undefined) return { ok: false, reason: "no-project" };
      const finish = (value: RecoveryResult): RecoveryResult =>
        rememberRecovery(
          deps,
          projectId,
          input,
          !value.ok && receipt.intentRevisionId !== null
            ? { ...value, intentRevisionId: receipt.intentRevisionId }
            : value,
        );
      if (recoveryAuthority(deps, projectId) !== prepared.authority)
        return finish({ ok: false, reason: "control-changed" });
      if (currentRevisionId(deps.db, projectId) !== prepared.view.revision.id)
        return finish({ ok: false, reason: "conflict" });
      if (credentialsStamp(deps, prepared.plan, prepared.view) !== prepared.credentials)
        return finish({
          ok: false,
          reason: "readiness",
          fields: [
            { field: "provider", message: "Provider credentials changed. Try Resume again." },
          ],
        });
      if (ready.fields.length > 0)
        return finish({ ok: false, reason: "readiness", fields: [...ready.fields] });
      if (prepared.rerunKeys.length > 0 && activeConflict(deps, projectId, prepared.rerunKeys))
        return finish({ ok: false, reason: "running" });
      const admitted = admitCheckedPreview(
        deps,
        prepared.plan.preview,
        prepared.plan.execution,
        ready.providers,
        recoveryKey(input, "admit"),
        requestHash("direct-recovery", input.baseRevisionId, input.action),
      );
      if (!admitted.ok) return finish(admitted);
      admittedHere = true;
      return finish({
        ok: true,
        value: {
          ...admitted.value,
          workIds: [...admitted.value.workIds],
          warnings: [
            ...prepared.plan.preview.warnings,
            ...(prepared.plan.preview.costs.unknown > 0
              ? ["Some generation prices are unknown; actual usage is recorded."]
              : []),
          ],
        },
      });
    }),
  );
  if (result.ok && admittedHere) {
    deps.emit(projectId, { type: "project.updated", projectId });
    wakeRebuild(deps, projectId, result.value);
  }
  return result;
}
