-- Before 2.4.0 every save made while a step waited for Resume minted a new held row for it,
-- even when the project already had a row for exactly that step (same key and fingerprint).
-- Save now reserves the existing one instead (existingWork in
-- slices/rebuild/transition-repo.ts); this removes the copies left behind by older saves.
--
-- A row counts for a step the way Save counts it: a finished row (work and piece done), or a
-- held row nothing ran for (pending, held, unsent, no planning context, no attempt). Per
-- project, key and fingerprint, the row Save would pick is kept: a finished one first,
-- otherwise the newest held one. Only held rows that are not that pick are removed, and only
-- when they carry one piece and no review checkpoint. A revision that reserved a removed
-- copy is pointed at the kept held row, which is the same unstarted step. A copy some
-- revision reserved while a finished row exists is left alone: pointing that revision at
-- the finished result would change what it shows. Finished, running, failed and admitted
-- work, and assets, are never touched.
CREATE TEMP TABLE m0022_eligible AS
SELECT w.id AS work_id, p.id AS piece_id, w.project_id, p.work_key, p.fingerprint,
  w.rowid AS rid, w.state = 'done' AS done
FROM revision_work w JOIN revision_work_pieces p ON p.work_id = w.id
WHERE (w.state = 'done' AND p.state = 'done')
  OR (w.state = 'pending' AND w.dispatch_state = 'held' AND p.state = 'held'
    AND p.submitted_at IS NULL AND w.recipe_context IS NULL
    AND NOT EXISTS (SELECT 1 FROM attempts a WHERE a.work_id = w.id));

CREATE TEMP TABLE m0022_kept AS
SELECT project_id, work_key, fingerprint, work_id, piece_id, done FROM (
  SELECT e.*, row_number() OVER (
    PARTITION BY project_id, work_key, fingerprint ORDER BY done DESC, rid DESC
  ) AS pick
  FROM m0022_eligible e
) WHERE pick = 1;

CREATE TEMP TABLE m0022_copies AS
SELECT e.work_id, k.work_id AS kept_work_id, k.piece_id AS kept_piece_id
FROM m0022_eligible e
JOIN m0022_kept k ON k.project_id = e.project_id AND k.work_key = e.work_key
  AND k.fingerprint = e.fingerprint
WHERE e.done = 0 AND e.work_id <> k.work_id
  AND (SELECT count(*) FROM revision_work_pieces q WHERE q.work_id = e.work_id) = 1
  AND NOT EXISTS (SELECT 1 FROM review_checkpoints c WHERE c.work_id = e.work_id)
  AND (k.done = 0
    OR NOT EXISTS (SELECT 1 FROM revision_work_reservations r WHERE r.work_id = e.work_id));

UPDATE revision_work_reservations
SET piece_id = CASE WHEN piece_id IS NULL THEN NULL ELSE (
    SELECT c.kept_piece_id FROM m0022_copies c WHERE c.work_id = revision_work_reservations.work_id
  ) END,
  work_id = (
    SELECT c.kept_work_id FROM m0022_copies c WHERE c.work_id = revision_work_reservations.work_id
  )
WHERE work_id IN (SELECT work_id FROM m0022_copies);

DELETE FROM revision_work WHERE id IN (SELECT work_id FROM m0022_copies);

DROP TABLE m0022_eligible;
DROP TABLE m0022_kept;
DROP TABLE m0022_copies;
