---
docker_project_folder_verified_at_commit: a472d51
host_cli_verified_at_commit: 9bd6517
absorbed_from:
  - features/2026-09-25-docker-project-folder@2026-09-25
  - features/2026-09-24-host-cli-bridge@2026-09-24
generated_at_commit: f4c4f7b3295a
capstone_version: 5.2.0
generated_date: '2026-09-13'
content_hash: 2f86287329cb
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

1. The published package exposes the `slopify` binary and requires Node 26 or newer. Both `npm install -g @gentbajko/slopify` and `npm exec --package ... -- slopify` are exercised by the install smoke; Windows runs npm's generated `.cmd` shim through `ComSpec`, while other platforms execute the installed bin directly. The direct launch has a 30-second health deadline; the npm-exec path allows 120 seconds for its cold package installation (`packages/app/package.json:13`, `packages/app/package.json:16`, `packages/app/scripts/install-smoke.mjs:17`).
2. CLI parses host, port, data-directory and no-open flags, forwards a managed installed update when present, boots, prints local paths and optionally opens the browser (`packages/app/src/edge/cli.ts:9`, `packages/app/src/edge/cli.ts:18`).
3. Boot creates paths, acquires the instance lock, prepares FFmpeg, opens/migrates SQLite, marks interrupted stages, recovers checkpoint work, reconciles files and builds the provider registry (`packages/app/src/main.ts:96`).
4. Settings validates saved CLI paths and runs a bounded readiness probe; blank resets to PATH. Each new call resolves the current executable, while a running child retains its launch command (`packages/app/src/slices/settings/cli-paths.ts:1`, `packages/app/src/slices/settings/cli-status.ts:1`).
5. Boot recovers interrupted schedule-run claims, ticks schedules immediately and every 15 seconds, and pumps the persisted batch queue every second (`packages/app/src/main.ts:263`, `packages/app/src/main.ts:292`).

## Branches

- `--docker` detects host CLIs before container mutation. Detected CLIs require one-time helper/startup consent (including lingering); non-interactive use requires --accept-host-cli or explicit --host-cli=off. No CLI means API-only without helper install. Managed setup is Linux/systemd, non-root user only (`packages/app/src/edge/docker.ts:23`).
- Setup checks/pulls a protocol-compatible image, takes a 30-second lock, installs an exact-version stable helper with scripts disabled, writes only allowlisted paths and activates the dedicated unit. Existing owned healthy configuration is reused. Upgrades pause admissions, refuse active generation and resume on failure; startup waits 30 seconds, then rolls back owned configuration/service with a separate 35-second budget even when setup was canceled. The old native Slopify service is never touched (`packages/app/src/host-cli/install.ts:52`, `packages/app/src/host-cli/service.ts:124`).
- For host CLI access, Docker mounts the private socket/token share directory read-only, with no home, executable, credential or Docker-socket mount. Separately, project files have a host bind and private installation activation has a read-only control bind. Container boot never falls back to local CLI execution if the helper is missing/broken. Directory mounting permits helper restart without container recreation; failed content is never silently retried (`packages/app/src/edge/docker-projects/engine.ts:389`, `packages/app/src/main.ts`).
- Managed project setup is serialized by a private global `flock`. It reconciles the selected daemon, volume, current mounts, receipt and journal; preserves a verified existing bind; refuses stale/missing identities and other volume claimants. Default latest is refreshed, and image/application versions must match before source stop. It verifies copy manifests and host ownership, snapshots private data, then launches an inert candidate and waits up to120seconds for health. Receipt commit precedes activation and restart-always; precommit rollback restores the original private state/restart policy where safe. Retry after commit never rolls back the old database (`packages/app/src/edge/docker-launch.ts:15`, `packages/app/src/edge/docker-projects/install.ts:31`, `packages/app/src/edge/docker-projects/recover.ts:20`).
- The host project folder defaults to `~/Slopify/Projects` and is remembered privately; custom container names get separate defaults. `--projects-dir` chooses a new verified destination. Rootful containers use host UID/GID and supported rootless containers use a verified mapping; remote/Desktop/userns-remap daemons are refused before storage mutation. API-only mode still exposes real host file locations without a helper (`packages/app/src/edge/docker-projects/state.ts:133`, `packages/app/src/edge/docker-projects/engine.ts:199`, `packages/app/src/edge/http/folder-location.ts:13`).
- Status/disable commands target only slopify-cli-bridge.service. Disabling leaves Docker/API providers, data and host logins intact; it does not disable lingering. Native installs remain direct and need no helper. Full setup/limits/permission details are in [operations](../07-operations.md#processes).

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
