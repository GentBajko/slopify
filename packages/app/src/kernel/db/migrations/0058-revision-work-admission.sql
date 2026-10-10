-- Whether an admission has a failed sibling is asked for every idle project on each list,
-- calendar and needs_attention read (`reviews/holds.ts` nothingAdmitted): an index, not a scan.
CREATE INDEX revision_work_admission ON revision_work(admission_id) WHERE admission_id IS NOT NULL;
