---
generated_at_commit: 7bdb84e3f57e
capstone_version: 5.2.0
generated_date: '2026-09-13'
content_hash: 097ad2f70c73
paths_covered:
  - :(top)packages/app/src/updater/**
  - :(top)packages/app/src/edge/http/update.ts
  - :(top)packages/app/src/edge/update-worker.ts
  - :(top)packages/web/src/updates/**
  - :(top)packages/app/src/main.ts
---

# In-app updater

## Trigger & preconditions

- Trigger: update check or explicit Update action from the SPA.
- Preconditions: stable published package, npm available, no active mutation barrier, and no running provider/stage work.

## Steps

1. Updater checks the npm latest tag, validates stable versions and caches non-forced checks for 15 minutes (`packages/app/src/updater/registry.ts:1`, `packages/app/src/updater/service.ts:55`).
2. Start refuses active work/mutations, discovers npm, validates the exact version and launches the detached update worker (`packages/app/src/updater/service.ts:108`, `packages/app/src/updater/plan.ts:122`).
3. Worker installs the exact package under `<data-dir>/updates/<version>`, backs up SQLite, starts a provisional candidate with the same host/port/data directory and private token, and gives it 60 seconds to become healthy; provisional boot defers destructive storage reconciliation (`packages/app/src/updater/plan.ts:28`, `packages/app/src/updater/worker.ts:18`, `packages/app/src/updater/worker.ts:147`).
4. After health, cleanup retains the current and rollback installations plus the newest database backup; cleanup failure is nonfatal. An atomic `updates/current.json` pointer then commits the candidate. The candidate acknowledges promptly, performs deferred storage reconciliation while mutations remain locked, and future CLI starts forward to the installed managed entry (`packages/app/src/updater/plan.ts:91`, `packages/app/src/updater/plan.ts:109`, `packages/app/src/updater/candidate.ts:3`).
5. The floating icon polls every 15 minutes while idle and every two seconds during recovery. It shows only rounded arrows plus an update dot, offsets itself above the footer, checks on click when current, installs on click when an update is available, and stops showing Updating after a two-minute recovery timeout (`packages/web/src/updates/use-update.ts:32`, `packages/web/src/updates/use-update.ts:79`, `packages/web/src/updates/widget.tsx:7`).

## Branches

- No newer stable version → no installation.
- Mutation or active work → update start returns conflict (`packages/app/src/main.ts:161-188`; `packages/app/src/updater/service.ts`).
- Candidate is the managed installation or the original entry; environment markers distinguish pending/failed activation (`packages/app/src/updater/worker.ts:55-58`).

## Unhappy paths

- Registry/network/npm failure leaves the current installation running.
- Candidate health, version, or token mismatch prevents activation and stops the candidate (`packages/app/src/updater/candidate.ts`; `packages/app/src/edge/update-worker.ts:5-40`).
- Pre-activation failure restores the previous package entry and SQLite backup (`packages/app/src/updater/install-flow.ts`; `packages/app/src/updater/worker.ts`).
- Lost post-activation acknowledgement requires restart; accepted edits are not rolled back (`packages/app/src/updater/worker.ts:112-142`).
- A browser that observes persisted installing/restarting state without successful recovery clears its local updating state after two minutes and tells the user to restart and retry (`packages/web/src/updates/use-update.ts:79`).

## State transitions

`idle → checking → idle` with an available flag; `idle → installing → restarting`; failures use `error`; failure returns to an available/current installation state. Mutation barrier blocks new HTTP mutations while installing.

## Invariants

- Only stable semantic versions pass the update plan schema.
- The candidate must prove its private startup token and expected version before activation.
- Existing database data is backed up before replacement; storage reconciliation does not delete files until committed activation is verified.
- Artifact pruning accepts only strict stable-version install directories and valid update-backup filenames, and retains both runnable versions plus the newest rollback copy.

## Outcomes & side effects

The updater performs npm/network access, creates versioned files and a database backup, starts a child process, and atomically records the managed current version.

## Dimensions not in play

- No provider keys are sent to npm or the registry.
- Cloudflare collector/site deployment is separate manual `wrangler deploy` workflow.

Descriptive scope: D2/D3 eligibility and input, D4 computation, D6 limits, D7 deadlines, D8 concurrency, D9 lifecycle, D10 recovery, D11 termination, D12 visibility, D14 related records, D15 persistence and D16 invariants are covered above and by the cited implementations. D1 has no multi-user authorization model: the app binds loopback by default. D5 does not implement billing or refunds; the estimate only approximates external provider charges. D13 has no outbound notification channel; failures/status are local UI/API responses. No separate durable audit of estimate views, catalogue edits, or queue-position changes is implemented.
