-- What every plan derivation reads across all of a project's versions: its narration history
-- (`slices/rebuild/narration-history.ts`) and its narration joins (`slices/revisions/
-- manifest-repo.ts`). The tables were indexed by version only, so each read scanned every
-- saved piece and output of every project, gigabytes on a long-running install, after every
-- finished step of a run. Indexes only: no row changes.
CREATE INDEX IF NOT EXISTS revision_pieces_project_stage
  ON revision_pieces(project_id, stage_kind, created_at, id);
CREATE INDEX IF NOT EXISTS revision_pieces_project_key
  ON revision_pieces(project_id, piece_key);
CREATE INDEX IF NOT EXISTS revision_outputs_project_work
  ON revision_outputs(project_id, work_key);
