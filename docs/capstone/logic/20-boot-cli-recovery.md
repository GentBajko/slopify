---
absorbed_from:
  - features/2026-09-25-docker-project-folder@2026-09-25
  - features/2026-09-24-host-cli-bridge@2026-09-24
generated_at_commit: 54f5cb4c1dab
generated_date: 2026-09-30
capstone_version: 7.0.1
content_hash: 42d651a56dc6
paths_covered:
  - ":(top)packages/app/src/edge/cli.ts"
  - ":(top)packages/app/src/edge/cli-args.ts"
  - ":(top)packages/app/src/edge/signal-shutdown.ts"
  - ":(top)packages/app/src/edge/docker.ts"
  - ":(top)packages/app/src/edge/docker-install/**"
  - ":(top)packages/app/src/edge/autostart/**"
  - ":(top)packages/app/src/edge/http/diagnostics.ts"
  - ":(top)packages/app/src/host-cli/service.ts"
  - ":(top)packages/app/src/host-cli/install.ts"
  - ":(top)packages/app/src/kernel/config/**"
  - ":(top)packages/app/src/kernel/lock.ts"
  - ":(top)packages/app/src/kernel/cli-command.ts"
  - ":(top)packages/app/src/adapters/ffmpeg.ts"
  - ":(top)packages/app/src/slices/settings/cli-paths.ts"
  - ":(top)packages/app/src/slices/settings/cli-status.ts"
  - ":(top)packages/app/src/main.ts"
  - ":(top)packages/app/scripts/install-smoke.mjs"
  - ":(top)packages/app/package.json"
  - ":(top)compose.yaml"
---

# Local boot, CLI and runtime recovery

## Trigger & preconditions

- Triggers: running the `slopify` binary (`npx @gentbajko/slopify`, a global install, or the autostart login entry), `slopify --docker` / `install --docker` / `update`, SIGINT/SIGTERM, saving a CLI executable path in Settings, and invoking a CLI-backed provider (`packages/app/package.json:15-17`, `packages/app/src/edge/cli.ts:11-133`).
- Preconditions: Node `>=26`; a writable data directory (default `~/.slopify`); for FFmpeg either `SLOPIFY_FFMPEG`/`FFMPEG_BIN`, the bundled `ffmpeg-static` binary, or a cached/downloadable copy (`packages/app/package.json:13-15`, `packages/app/src/kernel/config/index.ts:23-41`, `packages/app/src/adapters/ffmpeg.ts:21-60`).

## Steps

1. **Parse arguments.** `parseCli` accepts `--port`, `--host`, `--data-dir`, `--projects-dir`, `--no-open`, `--docker`, `--host-cli`, `--accept-host-cli`, `--autostart`, `--no-autostart`, `-h/--help` (or positional `help`), `-v/--version`; unknown options and bad values are restated with a pointer to `--help` (`packages/app/src/edge/cli-args.ts:3-55`). Positionals other than `install` or `update` (or more than one) are rejected (`packages/app/src/edge/cli.ts:24-28`).
2. **Flag compatibility.** `install` without `--docker` is refused; `--projects-dir`, `--host-cli`, `--accept-host-cli` require Docker; `--host-cli` accepts only `off`; `--host`/`--data-dir` are refused with Docker; `--autostart` with `--no-autostart` is refused (`packages/app/src/edge/cli.ts:29-54`, `packages/app/src/edge/autostart/prompt.ts:7-17`).
3. **Route.** `--docker`, or `update` when a Docker install exists (`install.json` or `receipt.json` under the Docker root), runs `runDockerCommand` and exits; `update` without Docker runs the native updater client and exits ([updater](21-app-updater.md)); otherwise the CLI resolves the config (`--port`/`SLOPIFY_PORT` default 6969 integer 1–65535, `--host`/`SLOPIFY_HOST` default `127.0.0.1` non-blank, `--data-dir`/`SLOPIFY_DATA_DIR`, `--no-open`/`SLOPIFY_NO_OPEN`) (`packages/app/src/edge/cli.ts:33-78`, `packages/app/src/edge/docker-install/run.ts:175-186`, `packages/app/src/kernel/config/index.ts:20-59`).
4. **Forward to a managed update.** When `updates/current.json` names a newer installed version, the CLI re-executes that entry and exits with its code (`packages/app/src/edge/cli.ts:79-84`, `packages/app/src/updater/forward.ts:4-38`).
5. **Boot sequence** (`boot`) (`packages/app/src/main.ts:225-813`):
   1. refuse a container whose `SLOPIFY_DOCKER_INSTALL_STATE` is not `/opt/slopify-install/activation.json` (`packages/app/src/main.ts:229-237`);
   2. create data dirs owner-only (0700) and acquire the instance lock `<data-dir>/.lock` (`packages/app/src/main.ts:241-242`, `packages/app/src/kernel/paths.ts:36-42`);
   3. prepare FFmpeg: an override path is verified; else the bundled binary is verified; else a cached `bin/ffmpeg-static-<version>-<platform>-<arch>` is verified; else the `ffmpeg-static` installer downloads into a staging dir (180 s timeout) (`packages/app/src/main.ts:246-251`, `packages/app/src/adapters/ffmpeg.ts:21-60`);
   4. open SQLite `slopify.db` and run migrations (`packages/app/src/main.ts:252-253`);
   5. settle the files location: a container uses the installer's mounts; a native install reads the stored choice, or on a fresh install with `filesInDocuments` picks the first `<Documents>/Slopify[ n]` (n ≤ 20) whose `Projects` is empty or missing, else the data dir, and stores it (`packages/app/src/main.ts:254-273`, `packages/app/src/slices/storage/files-location.ts:81-97`, `packages/app/src/edge/cli.ts:94-95`);
   6. recover: `markInterruptedStages` sets every `running` stage to `pending` for a paused project, else `failed` with `failure_reason='interrupted'`; `recoverCheckpointWork`; `settleTerminalScheduleRuns`; `settleInterruptedCastImages`; `reconcileStorage` (orphan and staged files) unless this is a pending update candidate (`packages/app/src/main.ts:275-282`, `packages/app/src/main.ts:1017-1024`);
   7. build the catalogue, host-CLI client (container or `SLOPIFY_HOST_CLI_DIR`), curated provider registry, runner and updater (`packages/app/src/main.ts:330-469`);
   8. kick review redos and narration retries; `resumeAfterRestart` resumes projects whose stage was waiting on a CLI plan limit (paused/cancelled ones stay) (`packages/app/src/main.ts:486-507`, `packages/app/src/slices/run-cost/limits.ts:124-135`);
   9. `scheduleRunner.recover(now)` before the first tick (`packages/app/src/main.ts:538`);
   10. seed the bundled samples when `seedSample` and not a pending candidate; failure is logged only (`packages/app/src/main.ts:578-585`);
   11. create the autostart service and, with `refreshAutostart`, re-point an existing login entry at this Node and version (`packages/app/src/main.ts:586-598`);
   12. listen on host/port (`packages/app/src/main.ts:656`, `packages/app/src/main.ts:967-979`);
   13. start timers, each taking the updater's mutation lease and skipping while an update is installing: batch queue pump every 1 s, schedule tick at start and every 15 s, retry wake-ups every 5 s; also backups tick every 60 s, catalogue sync at start and hourly-if-due, trash purge at start and hourly (`packages/app/src/main.ts:657-729`);
   14. flush queued telemetry and prefetch the subtitle model in the background when enabled (`SLOPIFY_NO_MODEL_PREFETCH` unset/`0`/`false`) (`packages/app/src/main.ts:732-749`, `packages/app/src/edge/cli.ts:87-90`).
6. **Print and open.** The CLI prints the URL, data directory, projects, database and logs paths, warns when bound to anything other than `127.0.0.1` ("anyone who reaches this port controls the app and its keys"), and opens the browser unless `open` is false (`packages/app/src/edge/cli.ts:100-115`).
7. **Autostart question.** After the server is up: a flag sets the switch; otherwise, if unanswered, an interactive terminal is asked "Start Slopify when you log in? (Y/n)" (Enter/y/yes = yes); a non-interactive start prints where to turn it on. Never fails the start (`packages/app/src/edge/cli.ts:122-129`, `packages/app/src/edge/autostart/prompt.ts:1-87`). Native login entries are a `.desktop` file (Linux), a launch entry (macOS) or a Run entry (Windows); in a container the switch reflects the installer's record (`packages/app/src/edge/autostart/index.ts:22-50`, `packages/app/src/edge/autostart/native.ts:69-131`).
8. **Shutdown.** First SIGINT/SIGTERM calls `stop` and exits 0 (1 on error); a second signal exits 1 immediately (`packages/app/src/edge/signal-shutdown.ts:3-30`). `stop` clears all timers, closes admission, drains admitted mutations for up to 5 s, drains schedule ticks, topic generation and backups (an in-progress backup is stopped and its partial file removed), aborts running provider work, then terminates connections, closes the DB and releases the lock (`packages/app/src/main.ts:145`, `packages/app/src/main.ts:752-799`).
9. **CLI executable path.** `PUT /api/providers/:id/path` accepts an absolute path without control characters (≤ 4096) or blank (reset to PATH lookup). A non-blank path must be a file, executable (readable for `.js/.mjs/.cjs` and on Windows), and answer the version probe (15 s timeout); Codex must report ≥ 0.149.1. Saves per installation are serialized; `codex-image` shares Codex's path. The stored path is read on every invocation. In Docker the endpoint refuses (the host bridge finds the tools) (`packages/app/src/slices/settings/cli-paths.ts:11-140`, `packages/app/src/slices/settings/cli-status.ts:20-90`).
10. **Command resolution.** `cliCommand` runs `.js/.mjs/.cjs` entries through Node; on Windows it resolves PATH with `.exe/.com/.cmd/.bat`, and turns a recognized npm/`%dp0%` Node shim (≤ 64 KiB) into Node + script; other batch files are refused. Arguments are an argv array; no shell is used (`packages/app/src/kernel/cli-command.ts:9-59`).
11. **Diagnostics.** `GET /api/diagnostics` downloads `slopify-diagnostics.json`: app version, schema version, platform, Node major, provider id/family/name/readiness/CLI path, project count and catalogue status (`packages/app/src/edge/http/diagnostics.ts:10-41`).
12. **Install smoke.** `scripts/install-smoke.mjs` packs the package and, in parallel, starts it via a global install (Windows through `ComSpec` `call`), via `npm exec --yes --package <tgz> -- slopify`, and via an `--ignore-scripts` install (which must fetch FFmpeg itself, then start again with an unreachable `FFMPEG_BINARIES_URL`), each with its own data dir and port and a 210 s health deadline (`packages/app/scripts/install-smoke.mjs:16-107`, `packages/app/scripts/install-smoke.mjs:106-172`).

## Branches

- **Docker install/update** (Linux only, non-root) (`packages/app/src/edge/docker.ts:11-24`):
  - Host CLIs: when any of Claude Code/Codex/Gemini resolves on the host and `--host-cli=off` is absent, consent is required once (saved in `consent.json`); non-interactive runs need `--accept-host-cli`; `systemctl --user` must work. Setup takes a 30 s directory lock, installs the helper with scripts ignored, writes the `slopify-cli-bridge.service` unit and enables lingering. Upgrading an active helper pauses it (SIGHUP) and refuses while it has active work; failure restores the previous unit/config within a 35 s budget (`packages/app/src/edge/docker.ts:46-126`, `packages/app/src/host-cli/install.ts:74-110`, `packages/app/src/host-cli/service.ts:12`, `packages/app/src/host-cli/service.ts:177-240`).
  - Apply: a per-installation `update.lock`; an interrupted previous run is rolled back first; the daemon must be the one recorded; remote daemons, Docker Desktop and userns-remap are refused; the image version must equal the installer version; an unchanged installation is only started and health-checked. Otherwise it waits for running work, stops the old container, snapshots the data volume to a recovery volume, publishes the projects folder, writes compose `.env` and `activation.json` (`committed: false`), starts the candidate, waits up to 120 s for health and token readiness, then commits and keeps only the newest recovery volume. Default projects folder: `<Documents>/Slopify/Projects` (or `<Documents>/Slopify/<name>/Projects`); a new Documents install gets a sibling `Backups` bind (`packages/app/src/edge/docker-install/apply.ts:92-212`, `packages/app/src/edge/docker-install/apply.ts:215-357`, `packages/app/src/edge/docker-install/engine.ts:223-249`, `packages/app/src/edge/docker-install/engine.ts:433-462`, `packages/app/src/edge/docker-install/run.ts:51-58`, `packages/app/src/edge/docker-install/run.ts:189-193`).
  - Container mounts: data volume at `/data`, projects bind at `/data/projects`, backups bind at `/data/backups`, the host-CLI share read-only at `/opt/slopify-host`, the activation dir read-only at `/opt/slopify-install`; the port is published on `127.0.0.1` only (`compose.yaml:17-58`). Full detail: [Docker architecture](../01-architecture-docker.md).
- **Paused project at boot** → its interrupted stages return to `pending`, not `failed` (`packages/app/src/main.ts:1017-1024`).
- **Update candidate boot** (`SLOPIFY_UPDATE_PENDING=1` with a valid token) → storage reconciliation and sample seeding are deferred until activation (`packages/app/src/main.ts:238-240`, `packages/app/src/main.ts:282`, `packages/app/src/main.ts:580`).
- **Stale lock** → a lock whose holder process is gone (or unreadable) is discarded and re-claimed (`packages/app/src/kernel/lock.ts:18-37`).

## Unhappy paths

- Second instance on the same data dir → "Slopify is already running on this data directory (process N)…"; a simultaneous race → "Another Slopify started on this data directory at the same moment…" (`packages/app/src/kernel/lock.ts:20-36`).
- Any boot failure after the lock (FFmpeg, migration, files location, listen) closes the DB, releases the lock and rethrows; the CLI prints a restated message: port in use (`EADDRINUSE`) suggests `--port 7070`/`7071`; `EACCES`/`EPERM` on listen; unowned host address; unwritable data dir; disk full (`packages/app/src/main.ts:808-812`, `packages/app/src/edge/cli.ts:130-160`).
- No FFmpeg build for this platform → "Slopify has no built-in copy of ffmpeg…" (`packages/app/src/adapters/ffmpeg.ts:27-31`).
- Invalid port/host → "Invalid port … use a whole number between 1 and 65535" / "The host setting is empty…" (`packages/app/src/kernel/config/index.ts:27-50`).
- CLI path not a file, not runnable, or failing the probe → 400 with a sentence naming what to enter; nothing saved (`packages/app/src/slices/settings/cli-paths.ts:93-137`, `packages/app/src/edge/http/providers.ts:227-233`).
- Missing CLI or failed readiness → provider not selectable; no provider call happens. A child that aborts or exits non-zero becomes a stage failure through the attempt wrapper (`packages/app/src/slices/settings/cli-status.ts:28-60`, `packages/app/src/kernel/runner/attempt.ts`).
- A timer tick that throws is logged (`batch.queue`, `schedule.tick`, `stage.retry`, `backups.tick`, `trash.purge`) and the timer continues (`packages/app/src/main.ts:657-727`).
- Docker install failure → rollback and "The install/update failed, so Slopify put the previous version back…"; a failed rollback names the recovery volume and `update.json` and asks to rerun (`packages/app/src/edge/docker-install/apply.ts:341-357`).
- Autostart failures are printed, never fatal (`packages/app/src/edge/autostart/prompt.ts:83-86`).

## State transitions

- Process: `not running → booting → serving → stopping → stopped`; `booting → failed` releases the lock (`packages/app/src/main.ts:225-813`).
- Stage at boot: `running → failed(interrupted)`, or `running → pending` for a paused project (`packages/app/src/main.ts:1017-1024`).
- CLI path setting: `PATH lookup ↔ configured absolute path` (`packages/app/src/slices/settings/cli-paths.ts:101-137`).
- Docker installation record: `update.json` phases `stopping → snapshot → starting`, then `install.json` written and `activation.json` `committed: false → true`; failure → rolled back and `update.json` removed (`packages/app/src/edge/docker-install/apply.ts:219-335`).

## Invariants

- Prompts and arguments never pass through a shell (`packages/app/src/kernel/cli-command.ts:9-21`).
- One process per data directory (`packages/app/src/kernel/lock.ts:18-46`).
- Boot never auto-resumes a stage that was interrupted, except projects waiting on a CLI plan limit, which resume to keep waiting (`packages/app/src/main.ts:1015-1016`, `packages/app/src/slices/run-cost/limits.ts:124-127`).
- Storage reconciliation never deletes files during an uncommitted update activation (`packages/app/src/main.ts:279-282`).
- Diagnostics carry no provider keys (`packages/app/src/edge/http/diagnostics.ts:5-9`).
- The Docker port is bound to loopback on the host; the native default host is `127.0.0.1` (`compose.yaml:18-19`, `packages/app/src/kernel/config/index.ts:21`).

## Outcomes & side effects

- Boot writes the lock file, logs, database (migrations, interrupted stages, settled schedule runs), files-location setting and folders, possibly an FFmpeg download under `<data-dir>/bin`, the sample projects, and the autostart entry refresh; it starts the HTTP server and timers (`packages/app/src/main.ts:241-749`).
- Shutdown aborts running provider work and leaves it `failed(interrupted)` for the next boot to report (`packages/app/src/main.ts:782`, `packages/app/src/main.ts:1017-1024`).
- Docker commands change containers, volumes (recovery snapshot), the projects folder, the host-CLI user service and the login entry record (`packages/app/src/edge/docker-install/run.ts:92-161`).

## Dimensions not in play

- D1 Authority: no login; any client reaching the port controls the app, which is why the default bind is loopback (`packages/app/src/edge/cli.ts:106-110`).
- D5 Money: boot, CLI and recovery charge nothing; no provider generation is needed to declare a CLI ready.
- D13 Notification: no remote notification for boot failures; only terminal output and logs.
- D15 Audit: boot counts are written to the app log (`boot` line); no separate audit trail.
