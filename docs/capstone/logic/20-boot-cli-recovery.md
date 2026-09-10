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

# Local boot, CLI and runtime recovery

## Trigger & preconditions

- Trigger: launching the app, setting a CLI executable path, or invoking a CLI-backed provider.
- Preconditions: Node `>=26`, writable data directory, and an executable or PATH-resolvable CLI.

## Steps

1. CLI parses configuration and optionally opens the browser (`packages/app/src/edge/cli.ts`; `packages/app/src/kernel/config/`).
2. Boot creates paths, acquires the instance lock, prepares FFmpeg, opens/migrates SQLite, marks interrupted stages, reconciles files, builds the registry and starts the server (`packages/app/src/main.ts:83-142`).
3. Settings validates saved CLI paths and runs a 15-second readiness probe; blank resets to PATH (`packages/app/src/slices/settings/cli-paths.ts`; `packages/app/src/slices/settings/cli-status.ts`).
4. Each new call resolves the current executable; running children retain the executable selected at start (`packages/app/src/adapter-registry.ts`; `packages/app/src/slices/settings/cli-paths.ts`).

## Branches

- PATH command, absolute executable, or readable JS/MJS/CJS entry file use the supported launcher (`packages/app/src/kernel/cli-command.ts`).
- Recognized Windows Node shims resolve to Node plus entry; unknown batch files are rejected.
- Interrupted standalone work requires manual resume; authorized pending batch entries may start and persisted pause holds the queue (`packages/app/src/main.ts:432-470`).

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

Boot writes lock/log/database/filesystem state and starts HTTP/child-process capabilities. Readiness writes the saved path setting only after validation.

## Dimensions not in play

- No provider generation is required to declare an executable ready.
- No remote notification is emitted for local boot failure.

Descriptive scope: D2/D3 eligibility and input, D4 computation, D6 limits, D7 deadlines, D8 concurrency, D9 lifecycle, D10 recovery, D11 termination, D12 visibility, D14 related records, D15 persistence and D16 invariants are covered above and by the cited implementations. D1 has no multi-user authorization model: the app binds loopback by default. D5 does not implement billing or refunds; the estimate only approximates external provider charges. D13 has no outbound notification channel; failures/status are local UI/API responses. No separate durable audit of estimate views, catalogue edits, or queue-position changes is implemented.
