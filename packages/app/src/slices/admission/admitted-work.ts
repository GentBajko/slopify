// A step `w` a run admitted (`recipe_context`) for its project's current version, of a stage not
// finished: it still has to run, though a restart, a pause or an agent's review held it, and
// Continue the run or the agent's answer starts it again. A saved edit's step nobody admitted
// yet has no `recipe_context`, and a step reserved only by an older version is a leftover.
export function admittedUnfinished(w: string): string {
  return `${w}.recipe_context IS NOT NULL
    AND EXISTS (SELECT 1 FROM stages s WHERE s.project_id=${w}.project_id AND s.id=${w}.stage_id
      AND s.state NOT IN ('done','provided','skipped'))
    AND EXISTS (SELECT 1 FROM revision_work_reservations r
      JOIN project_heads h ON h.project_id=r.project_id AND h.revision_id=r.revision_id
      WHERE r.work_id=${w}.id)`;
}

// Work `w` admitted and waiting to run (`admittedUnfinished`), as Retry, Resume or Continue
// leave a canceled run's step.
export function pendingAdmitted(w: string): string {
  return `${w}.state='pending' AND ${admittedUnfinished(w)}`;
}

// Whether stage `s` waits to run again after a cancel: pending beside a canceled stage, with
// work admitted to run.
export function readmitted(s: string): string {
  return `(${s}.state='pending'
    AND EXISTS (SELECT 1 FROM stages c WHERE c.project_id=${s}.project_id AND c.state='canceled')
    AND EXISTS (SELECT 1 FROM revision_work w WHERE w.project_id=${s}.project_id AND w.stage_id=${s}.id
      AND ${pendingAdmitted("w")}))`;
}
