# 25 Scheduled jobs

Schedules are local, durable instructions to create fresh projects from an immutable project-template revision while Slopify is running. A schedule stores a one-off, daily, or weekly cadence, an IANA timezone, a missed-run policy, a skip-on-overlap policy, an optional spend ceiling, and up to 49 keyword variants. Uploaded media is rejected because unattended runs cannot reattach a user's files safely.

## Create and edit

The Schedules screen validates the selected template, cadence and timezone before saving. Save is separate from dispatch. The server computes and returns `nextRunAt` in UTC; the screen renders it in the user's locale. Updates use a version and mutation id, so stale tabs cannot overwrite a newer schedule.

## Tick and claim

The boot process recovers any run left `running` by a stopped process, then ticks every 15 seconds. A transactional claim creates one `schedule_runs` row and advances the schedule before provider work starts. The unique `(schedule_id, scheduled_for)` key and version check make retries and concurrent ticks idempotent. A scheduler instance never overlaps its own ticks.

For a missed occurrence, `skip` records a skipped run; `run-once` dispatches the due occurrence once. Recurring schedules advance past every stale occurrence. If another run is still active, the due occurrence is recorded as skipped. A one-off schedule becomes `completed` after its claim.

## Dispatch and history

Dispatch creates a fresh draft from the stored template, applies the base setup plus variant rows, runs the existing Play review and cost estimate, refuses unknown or over-limit estimates, and starts through the normal admission and provider-aware queue. The history row stores only request/project ids, estimates and a safe reason; provider secrets and prompt bodies never enter schedule records. Pause prevents new claims while retaining the next occurrence; resume recalculates it from the current clock; cancel clears future work. Completed and canceled schedules may be deleted without affecting projects they already created.

The schedule detail endpoint returns the schedule and its run history. Errors are problem+json with stable reasons (`missing-template`, `unsupported-media`, `spend-limit`, `readiness`, `conflict`) so the UI can explain recovery without exposing credentials.
