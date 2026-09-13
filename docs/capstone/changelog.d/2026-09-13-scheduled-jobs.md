## 2026-09-13 - scheduled local jobs
key: feature/scheduled-jobs
- Added durable one-off, daily and weekly schedules with IANA timezone occurrence calculation, explicit missed-run policy, skip-on-overlap claims and optional spend ceilings.
- Schedules are tied to immutable project-template revisions and can carry up to 49 keyword variants. Provided media is rejected for unattended execution; each dispatch reuses Play review, cost estimates, checkpoints and the provider-aware queue.
- Added restart recovery, transactional claims, idempotent run history and secret-free problem reasons. The Schedules screen keeps save separate from dispatch and exposes pause, resume, cancel, delete and expandable history controls.
- Verified with schedule service, calendar, scheduler, HTTP and UI tests plus app and web typechecks and focused Biome checks. Full-suite and release validation remain pending.
