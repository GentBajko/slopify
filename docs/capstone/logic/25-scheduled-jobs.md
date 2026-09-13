---
absorbed_from:
  - features/2026-09-13-scheduled-jobs@2026-09-13
scenario: scheduled-jobs
mockup_row: S25
screens:
  - 09-schedules
depends_on:
  - 04-run-admission
  - 18-cost-review-batch
  - 24-project-templates
generated_date: '2026-09-13'
generated_at_commit: 7bdb84e3f57e
capstone_version: 5.2.0
paths_covered:
  - :(top)packages/app/src/slices/schedules/**
  - :(top)packages/app/src/slices/project-templates/**
  - :(top)packages/app/src/slices/play-drafts/**
  - :(top)packages/app/src/main.ts
  - :(top)packages/app/src/edge/http/schedules.ts
  - :(top)packages/web/src/routes/schedules.tsx
  - :(top)packages/web/src/schedules/**
content_hash: 03d52dbfcfe0
---

# 25 Scheduled jobs

A schedule stores a local recurrence over one immutable project-template revision. Each due occurrence instantiates a fresh draft and uses the ordinary review/Start admission path while Slopify is running (`packages/app/src/slices/schedules/scheduler.ts:96`).

## Trigger & preconditions

Creation requires a valid name, existing template ID/version, once/daily/weekly cadence, IANA timezone, missed-run policy, fixed overlap policy, optional nonnegative cent ceiling and at most 49 keyword variants. The referenced template must resolve to a future next occurrence (`packages/app/src/slices/schedules/schema.ts:13`, `packages/app/src/slices/schedules/service.ts:38`).

## Steps

1. Create validates the immutable template revision, calculates the next local occurrence in its timezone and persists an idempotent active schedule. Saving does not run it (`packages/app/src/slices/schedules/service.ts:38`, `packages/app/src/slices/schedules/calendar.ts:35`).
2. Boot recovers schedule-run rows left running, settles already-terminal admitted occurrences, ticks immediately and then every 15 seconds. A mutation lease and process-local guard prevent update/shutdown races and overlapping ticks (`packages/app/src/main.ts:263`, `packages/app/src/main.ts:303`, `packages/app/src/slices/schedules/scheduler.ts:25`).
3. A due claim observes the missed-run grace, skip policy and active-run exclusion, inserts a unique occurrence record, then advances the next occurrence or completes a one-off schedule (`packages/app/src/slices/schedules/scheduler.ts:43`, `packages/app/src/slices/schedules/repo.ts:149`).
4. The claimed occurrence instantiates a fresh template-derived draft, applies title/keyword variants, resolves Play review and rejects high estimates above the configured ceiling. Unknown pricing blocks when a ceiling is configured (`packages/app/src/slices/schedules/scheduler.ts:96`).
5. Successful Start records the resulting project IDs and marks the schedule occurrence succeeded. This status records successful admission; project stages continue through the normal runner (`packages/app/src/slices/schedules/scheduler.ts:124`).

## Branches

- Once, daily and weekly schedules calculate local wall-clock occurrences in the saved timezone; weekly cadence accepts one to seven weekdays (`packages/app/src/slices/schedules/calendar.ts:3`, `packages/app/src/slices/schedules/schema.ts:1`).
- Missed occurrences either skip or run once according to policy and the grace check. Overlap policy is fixed to skip while an occurrence is running or any project admitted by an unsettled occurrence remains nonterminal (`packages/app/src/slices/schedules/scheduler.ts:43`).
- Pause retains the next occurrence; Resume recomputes it from the current time. Cancel is terminal. Delete is allowed only after completion or cancellation and writes a tombstone; its occurrence history remains readable (`packages/app/src/slices/schedules/service.ts:110`, `packages/web/src/routes/schedules.tsx:370`).

## Unhappy paths

Stale base versions, reused mutation IDs with changed bodies, missing template versions and canceled schedules return typed conflicts. Templates with active provided audio, images or thumbnail are rejected because scheduled execution cannot reattach local media. A review/readiness/Start error is recorded on the occurrence without silently creating another chargeable admission (`packages/app/src/slices/schedules/service.ts:64`, `packages/app/src/slices/schedules/service.ts:189`, `packages/app/src/slices/schedules/scheduler.ts:139`).

## State transitions

Schedules move active ↔ paused, active/paused → canceled, and a once schedule becomes completed after its occurrence is claimed. Occurrences move running → succeeded, failed or skipped and retain timestamps, project IDs and a stable reason (`packages/app/src/slices/schedules/service.ts:110`, `packages/app/src/slices/schedules/scheduler.ts:43`).

## Invariants

The template ID/version is immutable input to an occurrence. A unique schedule/occurrence claim and Play's durable review/Start receipts prevent duplicate local admission from repeated ticks or lost replies. `projects_settled_at` permanently closes overlap accounting once all admitted projects are terminal, so later project edits cannot reopen history. Schedule edits and history reads do not submit providers (`packages/app/src/slices/schedules/repo.ts:149`, `packages/app/src/slices/play-drafts/start.ts:32`).

## Outcomes & side effects

Creating or editing persists schedule state. A due successful occurrence creates fresh project(s), records their IDs and lets ordinary project execution continue. Soft-deleted schedules disappear from the list while their run rows remain local; the web list refreshes periodically (`packages/app/src/slices/schedules/scheduler.ts:124`, `packages/web/src/schedules/api.ts:47`).

## Dimensions not in play

Schedules do not wake a stopped machine, send notifications, attach local provided media or guarantee that admitted project generation has completed when the occurrence says succeeded. The scheduler runs only inside the active Slopify process (`packages/app/src/main.ts:303`, `packages/app/src/slices/schedules/scheduler.ts:124`).
