import { z } from "zod";
import { transact } from "../../kernel/db/tx.js";
import type { StageKind } from "../../kernel/pipeline.js";
import type { RevisionDeps } from "../revisions/model.js";
import { currentRevisionId, revisionById } from "../revisions/repo.js";
import type { ResolvedWorkRecipe } from "./recipe-model.js";
import { insertWorkPiece } from "./work-records.js";

const reservationSchema = z.object({
  work_key: z.string(),
  work_id: z.string(),
  piece_id: z.string().nullable(),
  fingerprint: z.string(),
  logical_key: z.string().nullable(),
  desired_fingerprint: z.string().nullable(),
});
export interface WorkTransition {
  readonly projectId: string;
  readonly baseRevisionId: string;
  readonly revisionId: string;
  readonly fingerprints: Readonly<Record<string, string>>;
  readonly baseFingerprints?: Readonly<Record<string, string>>;
  readonly logicalKeys?: Readonly<Record<string, string>>;
  readonly recipes?: readonly ResolvedWorkRecipe[];
  // Each planned step's stage, when the recipes themselves aren't passed (a restore keeps the
  // restored version's own fingerprints, so only the plan's stages are borrowed).
  readonly stages?: Readonly<Record<string, StageKind>>;
}
export function transitionRevisionWork(
  deps: Pick<RevisionDeps, "db" | "ids" | "clock">,
  input: WorkTransition,
): void {
  const { db } = deps;
  transact(db, () => {
    const current = currentRevisionId(db, input.projectId);
    if (current !== input.baseRevisionId && current !== input.revisionId)
      throw new Error("The project was changed while this was being saved. Try again.");
    const base = revisionById(db, input.projectId, input.baseRevisionId);
    const next = revisionById(db, input.projectId, input.revisionId);
    if (base === undefined || next === undefined)
      throw new Error(
        "Slopify hit an internal error (a project version to switch between is missing). Try again; if it happens again, use Download diagnostics in Settings and report it.",
      );
    if (
      JSON.stringify(Object.entries(input.fingerprints).sort()) !==
      JSON.stringify(Object.entries(next.fingerprints).sort())
    )
      throw new Error(
        "Slopify hit an internal error (the planned steps don't match the saved project version). Try again; if it happens again, use Download diagnostics in Settings and report it.",
      );
    const reserved = db
      .prepare(
        `SELECT r.* FROM revision_work_reservations r JOIN revision_work w ON w.id=r.work_id WHERE r.project_id=? AND r.revision_id=? AND w.state IN ('pending','running','done')`,
      )
      .all(input.projectId, input.baseRevisionId)
      .map((row) => reservationSchema.parse(row));
    const carried = new Set<string>();
    const baseFingerprints = input.baseFingerprints ?? base.fingerprints;
    for (const row of reserved) {
      const logicalKey = input.logicalKeys?.[row.work_key] ?? row.logical_key ?? row.work_key;
      const before = baseFingerprints[logicalKey];
      const after = input.fingerprints[logicalKey];
      // Work unfolded under another step (a short's prompts, images and render under the
      // pick) is planned under its own key too once it is known. It carries over only while
      // that key still wants the same work; when it changed (a short made again), the new
      // step is reserved afresh below. A short's step the new plan doesn't list yet waits on
      // an answer that changed, so it is unfolded again once that answer lands.
      const own = logicalKey === row.work_key ? undefined : input.fingerprints[row.work_key];
      if (own !== undefined && own !== row.fingerprint) continue;
      if (own === undefined && logicalKey !== row.work_key && row.work_key.startsWith("shorts:"))
        continue;
      if (
        before !== undefined &&
        before === after &&
        (input.baseFingerprints !== undefined ||
          before === (row.desired_fingerprint ?? row.fingerprint)) &&
        // A held step nobody started carries over only while it is for what is wanted now:
        // one planned for a result an edit no longer asks for (the edit's narration turned out
        // to be the one already made) kept the project waiting on work it doesn't need.
        // A step reserved under its own key is for its own result; one unfolded under another
        // key (a narration chunk's parts) is matched by what that key wanted.
        !(
          after !==
            (logicalKey === row.work_key
              ? row.fingerprint
              : (row.desired_fingerprint ?? row.fingerprint)) && unstarted(db, row.work_id)
        )
      ) {
        db.prepare(
          `INSERT INTO revision_work_reservations(project_id,revision_id,work_key,work_id,piece_id,fingerprint,logical_key,desired_fingerprint) VALUES (?,?,?,?,?,?,?,?)`,
        ).run(
          input.projectId,
          input.revisionId,
          row.work_key,
          row.work_id,
          row.piece_id,
          row.fingerprint,
          logicalKey,
          after,
        );
        carried.add(logicalKey);
        if (own !== undefined) carried.add(row.work_key);
      }
    }
    const live = db.prepare("SELECT id FROM revision_work WHERE project_id=?").all(input.projectId);
    for (const row of live) {
      const id = z.string().parse(row.id);
      db.prepare(
        `UPDATE revision_work_pieces SET dispatch_state=CASE WHEN submitted_at IS NOT NULL THEN 'draining' ELSE 'held' END WHERE work_id=? AND state!='done' AND id NOT IN (SELECT piece_id FROM revision_work_reservations WHERE revision_id=? AND piece_id IS NOT NULL)`,
      ).run(id, input.revisionId);
      const keeps =
        db
          .prepare("SELECT 1 FROM revision_work_reservations WHERE revision_id=? AND work_id=?")
          .get(input.revisionId, id) !== undefined;
      if (!keeps)
        db.prepare(
          `UPDATE revision_work SET dispatch_state=CASE WHEN EXISTS(SELECT 1 FROM attempts WHERE work_id=?) OR EXISTS(SELECT 1 FROM revision_work_pieces WHERE work_id=? AND submitted_at IS NOT NULL) THEN 'draining' ELSE 'held' END WHERE id=? AND state!='done'`,
        ).run(id, id, id);
    }
    db.prepare(
      `DELETE FROM revision_work_reservations WHERE project_id=? AND revision_id=? AND work_key NOT IN (SELECT work_key FROM revision_work_reservations WHERE revision_id=?)`,
    ).run(input.projectId, input.baseRevisionId, input.revisionId);
    for (const [key, fp] of Object.entries(input.fingerprints)) {
      if (carried.has(key)) continue;
      const exact = input.recipes?.find((row) => row.key === key);
      if (exact !== undefined && exact.fingerprint !== fp)
        throw new Error(
          "Slopify hit an internal error (a planned step doesn't match the saved project version). Try again; if it happens again, use Download diagnostics in Settings and report it.",
        );
      // An undo, a restore or a save repeated while a step waits for Resume asks for a
      // step the project already has a row for. A finished one is the result itself; a
      // held copy nobody started is the same placeholder. Minting another each time left a
      // new held row per save, and an undo re-queued work that had already finished.
      const existing = existingWork(db, input.projectId, key, fp);
      if (existing !== undefined) {
        db.prepare(
          `INSERT INTO revision_work_reservations(project_id,revision_id,work_key,work_id,piece_id,fingerprint) VALUES (?,?,?,?,?,?)`,
        ).run(input.projectId, input.revisionId, key, existing.workId, existing.pieceId, fp);
        continue;
      }
      const kind = exact?.stage ?? input.stages?.[key] ?? stageForKey(key);
      const stage = db
        .prepare("SELECT id FROM stages WHERE project_id=? AND kind=?")
        .get(input.projectId, kind);
      if (stage === undefined)
        throw new Error(
          "Slopify hit an internal error (a planned step has no matching stage). Try again; if it happens again, use Download diagnostics in Settings and report it.",
        );
      const workId = deps.ids.next();
      const pieceId = deps.ids.next();
      db.prepare(
        `INSERT INTO revision_work(id,project_id,revision_id,stage_id,kind,fingerprint,state,dispatch_state,created_at) VALUES (?,?,?,?,?,?,'pending','held',?)`,
      ).run(
        workId,
        input.projectId,
        input.revisionId,
        z.string().parse(stage.id),
        kind,
        fp,
        deps.clock.now().toISOString(),
      );
      insertWorkPiece(db, {
        id: pieceId,
        workId,
        key,
        requestFingerprint: exact?.requestFingerprint ?? fp,
        fingerprint: fp,
        ...(exact === undefined ? {} : { logicalFingerprint: exact.logicalFingerprint }),
        input: exact?.input ?? {
          kind: "deferred",
          version: 1,
          operation: "resolve-revision-recipe",
          template: { key, revisionId: input.revisionId, fingerprint: fp },
        },
        continuation: null,
        generationToken: null,
        state: "held",
        dispatchState: "held",
        submittedAt: null,
      });
      db.prepare(
        `INSERT INTO revision_work_reservations(project_id,revision_id,work_key,work_id,piece_id,fingerprint) VALUES (?,?,?,?,?,?)`,
      ).run(input.projectId, input.revisionId, key, workId, pieceId, fp);
    }
  });
}
// Held and never begun: no attempt, nothing submitted, no planning context.
function unstarted(db: RevisionDeps["db"], workId: string): boolean {
  return (
    db
      .prepare(
        `SELECT 1 FROM revision_work w WHERE w.id=? AND w.state='pending' AND w.dispatch_state='held'
          AND w.recipe_context IS NULL
          AND NOT EXISTS(SELECT 1 FROM attempts a WHERE a.work_id=w.id)
          AND NOT EXISTS(SELECT 1 FROM revision_work_pieces p WHERE p.work_id=w.id AND p.submitted_at IS NOT NULL)`,
      )
      .get(workId) !== undefined
  );
}
// A finished row wins over a held one. A held row counts only while nothing ran for it:
// no attempt, nothing submitted, and no planning context (admission gives a row that).
function existingWork(
  db: RevisionDeps["db"],
  projectId: string,
  key: string,
  fingerprint: string,
): { readonly workId: string; readonly pieceId: string } | undefined {
  const row = db
    .prepare(
      `SELECT w.id AS work_id,p.id AS piece_id FROM revision_work w
      JOIN revision_work_pieces p ON p.work_id=w.id
      WHERE w.project_id=? AND p.work_key=? AND p.fingerprint=? AND (
        (w.state='done' AND p.state='done') OR
        (w.state='pending' AND w.dispatch_state='held' AND p.state='held'
          AND p.submitted_at IS NULL AND w.recipe_context IS NULL
          AND NOT EXISTS(SELECT 1 FROM attempts a WHERE a.work_id=w.id))
      )
      ORDER BY CASE w.state WHEN 'done' THEN 0 ELSE 1 END, w.rowid DESC LIMIT 1`,
    )
    .get(projectId, key, fingerprint);
  return row === undefined
    ? undefined
    : { workId: z.string().parse(row.work_id), pieceId: z.string().parse(row.piece_id) };
}
export function stageForKey(key: string): StageKind {
  // A review runs in its item's stage; the narration's review in Audio.
  if (key === "review:narration") return "audio";
  if (key.startsWith("review:shorts:")) return "video";
  if (key.startsWith("review:")) return stageForKey(key.slice("review:".length));
  const prefix = key.split(":")[0];
  if (prefix === "research") return "research";
  if (prefix === "article" || prefix === "entry" || prefix === "script") return "article";
  if (prefix === "audio" || prefix === "narration" || prefix === "level") return "audio";
  // `images:scenes` and `images:appearance` (the latter is Thumbnail's in a project that draws
  // no images, which the plan's own stages say).
  if (prefix === "image" || prefix === "images" || prefix === "reference" || prefix === "figure")
    return "images";
  if (prefix === "thumbnail") return "thumbnail";
  if (
    prefix === "export" ||
    prefix === "subtitles" ||
    prefix === "video" ||
    prefix === "voices" ||
    prefix === "shorts" ||
    prefix === "youtube" ||
    prefix === "animate"
  )
    return "video";
  if (prefix === "document") return "document";
  throw new Error(
    "Slopify hit an internal error (unknown kind of step). Try again; if it happens again, use Download diagnostics in Settings and report it.",
  );
}
