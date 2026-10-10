-- Whether a step is admitted for its project's current version is asked of every stage on each
-- list, calendar and needs_attention read (`admission/admitted-work.ts`): its reservations are
-- found by the step, not by a scan of every reservation of every version.
CREATE INDEX revision_work_reservations_work ON revision_work_reservations(work_id);
