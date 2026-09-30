---
generated_at_commit: 54f5cb4c1dab
generated_date: 2026-09-30
capstone_version: 7.0.1
content_hash: ed8e58f16534
paths_covered:
  - ":(top)packages/app/src/updater/**"
  - ":(top)packages/app/src/edge/http/update.ts"
  - ":(top)packages/app/src/edge/http/app.ts"
  - ":(top)packages/app/src/edge/update-worker.ts"
  - ":(top)packages/app/src/edge/native-update.ts"
  - ":(top)packages/app/src/edge/cli.ts"
  - ":(top)packages/app/src/edge/docker-install/apply.ts"
  - ":(top)packages/app/src/edge/docker-install/engine.ts"
  - ":(top)packages/app/src/edge/docker-install/activation.ts"
  - ":(top)packages/app/src/main.ts"
  - ":(top)packages/web/src/updates/**"
  - ":(top)Dockerfile"
---

# In-app updater, native `update` command and "updates never during jobs"

## Trigger & preconditions

- Triggers: the update icon in the shell footer (`UpdateWidget`), the tab's periodic status poll, `npx @gentbajko/slopify@latest update` on a native install (which drives the same HTTP API), and the same command on a Docker install (which replaces the container) (`packages/web/src/components/shell.tsx:438`, `packages/web/src/updates/widget.tsx:9`, `packages/app/src/edge/cli.ts:33-37`, `packages/app/src/edge/cli.ts:68-77`).
- Preconditions for installing from the app: `SLOPIFY_DISABLE_UPDATES` is not `1` (the Docker image sets it), the running entry `edge/cli.js` and `edge/update-worker.js` exist, and npm was found at boot; otherwise `unsupported()` returns the reason and `canUpdate` is false (`packages/app/src/main.ts:385-395`, `packages/app/src/main.ts:433-440`, `Dockerfile:28`).
- A newer stable version must be published under the npm `latest` tag (`packages/app/src/updater/registry.ts:9-19`, `packages/app/src/updater/model.ts:40-57`).

## Steps

1. **Check.** `GET /api/update` (`?refresh=1` forces) calls `check()`. While `installing`, `restarting` or `waiting` it returns the current info without a network call; concurrent checks share one; a non-forced check within 15 minutes of the last reuses the cached result. Otherwise it fetches `https://registry.npmjs.org/@gentbajko%2Fslopify/latest` (10 s timeout, `redirect: "error"`), requires `name === "@gentbajko/slopify"` and a stable `X.Y.Z` version (≤ 50 chars) (`packages/app/src/updater/service.ts:120-147`, `packages/app/src/updater/registry.ts:4-19`, `packages/app/src/edge/http/update.ts:33-40`). With updates disabled, `latest()` returns the running version, so nothing is ever available (`packages/app/src/main.ts:429-432`).
2. **Info.** `available` = latest is numerically newer (per-segment BigInt compare); `busy` = work in progress or an admitted HTTP mutation; `blockedReason` = `unsupported()` ?? "An update is already in progress." (installing/restarting) ?? "An update is already waiting for running work to finish."; `canUpdate = available && no blockedReason`; `pendingVersion` while waiting; `waitingFor` = the busy project/schedule name (`packages/app/src/updater/service.ts:52-80`, `packages/app/src/updater/model.ts:5-19`, `packages/app/src/updater/model.ts:46-57`).
3. **Work in progress rule** (`workInProgress`, the "updates never during jobs" gate). For each project not in the trash: in-flight in the runner → busy; paused → skipped; derived state `running` (a step running or waiting to retry) → busy; derived `pending` with `revision_work` in `pending`/`running` and `dispatch_state='allowed'` → busy. Work held for a person (a review checkpoint) does not count. Then: a `project_queue` row `queued`/`active` for a non-trashed, non-paused project; a `narration_retries` row `pending`; a non-deleted schedule that is `active` with `next_run_at` within the next 10 minutes, or whose topic generation started and has neither finished nor failed since. The first match's title/name is returned (`packages/app/src/updater/work-in-progress.ts:5-74`, `packages/app/src/main.ts:442-446`).
4. **Start.** `POST /api/update` (same-origin only): `start()` returns 409 if installing/restarting/waiting; clears the remembered install error; forces a registry check; refuses with 409/503/400 when not `canUpdate`, the check errored, or no newer version. After the registry await it re-reads `busyNow()`: busy → `wait(version)` (status `waiting`), idle → `install(version)` (status `installing`); answers 202 with the info (`packages/app/src/updater/service.ts:194-210`, `packages/app/src/edge/http/update.ts:60-86`).
5. **Waiting.** Every 5 s the watcher looks at `busyNow()`; any busy look resets the counter; two idle looks in a row stop the watcher and call `install(version)` (`packages/app/src/updater/service.ts:27-28`, `packages/app/src/updater/service.ts:98-119`). `DELETE /api/update` (same-origin only) cancels a waiting update back to `idle`; 409 when none waits (`packages/app/src/updater/service.ts:211-218`, `packages/app/src/edge/http/update.ts:41-59`).
6. **Launch worker.** `install` → `launchUpdate` validates the plan (`token` 64 hex, `version`/`previousVersion` stable, `oldEntry`, `dataDir`, `cwd`, `host`, `port` 1–65535, npm command), writes `updates/plan-<uuid>.json` (0600), spawns `edge/update-worker.js` detached with an IPC channel, and deletes the plan file when the worker exits (`packages/app/src/main.ts:448-468`, `packages/app/src/updater/install.ts:8-58`, `packages/app/src/updater/plan.ts:24-34`). The worker reads and deletes the plan and requires a connected parent (`packages/app/src/edge/update-worker.ts:5-10`).
7. **Install package.** The worker writes a private `.npmrc` (npmjs registry for `@gentbajko`) and an empty global npmrc in `<data-dir>/updates/<version>`, runs `npm install --prefix <dir> --registry https://registry.npmjs.org/ --no-audit --no-fund --omit=dev --save-exact --global=false --workspaces=false … @gentbajko/slopify@<version>` with a 15-minute timeout and a shared `updates/npm-cache`, and verifies `node_modules/@gentbajko/slopify/package.json` name/version and a readable `dist/edge/cli.js` (`packages/app/src/updater/worker.ts:30-41`, `packages/app/src/updater/worker.ts:129-159`, `packages/app/src/updater/plan.ts:37-98`).
8. **Handoff.** The worker sends `installed`; the app sets `restarting`, runs `shutdown()` (drains mutations, stops timers, aborts running work, closes the DB, releases the lock) and replies `handoff`; the worker waits up to 60 s for it (`packages/app/src/updater/install.ts:40-51`, `packages/app/src/edge/update-worker.ts:11-41`, `packages/app/src/main.ts:752-799`).
9. **Candidate.** `runUpdateFlow`: copy `slopify.db` to `updates/before-<version>-<ms>.db`; spawn the new entry detached with `--host --port --data-dir --no-open` and env `SLOPIFY_SKIP_MANAGED_UPDATE=1`, `SLOPIFY_UPDATE_TOKEN=<token>`, `SLOPIFY_UPDATE_PENDING=1`; poll `GET /api/update/ready` with header `X-Slopify-Update-Token` (1.5 s per try, every 250 ms, 60 s total) until it answers `{status:"ok", version:<new>}` (`packages/app/src/updater/install-flow.ts:17-34`, `packages/app/src/updater/worker.ts:19-78`, `packages/app/src/updater/worker.ts:161-186`, `packages/app/src/updater/readiness.ts:3-20`, `packages/app/src/updater/plan.ts:67-82`).
10. **Candidate boot.** With a valid token and `SLOPIFY_UPDATE_PENDING=1` the candidate starts in `restarting` (locked), defers storage reconciliation and skips sample seeding; `/ready` answers only for the matching token (constant-time compare) (`packages/app/src/main.ts:238-240`, `packages/app/src/main.ts:282`, `packages/app/src/main.ts:580`, `packages/app/src/updater/service.ts:33-34`, `packages/app/src/updater/service.ts:148-152`, `packages/app/src/edge/http/update.ts:19-24`).
11. **Prune, then commit.** Before the pointer: remove every `updates/<X.Y.Z>` except the new and previous versions and every `before-*.db` except this run's backup; refuses to prune unless that backup is a regular file in `updates/`; a prune failure is logged and does not block. Then `activateUpdate` re-verifies the installed entry and atomically writes `updates/current.json` = `{version, token}` (0600, temp + rename) (`packages/app/src/updater/install-flow.ts:35-57`, `packages/app/src/updater/plan.ts:118-161`).
12. **Release.** The worker POSTs `/api/update/activate` with the token (5 s). The candidate's `activate` confirms `updates/current.json` holds its version and token (Docker: `activation.json` `committed: true` with its token), acknowledges, then on the next tick runs deferred `reconcileStorage`; status becomes `idle` after settlement (`packages/app/src/updater/worker.ts:112-121`, `packages/app/src/updater/service.ts:155-184`, `packages/app/src/updater/plan.ts:192-206`, `packages/app/src/edge/docker-install/activation.ts:17-23`, `packages/app/src/main.ts:403-422`). Independently, the candidate polls `activate` every 250 ms for 120 s (`watchActivation`) (`packages/app/src/updater/candidate.ts:3-33`, `packages/app/src/main.ts:803-806`).
13. **Later starts.** `forwardManagedUpdate` reads `updates/current.json`; when its version is newer than the running package and installed, the CLI re-executes that entry with the same argv, forwarding SIGINT/SIGTERM and its exit code. `SLOPIFY_SKIP_MANAGED_UPDATE=1` disables forwarding (`packages/app/src/updater/forward.ts:4-38`, `packages/app/src/updater/plan.ts:100-116`, `packages/app/src/edge/cli.ts:79-84`).
14. **Native `update` command.** Without a Docker install, `slopify update` builds the origin from `--host`/`--port`/env (`0.0.0.0` → `127.0.0.1`), reads `/api/update?refresh=1`, prints "already the newest version" when none is available, polls every 2 s while `busy` (printing once that it waits and Ctrl+C cancels with nothing changed), throws `blockedReason`/`error` when not `canUpdate`, POSTs `/api/update`, then polls until `currentVersion === target` and not `error` (10-minute deadline) (`packages/app/src/edge/cli.ts:68-77`, `packages/app/src/edge/native-update.ts:18-80`).
15. **Docker `update` command.** When `install.json` or `receipt.json` exists under the Docker root, `update` goes to `runDockerCommand({mode:"update"})`; if the container runs, `waitForIdle` polls the container's `/api/update` `busy` every 5 s before anything changes; then it snapshots the volume, starts a candidate with `SLOPIFY_UPDATE_TOKEN`/`SLOPIFY_UPDATE_PENDING=1`, waits up to 120 s for `/api/health` and `/api/update/ready`, writes `install.json` and `activation.json` `committed: true`; any failure rolls back (`packages/app/src/edge/cli.ts:33-37`, `packages/app/src/edge/docker-install/apply.ts:215`, `packages/app/src/edge/docker-install/apply.ts:450-462`, `packages/app/src/edge/docker-install/apply.ts:263-331`, `packages/app/src/edge/docker-install/engine.ts:433-475`). Full Docker install detail: [Docker architecture](../01-architecture-docker.md).
16. **Mutation barrier.** Every non-GET/HEAD/OPTIONS `/api/*` request except `/api/update` and `/api/update/activate` takes `beginMutation()`; while `installing` or `restarting` it is refused with 409 "Slopify is updating…". A Docker candidate with `installationPending` refuses mutations with 503 until committed. Background timers (batch queue, schedule ticks, retry wake-ups, trash purge) also take `beginMutation()` and skip their tick while locked. `X-Slopify-Version` is omitted while locked (`packages/app/src/edge/http/app.ts:229-272`, `packages/app/src/main.ts:657-683`, `packages/app/src/main.ts:180-218`, `packages/app/src/main.ts:717-727`).
17. **Widget.** One icon button (rotating arrows, accent dot when an update is available and nothing is active). Click: cancel while `waiting`; install when `available && canUpdate` and not blocked; otherwise force a check. Label/`sr-only` status text states versions and the action; while waiting it reads "Update to X will install when 'Title' finishes. Click to cancel the update." and a one-time info toast says the same. Poll interval: 5 s while `waiting`, 2 s while checking/installing/restarting or after acceptance, else 15 minutes; refetch on window focus; 20 s request timeout (`packages/web/src/updates/widget.tsx:9-83`, `packages/web/src/updates/use-update.ts:36-52`, `packages/web/src/updates/api.ts:7-47`).
18. **Tab reload.** After acceptance the tab reloads once when status is `idle`/`error` and `currentVersion` differs from the version it accepted from; an unchanged version clears the accepted state. A recovery clock of 120 s (not running while `waiting`) ends "Updating…" with "The update did not finish. Restart Slopify (in Docker, restart the container), reload this page, and try again." (`packages/web/src/updates/use-update.ts:97-139`, `packages/web/src/updates/api.ts:12-14`).

## Branches

- No newer stable version → `canUpdate` false; POST answers 400 "You already have the latest version of Slopify." (`packages/app/src/updater/service.ts:199-205`, `packages/app/src/edge/http/update.ts:81-84`).
- Busy at start → `waiting`, installs on its own after two consecutive idle looks; idle → installs immediately (`packages/app/src/updater/service.ts:206-208`).
- Updater absent from `AppDeps` → GET returns a fixed `unavailable` info ("…cannot update itself from the app…"), POST 409 (`packages/app/src/edge/http/update.ts:7-16`, `packages/app/src/edge/http/update.ts:69-74`).
- Candidate spawned from the old entry (rollback) gets `SLOPIFY_UPDATE_PENDING=0`, `SLOPIFY_UPDATE_FAILED=1`, and boots showing the "did not start" error (`packages/app/src/updater/worker.ts:58-59`, `packages/app/src/updater/service.ts:35-38`).
- npm discovery: `npm-cli.js` next to the Node binary (two layouts) → run through Node; Windows → `npm.cmd` via `cliCommand`; else the first executable `npm` on PATH; none → updates unsupported (`packages/app/src/updater/plan.ts:163-190`).
- `update` target: Docker install present → container update; else native HTTP update (`packages/app/src/edge/cli.ts:33-37`, `packages/app/src/edge/docker-install/run.ts:175-186`).

## Unhappy paths

- Registry failure/invalid metadata → status `error`, "Could not check for updates: the npm registry (registry.npmjs.org) did not answer properly…"; the installation is untouched (`packages/app/src/updater/service.ts:135-139`).
- Install/verification failure before handoff → the serving app is untouched; `install` rejects, status `error`, "The update could not be installed, so Slopify kept your current version…" (`packages/app/src/updater/install-flow.ts:18-20`, `packages/app/src/updater/service.ts:90-96`).
- Handoff refused/timed out (60 s) or parent disconnect → worker exits 1; if `shutdown` itself fails the worker gets `abort` (`packages/app/src/edge/update-worker.ts:14-44`, `packages/app/src/updater/install.ts:44-50`).
- Candidate exits, fails health, or pointer write fails → stop candidate (SIGTERM, SIGKILL after 5 s, give up after 10 s), delete `-wal`/`-shm`, copy the backup over `slopify.db`, start the old entry and wait for its health, log "The update did not start; the previous version and database were restored." (`packages/app/src/updater/install-flow.ts:27-55`, `packages/app/src/updater/worker.ts:79-106`).
- Pointer committed but the acknowledgement is lost → no rollback; the candidate's own watcher reads the pointer and activates; not committed within 120 s → the candidate shuts itself down (`packages/app/src/updater/install-flow.ts:58-60`, `packages/app/src/updater/candidate.ts:18-22`).
- Deferred reconciliation fails after commit → logged, candidate still unlocks; a normal restart retries (`packages/app/src/main.ts:409-421`, `packages/app/src/updater/service.ts:172-182`).
- `/ready` or `/activate` with a wrong/missing token → 403; `/activate` before commit → 409 (`packages/app/src/edge/http/update.ts:19-32`).
- Cross-origin POST/DELETE → 403 "…only be started/changed from the Slopify page itself…" (`packages/app/src/edge/http/update.ts:43-50`, `packages/app/src/edge/http/update.ts:61-68`).
- Native `update` with no app listening → "Slopify isn't running at <origin>…"; no finish within 10 minutes → message pointing at `logs/updates.log` (`packages/app/src/edge/native-update.ts:28-32`, `packages/app/src/edge/native-update.ts:77-79`).
- A browser tab refused by POST re-reads status; a tab stuck in recovery clears after 120 s (`packages/web/src/updates/use-update.ts:77-81`, `packages/web/src/updates/use-update.ts:110-120`).

## State transitions

`UpdateStatus` = `idle | checking | waiting | installing | restarting | error` (`packages/app/src/updater/model.ts:1-3`).

- `idle|error → checking → idle|error` (check).
- `idle → waiting → installing` (start while busy; two idle looks) and `waiting → idle` (cancel).
- `idle → installing → restarting` (start while idle; worker's `installed` message).
- `installing → error` (install rejected).
- Candidate process: `restarting → idle` only after the committed pointer is verified and settlement finishes (`packages/app/src/updater/service.ts:155-184`).
- Forbidden: `check` never leaves `installing`/`restarting`/`waiting`; `start` never runs from those states; mutations never begin while `installing`/`restarting` (`packages/app/src/updater/service.ts:121`, `packages/app/src/updater/service.ts:187-195`).

## Invariants

- An update never installs while a job is going: `install` is reached only through `start()` with `busyNow()` false after the registry await, or through the waiting watcher after two consecutive idle looks (`packages/app/src/updater/service.ts:101-119`, `packages/app/src/updater/service.ts:206-208`); the Docker path waits on the container's `busy` before changing anything (`packages/app/src/edge/docker-install/apply.ts:450-462`).
- Only stable `X.Y.Z` versions are checked, planned, installed, pointed at or pruned (`packages/app/src/updater/model.ts:40-44`, `packages/app/src/updater/plan.ts:24-40`, `packages/app/src/updater/plan.ts:139-160`).
- The candidate proves the 64-hex private token and the expected version before activation; the pointer must name the same token (`packages/app/src/updater/readiness.ts:17-19`, `packages/app/src/updater/plan.ts:192-206`).
- The database is backed up before the candidate starts; storage reconciliation (which deletes files) never runs before the committed pointer is verified (`packages/app/src/updater/install-flow.ts:22-26`, `packages/app/src/main.ts:279-282`).
- Pruning keeps the new and previous installs and this run's rollback database (`packages/app/src/updater/plan.ts:154-160`).
- The candidate's version header is withheld while locked so old tabs do not show the stale-version reload dialog (`packages/app/src/edge/http/app.ts:230-231`).

## Outcomes & side effects

- Success: `<data-dir>/updates/<version>/` package, `updates/before-<version>-<ms>.db`, atomically written `updates/current.json`, lines in `<data-dir>/logs/updates.log`, a detached new server on the same host/port/data dir; future `slopify` starts forward to it; open tabs reload once (`packages/app/src/updater/worker.ts:21-28`, `packages/app/src/updater/plan.ts:118-129`, `packages/web/src/updates/use-update.ts:128-133`).
- Failure: previous package and database restored, the old version restarted with the error surfaced on the next check (`packages/app/src/updater/install-flow.ts:27-33`).
- Network access: npm registry GET per check, npm install traffic per update; no provider keys are sent.

## Dimensions not in play

- D1 Authority: no user accounts; the only guards are same-origin for POST/DELETE and the private token for candidate endpoints (`packages/app/src/edge/http/update.ts:19-68`).
- D5 Money: nothing is charged.
- D13 Notification: no outbound notification; the widget, toasts, terminal output and `logs/updates.log` are the only channels.
- D15 Audit: `logs/updates.log` and the app log are the only records; no database row records updates.
