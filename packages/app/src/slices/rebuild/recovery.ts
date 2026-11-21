import { transact } from "../../kernel/db/tx.js";
import { internalError } from "../../kernel/errors.js";
import { stagesOf } from "../admission/repo.js";
import { withProjectControl } from "../control/lock.js";
import type { RevisionView } from "../revisions/model.js";
import { requestHash } from "../revisions/mutation-request.js";
import { saveRevision } from "../revisions/mutations.js";
import { currentRevisionId } from "../revisions/repo.js";
import { getRevisionView } from "../revisions/view.js";
import type { RebuildSelection } from "./model.js";
import { type PreviewPlan, planPreview } from "./preview-plan.js";
import { retainedPreviewPlan } from "./preview-retained.js";
import { type RecipeProviderChoice, recipeProviderChoice } from "./recipe-provider-choice.js";
import type { RevisionWorkPlan } from "./recipe-work.js";
import { acceptedJobMessage, activeConflict, conflictRefusal } from "./recovery-conflict.js";
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
  redoTarget,
  regenerationEdit,
  resumeSelection,
  sectionRoots,
} from "./recovery-selection.js";
import { previewById, storePreview } from "./repo.js";
import { admitCheckedPreview, type RebuildDeps, wakeRebuild } from "./service.js";
import { checkReadiness, paidChoices } from "./service-readiness.js";

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
// The same selection planned again on the same version, stored for admission, or undefined
// when the new plan asks for a service or model the readiness check did not cover, or would
// stop where the first plan's checks would have refused.
function replanCovered(
  deps: RebuildDeps,
  first: PreviewPlan,
  checked: RevisionView,
): PreviewPlan | undefined {
  // Read again: the outputs of the steps that finished meanwhile are what changed.
  const view = getRevisionView(deps, checked.revision.projectId, checked.revision.id);
  if (view === undefined) return undefined;
  const again = planPreview(
    deps,
    view,
    deps.catalogue.read(),
    first.preview.selection,
    deps.ids.next(),
  );
  if (!again.ok) return undefined;
  const { preview, execution } = again.value;
  if (
    preview.providedReuseRequired.length > 0 ||
    preview.work.some((row) => row.disposition === "blocked")
  )
    return undefined;
  const choice = (row: RecipeProviderChoice) =>
    JSON.stringify([row.family, row.provider, row.model, row.voice ?? null, row.thinking ?? null]);
  const covered = new Set(paidChoices(first.execution, checked, deps).map(choice));
  if (!paidChoices(execution, view, deps).every((row) => covered.has(choice(row))))
    return undefined;
  storePreview(deps, preview, execution);
  const stored = previewById(deps.db, view.revision.projectId, preview.id);
  return stored === undefined ? undefined : { preview: stored, execution };
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
  // Set only by an automatic review redo (`review-redo.ts`): see `activeConflict`.
  options: { readonly pendingSuperseded?: boolean } = {},
): Promise<RecoveryResult> {
  const superseded = options.pendingSuperseded === true;
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
  // Where a rerun or a redo starts: the stage's generated work, or the reviewed item's.
  const rootsOf = (view: RevisionView, plan: RevisionWorkPlan): readonly string[] =>
    input.action.kind === "rerun"
      ? sectionRoots(view, plan, input.action.stage)
      : input.action.kind === "redo"
        ? (redoTarget(view, plan, input.action.item)?.roots ?? [])
        : [];
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
          input.action.kind === "rerun"
            ? regenerationEdit(base, plan, input.action.stage)
            : input.action.kind === "redo"
              ? redoTarget(base, plan, input.action.item)?.edit
              : null;
        if (edit === undefined)
          return {
            ok: false,
            reason: "invalid-selection",
            fields: [
              {
                field: "stage",
                message:
                  input.action.kind === "redo"
                    ? "This item is no longer made by the project (it was removed, or its source changed), so it can't be made again. Reload the project page."
                    : "This section has nothing made by AI to make again. Change its source in Edit settings.",
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
        if (input.action.kind !== "rerun" && input.action.kind !== "redo")
          throw new Error(internalError("a recovery edit has nothing to re-run"));
        const affected = dependentClosure(prior.recipes, rootsOf(base, prior));
        const savedIntent = deps.db
          .prepare(
            "SELECT result_revision_id FROM revision_mutations WHERE project_id=? AND idempotency_key=?",
          )
          .get(projectId, recoveryKey(input, "save"));
        const conflict =
          savedIntent === undefined
            ? activeConflict(deps, projectId, affected, superseded)
            : undefined;
        if (conflict !== undefined) return finish(conflictRefusal(conflict));
        const saved = await saveRevision(deps, {
          projectId,
          baseRevisionId: input.baseRevisionId,
          idempotencyKey: recoveryKey(input, "save"),
          edit: record.edit,
          beforeCommit: () => {
            const late = activeConflict(deps, projectId, affected, superseded);
            return late === undefined
              ? undefined
              : {
                  ok: false,
                  reason: "invalid-edit",
                  currentRevisionId: currentRevisionId(deps.db, projectId) ?? null,
                  fields: [
                    {
                      field: "stage",
                      message:
                        late === "running"
                          ? "Wait for this section to finish, or Pause the project before making it again."
                          : acceptedJobMessage,
                    },
                  ],
                };
          },
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
        input.action.kind === "rerun" || input.action.kind === "redo"
          ? dependentClosure(plan.recipes, rootsOf(view, plan))
          : [];
      const selection: RebuildSelection =
        input.action.kind === "rerun" || input.action.kind === "redo"
          ? { kind: "selected", workKeys: rerunKeys }
          : input.action.kind === "retry"
            ? recoverySelection(plan, input.action.stage)
            : resumeSelection(plan, stagesOf(deps.db, projectId));
      if (selection.kind === "selected" && selection.workKeys.length === 0)
        return finish({
          ok: false,
          reason: "invalid-selection",
          fields: [
            {
              field: "stage",
              message: "This section is switched off. Change its source in Edit settings.",
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
              "Look over the changed content you supplied, or the captions you edited, in Edit settings or in Choose what to make again.",
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
        (input.action.stage === "video" || input.action.stage === "document") &&
        preview.value.preview.work.some(
          (row) => row.kind === "provider" && row.disposition !== "reuse",
        )
      )
        return finish({
          ok: false,
          reason: "readiness",
          fields: [
            input.action.stage === "video"
              ? {
                  field: "video",
                  message:
                    "Some of what the video is made from isn't finished. Use Continue the run to finish it before making the video again.",
                }
              : {
                  field: "document",
                  message:
                    "The article or thumbnail the document is made from isn't finished. Use Continue the run to finish it, then press Make the PDF again in the project's PDF section.",
                },
          ],
        });
      const conflict =
        rerunKeys.length > 0 ? activeConflict(deps, projectId, rerunKeys, superseded) : undefined;
      if (conflict !== undefined) return finish(conflictRefusal(conflict));
      storePreview(deps, preview.value.preview, preview.value.execution);
      const stored = previewById(deps.db, projectId, preview.value.preview.id);
      if (stored === undefined)
        throw new Error(internalError("the saved recovery preview is missing"));
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
      ...(input.action.kind === "resume" || input.action.kind === "redo"
        ? {}
        : { stage: input.action.stage }),
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
      const conflict =
        prepared.rerunKeys.length > 0
          ? activeConflict(deps, projectId, prepared.rerunKeys, superseded)
          : undefined;
      if (conflict !== undefined) return finish(conflictRefusal(conflict));
      const admit = (plan: PreviewPlan) =>
        admitCheckedPreview(
          deps,
          plan.preview,
          plan.execution,
          ready.providers,
          recoveryKey(input, "admit"),
          requestHash("direct-recovery", input.baseRevisionId, input.action),
        );
      let admitted = admit(prepared.plan);
      // An automatic redo plans the run's unfinished steps the video waits on too, so one of
      // them finishing while the services were checked leaves its plan stale. Its version is
      // saved by then, and refusing would leave the new draw held until Try again: it is
      // planned again here, under the same lock, when the services already checked cover it.
      if (!admitted.ok && admitted.reason === "stale-preview" && superseded) {
        const again = replanCovered(deps, prepared.plan, prepared.view);
        if (again !== undefined) admitted = admit(again);
      }
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
