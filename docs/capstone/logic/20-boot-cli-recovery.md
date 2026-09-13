---
generated_at_commit: dad071604385
capstone_version: 5.2.0
generated_date: '2026-09-13'
content_hash: 90dbc3499338
paths_covered:
  - :(top)packages/app/src/edge/cli.ts
  - :(top)packages/app/src/kernel/config/**
  - :(top)packages/app/src/main.ts
  - :(top)packages/app/src/edge/http/diagnostics.ts
  - :(top)packages/app/scripts/install-smoke.mjs
  - :(top)packages/app/package.json
---

# Local boot, CLI and runtime recovery

## Trigger & preconditions

- Trigger: launching the app, setting a CLI executable path, or invoking a CLI-backed provider.
- Preconditions: Node `>=26`, writable data directory, and an executable or PATH-resolvable CLI.

## Steps

1. The published package exposes the `slopify` binary and requires Node 26 or newer. Both `npm install -g @gentbajko/slopify` and `npm exec --package ... -- slopify` are exercised by the install smoke; Windows runs npm's generated `.cmd` shim through `ComSpec`, while other platforms execute the installed bin directly (`packages/app/package.json:13`, `packages/app/package.json:16`, `packages/app/scripts/install-smoke.mjs:17`).
2. CLI parses host, port, data-directory and no-open flags, forwards a managed installed update when present, boots, prints local paths and optionally opens the browser (`packages/app/src/edge/cli.ts:9`, `packages/app/src/edge/cli.ts:18`).
3. Boot creates paths, acquires the instance lock, prepares FFmpeg, opens/migrates SQLite, marks interrupted stages, recovers checkpoint work, reconciles files and builds the provider registry (`packages/app/src/main.ts:96`).
4. Settings validates saved CLI paths and runs a bounded readiness probe; blank resets to PATH. Each new call resolves the current executable, while a running child retains its launch command (`packages/app/src/slices/settings/cli-paths.ts:1`, `packages/app/src/slices/settings/cli-status.ts:1`).
5. Boot recovers interrupted schedule-run claims, ticks schedules immediately and every 15 seconds, and pumps the persisted batch queue every second (`packages/app/src/main.ts:263`, `packages/app/src/main.ts:292`).

## Branches

- PATH command, absolute executable, or readable JS/MJS/CJS entry file use the supported launcher (`packages/app/src/kernel/cli-command.ts`).
- Recognized Windows Node shims resolve to Node plus entry; unknown batch files are rejected.
- Interrupted standalone work requires manual resume; authorized pending batch entries may start, and schedules recover their own unfinished claims before the first tick (`packages/app/src/main.ts:263`, `packages/app/src/main.ts:292`).

## Unhappy paths

- Existing instance lock refuses a second app.
- Missing/invalid FFmpeg, migration error, or unrecoverable storage reconciliation fails startup and releases the lock (`packages/app/src/main.ts:88-103`).
- Missing CLI or failed readiness produces a settings error; it does not invoke the provider.
- Child abort or nonzero exit becomes a provider/stage failure through `packages/app/src/kernel/runner/attempt.ts`.

## State transitions

`not running → booting → serving`; `running stage → interrupted` on restart; CLI path `PATH ↔ configured path`; readiness `checking → installed/not found`.

## Invariants

- Prompts never pass through a shell (`packages/app/src/kernel/cli-command.ts`).
- Provider keys and CLI login state are not copied into project records.
- Boot does not auto-resume interrupted work.

## Outcomes & side effects

Boot writes lock/log/database/filesystem state and starts HTTP/child-process capabilities. Readiness writes a saved CLI path only after validation. Diagnostics can download the app/schema/platform, provider readiness and CLI paths, project count and catalogue status without provider keys (`packages/app/src/edge/http/diagnostics.ts:10`).

## Dimensions not in play

- No provider generation is required to declare an executable ready.
- No remote notification is emitted for local boot failure.

Descriptive scope: D2/D3 eligibility and input, D4 computation, D6 limits, D7 deadlines, D8 concurrency, D9 lifecycle, D10 recovery, D11 termination, D12 visibility, D14 related records, D15 persistence and D16 invariants are covered above and by the cited implementations. D1 has no multi-user authorization model: the app binds loopback by default. D5 does not implement billing or refunds; the estimate only approximates external provider charges. D13 has no outbound notification channel; failures/status are local UI/API responses. No separate durable audit of estimate views, catalogue edits, or queue-position changes is implemented.
