import { z } from "zod";
import { transact } from "../../kernel/db/tx.js";
import type { StageKind } from "../../kernel/pipeline.js";
import { projectExists, stagesOf } from "../admission/repo.js";
import { executionPlan, executionView, savedCatalogue } from "../rebuild/runtime-plan.js";
import type { RevisionDeps } from "../revisions/model.js";
import { currentRevisionId } from "../revisions/repo.js";
import { checkpointClosure, checkpointFingerprint } from "./fingerprint.js";
import type { CheckpointResult, CheckpointRow } from "./model.js";
import { listCheckpoints } from "./repo.js";
import { canChangeCheckpoint } from "./rules.js";
import { checkpointRowSchema, checkpointStageSchema } from "./schema.js";

const id = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[0-9A-Za-z_-]+$/);
export const checkpointChangeSchema = z
  .object({
    revisionId: id,
    stages: z
      .array(checkpointStageSchema)
      .max(3)
      .refine((values) => new Set(values).size === values.length)
      .readonly(),
  })
  .strict();
export interface CheckpointStatus {
  readonly revisionId: string;
  readonly checkpoints: readonly (CheckpointRow & {
    readonly currentFingerprint: string;
    readonly dependents: readonly StageKind[];
    readonly workKeys: readonly string[];
  })[];
}

function current(
  deps: RevisionDeps,
  projectId: string,
  revisionId: string,
): CheckpointResult<true> {
  if (!projectExists(deps.db, projectId)) return { ok: false, reason: "not-found" };
  if (currentRevisionId(deps.db, projectId) !== revisionId)
    return { ok: false, reason: "conflict" };
  if (stagesOf(deps.db, projectId).some((stage) => stage.state === "canceled"))
    return { ok: false, reason: "conflict" };
  return { ok: true, value: true };
}

export function resolvedGate(
  deps: RevisionDeps,
  row: CheckpointRow,
): CheckpointStatus["checkpoints"][number] | undefined {
  try {
    const stored = deps.db
      .prepare(
        "SELECT recipe_context FROM revision_work WHERE id=? AND project_id=? AND revision_id=?",
      )
      .get(row.workId, row.projectId, row.revisionId);
    const view = executionView(deps, row.projectId, row.revisionId);
    if (!view || stored?.recipe_context == null)
      throw new Error("Checkpoint work snapshot is missing");
    const plan = executionPlan(deps, view, savedCatalogue(stored.recipe_context));
    const closure = checkpointClosure(row.stage, plan.recipes);
    return {
      ...row,
      currentFingerprint: checkpointFingerprint(view.revision, closure),
      dependents: [...new Set(closure.map((recipe) => recipe.stage))]
        .filter((stage) => stage !== row.stage)
        .sort(),
      workKeys: closure.map((recipe) => recipe.key),
    };
  } catch {
    return undefined;
  }
}

export function readCheckpointStatus(
  deps: RevisionDeps,
  projectId: string,
): CheckpointResult<CheckpointStatus> {
  if (!projectExists(deps.db, projectId)) return { ok: false, reason: "not-found" };
  const revisionId = currentRevisionId(deps.db, projectId);
  if (!revisionId) return { ok: false, reason: "not-found" };
  const checkpoints: CheckpointStatus["checkpoints"][number][] = [];
  for (const row of listCheckpoints(deps.db, projectId, revisionId)) {
    const resolved = refreshCheckpointGate(deps, row);
    if (!resolved) return { ok: false, reason: "conflict" };
    checkpoints.push(resolved);
  }
  return { ok: true, value: { revisionId, checkpoints } };
}

export function refreshCheckpointGate(
  deps: RevisionDeps,
  row: CheckpointRow,
): CheckpointStatus["checkpoints"][number] | undefined {
  const resolved = resolvedGate(deps, row);
  if (
    !resolved ||
    resolved.currentFingerprint === row.fingerprint ||
    row.approvedAt !== null ||
    !["held", "pending-review"].includes(row.state)
  )
    return resolved;
  const changed = deps.db
    .prepare(
      "UPDATE review_checkpoints SET fingerprint=? WHERE project_id=? AND revision_id=? AND checkpoint_id=? AND fingerprint=? AND approved_at IS NULL AND state IN ('held','pending-review')",
    )
    .run(
      resolved.currentFingerprint,
      row.projectId,
      row.revisionId,
      row.checkpointId,
      row.fingerprint,
    );
  return Number(changed.changes) === 1
    ? { ...resolved, fingerprint: resolved.currentFingerprint }
    : undefined;
}

export function validateCheckpointApproval(
  deps: RevisionDeps,
  input: {
    readonly projectId: string;
    readonly revisionId: string;
    readonly checkpointId: string;
    readonly fingerprint: string;
  },
): CheckpointResult<CheckpointRow> {
  const allowed = current(deps, input.projectId, input.revisionId);
  if (!allowed.ok) return { ok: false, reason: allowed.reason };
  const row = listCheckpoints(deps.db, input.projectId, input.revisionId).find(
    (gate) => gate.checkpointId === input.checkpointId,
  );
  if (!row) return { ok: false, reason: "not-found" };
  const stage = stagesOf(deps.db, input.projectId).find((stage) => stage.kind === row.stage);
  const work = deps.db.prepare("SELECT state FROM revision_work WHERE id=?").get(row.workId);
  if (
    !stage ||
    !work ||
    ["done", "provided", "skipped", "canceled"].includes(stage.state) ||
    work.state === "canceled"
  )
    return { ok: false, reason: "conflict" };
  if ((stage.state === "running" || work.state === "running") && row.state !== "released")
    return { ok: false, reason: "conflict" };
  if (
    row.fingerprint !== input.fingerprint ||
    resolvedGate(deps, row)?.currentFingerprint !== input.fingerprint
  )
    return { ok: false, reason: "conflict" };
  return { ok: true, value: row };
}

export function changeCheckpoints(
  deps: RevisionDeps,
  input: { readonly projectId: string } & z.infer<typeof checkpointChangeSchema>,
): CheckpointResult<{ readonly changed: boolean; readonly released: boolean }> {
  const parsed = checkpointChangeSchema.safeParse({
    revisionId: input.revisionId,
    stages: input.stages,
  });
  if (!parsed.success) return { ok: false, reason: "invalid-input" };
  return transact(deps.db, () => {
    const allowed = current(deps, input.projectId, input.revisionId);
    if (!allowed.ok) return { ok: false, reason: allowed.reason };
    const existing = listCheckpoints(deps.db, input.projectId, input.revisionId);
    const remove = existing.filter((row) => !parsed.data.stages.includes(row.stage));
    const add = parsed.data.stages.filter((stage) => !existing.some((row) => row.stage === stage));
    const changedStages = new Set([...remove.map((row) => row.stage), ...add]);
    const additions: CheckpointRow[] = [];
    const stages = stagesOf(deps.db, input.projectId);
    for (const kind of changedStages) {
      const stage = stages.find((row) => row.kind === kind);
      const work = deps.db
        .prepare(`SELECT w.* FROM revision_work w WHERE w.project_id=? AND w.kind=? AND
        (w.revision_id=? OR EXISTS (SELECT 1 FROM revision_work_reservations r WHERE r.work_id=w.id AND r.revision_id=?)) ORDER BY w.id`)
        .all(input.projectId, kind, input.revisionId, input.revisionId);
      const submitted = work.some(
        (row) =>
          row.state !== "pending" ||
          deps.db
            .prepare(
              "SELECT 1 FROM revision_work_pieces WHERE work_id=? AND (submitted_at IS NOT NULL OR state IN ('running','done')) LIMIT 1",
            )
            .get(z.string().parse(row.id)) !== undefined,
      );
      if (!stage || canChangeCheckpoint(stage.state, submitted).kind !== "eligible")
        return { ok: false, reason: "conflict" };
      if (!add.includes(kind)) continue;
      const anchor = work.find(
        (row) => row.revision_id === input.revisionId && typeof row.recipe_context === "string",
      );
      if (typeof anchor?.id !== "string") return { ok: false, reason: "conflict" };
      const row: CheckpointRow = {
        projectId: input.projectId,
        revisionId: input.revisionId,
        checkpointId: deps.ids.next(),
        stage: kind,
        workId: anchor.id,
        fingerprint: "0".repeat(64),
        state: "held",
        createdAt: deps.clock.now().toISOString(),
        approvedAt: null,
      };
      const resolved = resolvedGate(deps, row);
      if (!resolved || resolved.workKeys.length === 0) return { ok: false, reason: "conflict" };
      additions.push(
        checkpointRowSchema.parse({ ...row, fingerprint: resolved.currentFingerprint }),
      );
    }
    for (const row of remove)
      deps.db
        .prepare(
          "DELETE FROM review_checkpoints WHERE project_id=? AND revision_id=? AND checkpoint_id=?",
        )
        .run(row.projectId, row.revisionId, row.checkpointId);
    for (const row of additions)
      deps.db
        .prepare(
          "INSERT INTO review_checkpoints(project_id,revision_id,checkpoint_id,stage,work_id,fingerprint,state,created_at,approved_at) VALUES (?,?,?,?,?,?,?,?,?)",
        )
        .run(
          row.projectId,
          row.revisionId,
          row.checkpointId,
          row.stage,
          row.workId,
          row.fingerprint,
          row.state,
          row.createdAt,
          row.approvedAt,
        );
    return { ok: true, value: { changed: changedStages.size > 0, released: remove.length > 0 } };
  });
}
