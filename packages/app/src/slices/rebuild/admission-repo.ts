import type { DatabaseSync } from "node:sqlite";
import { transact } from "../../kernel/db/tx.js";
import { setProjectPaused } from "../admission/repo.js";
import type { RevisionDeps } from "../revisions/model.js";
import { requestHash as hash } from "../revisions/mutation-request.js";
import { currentRevisionId } from "../revisions/repo.js";
import { getRevisionView } from "../revisions/view.js";
import {
  type RebuildAdmission,
  type RebuildPreview,
  type RebuildResult,
  rebuildAdmissionSchema,
} from "./model.js";
import { executionSnapshotSchema, planPreview, reviewStillCovers } from "./preview-plan.js";
import { previewById } from "./repo.js";
import { insertInvocation } from "./runtime-admission.js";
import { bindNarrationReuse } from "./runtime-narration-reuse.js";
import { projectStandings } from "./runtime-store.js";

export function admissionReceipt(
  db: DatabaseSync,
  projectId: string,
  idempotencyKey: string,
  requestHash: string,
): RebuildResult<RebuildAdmission> | undefined {
  const row = db
    .prepare(
      "SELECT request_hash,response_json FROM rebuild_admissions WHERE project_id=? AND idempotency_key=?",
    )
    .get(projectId, idempotencyKey);
  if (row !== undefined)
    return row.request_hash !== requestHash
      ? { ok: false, reason: "conflict" }
      : {
          ok: true,
          value: {
            ...rebuildAdmissionSchema.parse(JSON.parse(String(row.response_json))),
            replayed: true,
          },
        };
  if (
    db
      .prepare(
        "SELECT 1 FROM revision_mutations WHERE project_id=? AND idempotency_key=? UNION ALL SELECT 1 FROM project_control_receipts WHERE project_id=? AND idempotency_key=?",
      )
      .get(projectId, idempotencyKey, projectId, idempotencyKey) !== undefined
  )
    return { ok: false, reason: "conflict" };
  return undefined;
}
export function admitPreview(
  deps: RevisionDeps,
  input: {
    readonly preview: RebuildPreview;
    readonly idempotencyKey: string;
    readonly requestHash: string;
  },
): RebuildResult<RebuildAdmission> {
  return transact(deps.db, () => {
    const { preview } = input;
    const replay = admissionReceipt(
      deps.db,
      preview.projectId,
      input.idempotencyKey,
      input.requestHash,
    );
    if (replay !== undefined) return replay;
    if (currentRevisionId(deps.db, preview.projectId) !== preview.baseRevisionId)
      return { ok: false, reason: "conflict" };
    const persisted = previewById(deps.db, preview.projectId, preview.id);
    const row = deps.db
      .prepare("SELECT execution_json FROM rebuild_previews WHERE id=? AND project_id=?")
      .get(preview.id, preview.projectId);
    if (
      persisted === undefined ||
      typeof row?.execution_json !== "string" ||
      hash("body", "", persisted) !== hash("body", "", preview)
    )
      return { ok: false, reason: "stale-preview" };
    const snapshot = executionSnapshotSchema.parse(JSON.parse(row.execution_json));
    const view = getRevisionView(deps, preview.projectId, preview.baseRevisionId);
    if (view === undefined) return { ok: false, reason: "no-project" };
    const fresh = planPreview(deps, view, snapshot.catalogue, preview.selection, preview.id);
    if (!fresh.ok || !reviewStillCovers(preview, snapshot, fresh.value))
      return { ok: false, reason: "stale-preview" };
    const admissionId = deps.ids.next();
    const workIds: string[] = [];
    for (const recipe of snapshot.recipes) {
      const disposition = snapshot.dispositions.find((row) => row.key === recipe.key)?.disposition;
      const existing = deps.db
        .prepare(
          `SELECT w.id,w.state,w.recipe_context,r.piece_id,r.fingerprint FROM revision_work_reservations r JOIN revision_work w ON w.id=r.work_id WHERE r.revision_id=? AND r.work_key=?`,
        )
        .get(view.revision.id, recipe.key);
      if (disposition === "reuse") {
        bindNarrationReuse(deps, view, recipe, snapshot.ordinals[recipe.key] ?? 0);
        continue;
      }
      if (
        existing?.fingerprint === recipe.fingerprint &&
        typeof existing.recipe_context === "string" &&
        existing.state !== "done"
      ) {
        workIds.push(String(existing.id));
        if (existing.state !== "running") {
          deps.db
            .prepare(
              "UPDATE revision_work SET state='pending',dispatch_state='allowed',failure_reason=NULL WHERE id=?",
            )
            .run(String(existing.id));
          deps.db
            .prepare(
              "UPDATE revision_work_pieces SET state='pending',dispatch_state='allowed' WHERE id=? AND state!='done'",
            )
            .run(String(existing.piece_id));
        }
        continue;
      }
      if (existing?.state === "running")
        throw new Error("Selected work has a mismatched running reservation.");
      deps.db
        .prepare("DELETE FROM revision_work_reservations WHERE revision_id=? AND work_key=?")
        .run(view.revision.id, recipe.key);
      const key = recipe.input.kind === "tts" ? `${recipe.input.logicalKey}:1` : recipe.key;
      const fingerprint = snapshot.anchors[key];
      if (fingerprint === undefined)
        throw new Error("Selected work has no reviewed desired anchor.");
      const work = insertInvocation(
        deps,
        view,
        recipe,
        snapshot.catalogue,
        { key, fingerprint },
        false,
        view.revision.id,
        admissionId,
      );
      workIds.push(work.workId);
    }
    const receipt: RebuildAdmission = {
      revisionId: view.revision.id,
      admissionId,
      workIds: [...new Set(workIds)],
      replayed: false,
    };
    deps.db
      .prepare(
        "INSERT INTO rebuild_admissions(id,project_id,revision_id,idempotency_key,request_hash,preview_id,response_json,created_at) VALUES (?,?,?,?,?,?,?,?)",
      )
      .run(
        admissionId,
        preview.projectId,
        view.revision.id,
        input.idempotencyKey,
        input.requestHash,
        preview.id,
        JSON.stringify(receipt),
        deps.clock.now().toISOString(),
      );
    for (const review of snapshot.reviews)
      deps.db
        .prepare(
          "INSERT INTO revision_provided_reviews(project_id,revision_id,work_key,dependency_fingerprint,admission_id) VALUES (?,?,?,?,?) ON CONFLICT(revision_id,work_key) DO UPDATE SET dependency_fingerprint=excluded.dependency_fingerprint,admission_id=excluded.admission_id",
        )
        .run(preview.projectId, view.revision.id, review.key, review.fingerprint, admissionId);
    setProjectPaused(deps.db, preview.projectId, false, deps.clock.now().toISOString());
    projectStandings(deps, preview.projectId);
    return { ok: true, value: receipt };
  });
}
