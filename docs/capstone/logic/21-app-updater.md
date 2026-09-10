---
generated_at_commit: 3a9796eb7fec
generated_date: 2026-09-10
content_hash: e293a0b5e022
paths_covered:
  - ":(top)packages/app/src/**"
  - ":(top)packages/web/src/**"
  - ":(top)packages/collector/**"
  - ":(top)packages/site/**"
---

# In-app updater

## Trigger & preconditions

- Trigger: update check or explicit Update action from the SPA.
- Preconditions: stable published package, npm available, no active mutation barrier, and no running provider/stage work.

## Steps

1. Updater checks the npm latest tag and compares stable semantic versions (`packages/app/src/updater/registry.ts`; `packages/app/src/updater/service.ts:21-74`).
2. Start obtains the update mutation barrier, validates the exact version, writes an update plan and launches the detached update worker (`packages/app/src/updater/plan.ts:28-64`; `packages/app/src/updater/worker.ts:32-58`).
3. Worker installs the exact package under `<data-dir>/updates/<version>`, starts the candidate with host/port/data-dir and private token, and waits for readiness (`packages/app/src/updater/worker.ts:32-112`).
4. Candidate calls the activation endpoint; successful activation commits `updates/current.json` and the launcher forwards future starts (`packages/app/src/updater/worker.ts:100-142`; `packages/app/src/updater/plan.ts:83-119`).

## Branches

- No newer stable version → no installation.
- Mutation or active work → update start returns conflict (`packages/app/src/main.ts:161-188`; `packages/app/src/updater/service.ts`).
- Candidate is the managed installation or the original entry; environment markers distinguish pending/failed activation (`packages/app/src/updater/worker.ts:55-58`).

## Unhappy paths

- Registry/network/npm failure leaves the current installation running.
- Candidate health, version, or token mismatch prevents activation and stops the candidate (`packages/app/src/updater/candidate.ts`; `packages/app/src/edge/update-worker.ts:5-40`).
- Pre-activation failure restores the previous package entry and SQLite backup (`packages/app/src/updater/install-flow.ts`; `packages/app/src/updater/worker.ts`).
- Lost post-activation acknowledgement requires restart; accepted edits are not rolled back (`packages/app/src/updater/worker.ts:112-142`).

## State transitions

`idle → checking → idle` with an available flag; `idle → installing → restarting`; failures use `error`; failure returns to an available/current installation state. Mutation barrier blocks new HTTP mutations while installing.

## Invariants

- Only stable semantic versions pass the update plan schema.
- The candidate must prove its private startup token and expected version before activation.
- Existing database data is backed up before replacement.

## Outcomes & side effects

The updater performs npm/network access, creates versioned files and a database backup, starts a child process, and atomically records the managed current version.

## Dimensions not in play

- No provider keys are sent to npm or the registry.
- Cloudflare collector/site deployment is separate manual `wrangler deploy` workflow.

Descriptive scope: D2/D3 eligibility and input, D4 computation, D6 limits, D7 deadlines, D8 concurrency, D9 lifecycle, D10 recovery, D11 termination, D12 visibility, D14 related records, D15 persistence and D16 invariants are covered above and by the cited implementations. D1 has no multi-user authorization model: the app binds loopback by default. D5 does not implement billing or refunds; the estimate only approximates external provider charges. D13 has no outbound notification channel; failures/status are local UI/API responses. No separate durable audit of estimate views, catalogue edits, or queue-position changes is implemented.
