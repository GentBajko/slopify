---
generated_at_commit: e9226a34aa8a
generated_date: 2026-10-02
capstone_version: 7.0.1
content_hash: d2a54fd82b6c
paths_covered:
  - ":(top)Dockerfile"
  - ":(top)compose.yaml"
  - ":(top)biome.json"
  - ":(top)packages/app/package.json"
  - ":(top)packages/app/scripts/copy-assets.mjs"
  - ":(top)packages/app/src/edge/cli.ts"
  - ":(top)packages/app/src/edge/cli-args.ts"
  - ":(top)packages/app/src/edge/docker.ts"
  - ":(top)packages/app/src/edge/host-cli.ts"
  - ":(top)packages/app/src/edge/docker-install/**"
  - ":(top)packages/app/src/edge/autostart/docker.ts"
  - ":(top)packages/app/src/edge/autostart/docker-record.ts"
  - ":(top)packages/app/src/edge/autostart/index.ts"
  - ":(top)packages/app/src/edge/autostart/model.ts"
  - ":(top)packages/app/src/edge/autostart/service.ts"
  - ":(top)packages/app/src/edge/http/app.ts"
  - ":(top)packages/app/src/edge/http/autostart.ts"
  - ":(top)packages/app/src/edge/http/folder-location.ts"
  - ":(top)packages/app/src/edge/http/folder-location-schema.ts"
  - ":(top)packages/app/src/edge/http/open-folder.ts"
  - ":(top)packages/app/src/edge/http/revision-files.ts"
  - ":(top)packages/app/src/edge/http/update.ts"
  - ":(top)packages/app/src/host-cli/open-folder.ts"
  - ":(top)packages/app/src/adapters/host-cli/index.ts"
  - ":(top)packages/app/src/updater/candidate.ts"
  - ":(top)packages/app/src/updater/service.ts"
  - ":(top)packages/app/src/slices/storage/files-location.ts"
  - ":(top)packages/app/src/slices/storage/reconcile.ts"
  - ":(top)packages/app/src/slices/backups/folder.ts"
  - ":(top)packages/app/src/main.ts"
  - ":(top)packages/web/src/project/open-folder.tsx"
  - ":(top)packages/web/src/project/revision-api.ts"
  - ":(top)packages/web/src/autostart/**"
  - ":(top)packages/web/src/main.tsx"
  - ":(top)packages/web/vite.config.ts"
---

# Docker install, storage and folder access

Scope: the `--docker` installer (compose-based install/update transaction, private state, recovery volumes, legacy adoption), the container's activation handshake, host folder access for projects and backups, and Docker start-at-login reporting. Provider execution and the host-helper socket protocol belong to their own modules.

## Layers

| Layer | Directories/files | Observed dependency direction |
| --- | --- | --- |
| CLI entry | `packages/app/src/edge/{cli,cli-args}.ts` | Parses flags, then dynamically imports `docker-install/run.js` for `--docker` / `install --docker` / `update` on a Docker install (`packages/app/src/edge/cli.ts:34`, `:55`). |
| Host checks and host-CLI bridge setup | `packages/app/src/edge/docker.ts` | Imports `host-cli/{install,paths,service,status}`; decides and installs the bridge before any Docker change (`packages/app/src/edge/docker.ts:46`, `:108`). |
| Installer orchestration | `packages/app/src/edge/docker-install/run.ts` | Composes host checks, `planDockerHostCli`, `applyDocker`, `dockerEngine` and `recordLoginStart` (`packages/app/src/edge/docker-install/run.ts:28`). |
| Install transaction | `packages/app/src/edge/docker-install/apply.ts` | Imports `Engine` (interface), `state.ts` and `tree.ts`; no subprocess code (`packages/app/src/edge/docker-install/apply.ts:19`, `:92`). |
| State and filesystem checks | `docker-install/{state,tree}.ts` | Zod schemas, private reads/writes (via `host-cli/service.js`), path safety, digests (`packages/app/src/edge/docker-install/state.ts:32`, `packages/app/src/edge/docker-install/tree.ts:29`). |
| Docker command adapter and image helper | `docker-install/{engine,volume}.ts` | `dockerEngine` runs `docker` through `HostSetupRunner.exec`; the fixed helper `volume.js` runs inside the image (`packages/app/src/edge/docker-install/engine.ts:138`, `packages/app/src/edge/docker-install/volume.ts:7`). |
| Container runtime | `docker-install/activation.ts`, `packages/app/src/main.ts`, `packages/app/src/updater/candidate.ts` | Boot imports activation checks, the files layout and folder configuration (`packages/app/src/main.ts:20`). |
| HTTP | `packages/app/src/edge/http/` | Folder routes resolve registered files, then `replyForFolder`; autostart routes read the Docker record (`packages/app/src/edge/http/folder-location.ts:12`, `packages/app/src/edge/http/autostart.ts:12`). |
| Browser | `packages/web/src/project/`, `packages/web/src/autostart/` | Imports the browser-safe `folderReplySchema` and `AutostartView` type only (`packages/web/src/project/open-folder.tsx:1`, `packages/web/src/autostart/api.ts:1`). |

Enforced import rules forbid kernel → edge/slices, slices → edge and adapters → edge (`biome.json:44`, `biome.json:70`, `biome.json:99`); all installer modules live under `edge/`. `host-cli/open-folder.ts` imports `edge/docker-install/state.js` to read `install.json` (`packages/app/src/host-cli/open-folder.ts:4`); `host-cli/` has no enforced rule.

## Module boundaries

| Module | Public surface and boundary |
| --- | --- |
| `edge/docker.ts` | `assertManagedDockerHost` (Linux, non-root uid) and `planDockerHostCli` → `{enabled:false}` or `{enabled:true, ensure}`; consent stored in `<XDG_DATA_HOME>/slopify/host-cli/consent.json` as `{version:1, automaticStartup:true}` (`packages/app/src/edge/docker.ts:11`, `:46`, `:70`). The bridge is a systemd user service `slopify-cli-bridge.service`; no systemd user bus → error (`packages/app/src/edge/docker.ts:96`). |
| `docker-install/run.ts` | `runDockerCommand(DockerCommand)`, `hasDockerInstall(env)` (checks `install.json` or legacy `receipt.json`), `documentsProjects` (`packages/app/src/edge/docker-install/run.ts:28`, `:175`, `:189`). Validates `--port`/`SLOPIFY_DOCKER_HOST_PORT`, `SLOPIFY_DOCKER_NAME`, `SLOPIFY_DOCKER_VOLUME`; `--projects-dir documents` resolves to `<Documents>/Slopify[/<name>]/Projects` (`packages/app/src/edge/docker-install/run.ts:35`, `:45`, `:54`). |
| `docker-install/apply.ts` | `applyDocker(ApplyOptions, Engine) → ApplyResult {url, projects, backups, changed, recovery, removed, problems}` and `composeEnv` (`packages/app/src/edge/docker-install/apply.ts:69`, `:92`, `:567`). |
| `docker-install/state.ts` | `installSchema` (v2), `updateSchema` (v2), legacy 2.5.0 `legacyReceiptSchema`/`legacyJournalSchema`, `dockerRoot`, `privateDirectory`, `readState`, `writeState`, `writeText` (≤64 KiB, then directory fsync) (`packages/app/src/edge/docker-install/state.ts:32`, `:58`, `:88`, `:103`, `:135`, `:161`). |
| `docker-install/tree.ts` | `identity`, `contains`, `safePath`, `treeDigest`, `privateTree`, `syncDirectory` (`packages/app/src/edge/docker-install/tree.ts:15`, `:29`, `:100`, `:173`). |
| `docker-install/engine.ts` | `Engine` interface, `dockerEngine`, `recoveryId`, `dockerFailure` (plain-language mapping of Docker stderr) (`packages/app/src/edge/docker-install/engine.ts:32`, `:73`, `:82`, `:138`). |
| `docker-install/volume.ts` | `volumeOperation` with five fixed operations (below) (`packages/app/src/edge/docker-install/volume.ts:7`). |
| `docker-install/activation.ts` | `dockerActivationCommitted`, `dockerFilesLayout`, `dockerFolderConfiguration` (`packages/app/src/edge/docker-install/activation.ts:17`, `:27`, `:38`). |
| `edge/autostart/{docker,docker-record}.ts` | `inspectDockerStart` (reads Docker Desktop settings files or `systemctl [--user] is-enabled docker.service`; never changes them), `recordLoginStart`, `loginStartSchema` (`packages/app/src/edge/autostart/docker.ts:13`, `:116`, `packages/app/src/edge/autostart/docker-record.ts:20`). |
| Folder HTTP | `openFolderRoutes`, `revisionFolderRoutes`, `replyForFolder`, `folderReplySchema` (`packages/app/src/edge/http/open-folder.ts:10`, `packages/app/src/edge/http/revision-files.ts:60`, `packages/app/src/edge/http/folder-location-schema.ts:5`). |
| Host folder opener | `createHostFolderOpener` opens only folders inside a recorded `install.json` `projects` whose dev/ino still match `projectsIdentity` (`packages/app/src/host-cli/open-folder.ts:42`). |

## Entry points

| Entry | Dispatch |
| --- | --- |
| Published `slopify` executable | `packages/app/package.json:17` → `dist/edge/cli.js`; parsing at `packages/app/src/edge/cli.ts:13`. |
| `--docker`, `install --docker`, `update` on a Docker install | `packages/app/src/edge/cli.ts:34`–`:66` → `runDockerCommand` (`packages/app/src/edge/docker-install/run.ts:28`). `install` without `--docker` is rejected (`packages/app/src/edge/cli.ts:29`). |
| Image volume helper | `packages/app/src/edge/docker-install/volume.ts:75` runs `volumeOperation(process.argv.slice(2))`, prints JSON. |
| Container application | `Dockerfile:61` runs `node packages/app/dist/edge/cli.js --no-open`; `boot` at `packages/app/src/main.ts:225`. |
| Compose service | `compose.yaml:10` (service `slopify`); the installer copies it to the installation folder and runs `docker compose up` (`packages/app/src/edge/docker-install/apply.ts:279`, `:304`). The package ships it as `dist/compose.yaml` (`packages/app/scripts/copy-assets.mjs:8`). |
| Optional host helper | `packages/app/src/edge/host-cli.ts:17` parses `--state-dir`, wires the folder opener at `:62`, starts the server at `:50`. |
| Browser | `packages/web/src/main.tsx:40` mounts the SPA. |

CLI flag rules: `--projects-dir`, `--host-cli`, `--accept-host-cli` require Docker; `--host-cli=off` is the only value; `--host`/`--data-dir` are rejected with Docker; `--autostart`/`--no-autostart` pass through (`packages/app/src/edge/cli.ts:38`–`:65`, `packages/app/src/edge/cli-args.ts:3`).

## Communication

### Installation folder and records

`dockerRoot` is `<XDG_DATA_HOME or ~/.local/share>/slopify/docker`; each installation is `<root>/<name>`, created as a private (0700, owned) directory chain (`packages/app/src/edge/docker-install/state.ts:103`, `:107`).

| File in `<root>/<name>` | Content; sites |
| --- | --- |
| `update.lock` | O_EXCL file holding the installer PID; a stale lock of a dead PID is removed (`packages/app/src/edge/docker-install/apply.ts:579`). |
| `install.json` | `Install` v2: `name, volume, daemon, image, appVersion, user, port, projects, projectsIdentity{dev,ino}, backups?, hostCli, token, recovery` (`packages/app/src/edge/docker-install/state.ts:32`); written after the candidate is ready (`packages/app/src/edge/docker-install/apply.ts:326`). |
| `update.json` | `Update` v2: `id, phase ("stopping"\|"snapshot"\|"starting"), image, previous (none \| compose{env,activation} \| legacy{id,name,renamed,running,restart}), backup, backupDigest, published` (`packages/app/src/edge/docker-install/state.ts:58`); exists only during a transaction (`packages/app/src/edge/docker-install/apply.ts:251`, `:332`). |
| `compose.yaml`, `.env` | Copied compose file; `.env` of single-quoted `SLOPIFY_NAME, SLOPIFY_IMAGE, SLOPIFY_USER, SLOPIFY_PORT, SLOPIFY_VOLUME, SLOPIFY_PROJECTS_DIR, SLOPIFY_BACKUPS_DIR?, SLOPIFY_HOST_CLI_SHARE, SLOPIFY_ACTIVATION_DIR, SLOPIFY_UPDATE_TOKEN=<redacted>, SLOPIFY_UPDATE_PENDING=1` (`packages/app/src/edge/docker-install/apply.ts:287`, `:567`). |
| `activation/activation.json` | `{version:1, token, committed:boolean}`; mounted read-only at `/opt/slopify-install` (`packages/app/src/edge/docker-install/apply.ts:282`, `:327`, `compose.yaml:44`). |
| `activation/login-start.json` | `LoginStart {version:1, checkedAt, docker:"yes"\|"no"\|"unknown", manager:"system"\|"rootless", wanted:boolean\|null, platform?, desktop?}` (`packages/app/src/edge/autostart/docker.ts:13`, `packages/app/src/edge/autostart/docker-record.ts:35`). |
| `host-cli-off/` | Empty folder mounted as `/opt/slopify-host` when the bridge is off (`packages/app/src/edge/docker-install/apply.ts:280`). |
| `journal.json`, `receipt.json` | 2.5.0 launcher records, read only for adoption (`packages/app/src/edge/docker-install/apply.ts:469`, `:478`). |

`readState` rejects any record that is not a regular, singly linked, owner-only file of the installing uid, and reports malformed JSON as damaged (`packages/app/src/edge/docker-install/state.ts:135`).

### Compose service contract

`compose.yaml` declares project `${SLOPIFY_NAME:-slopify}`, `restart: unless-stopped`, user `${SLOPIFY_USER}`, port `127.0.0.1:${SLOPIFY_PORT-6969}:6969`, mounts `data` (external volume `${SLOPIFY_VOLUME:-slopify-data}`) at `/data`, `${SLOPIFY_PROJECTS_DIR}` at `/data/projects`, `${SLOPIFY_BACKUPS_DIR:-./backups-off}` at `/data/backups`, the host-CLI share read-only at `/opt/slopify-host`, the activation folder read-only at `/opt/slopify-install`; environment `SLOPIFY_DOCKER_PROJECTS_DIR`, `SLOPIFY_DOCKER_BACKUPS_DIR`, `SLOPIFY_HOST_CLI_DIR`, `SLOPIFY_DOCKER_INSTALL_STATE=/opt/slopify-install/activation.json`, `SLOPIFY_UPDATE_TOKEN`, `SLOPIFY_UPDATE_PENDING`; healthcheck `GET /api/health` (`compose.yaml:7`–`:71`). The image sets `HOME=/data/home`, `SLOPIFY_CONTAINER=1`, `SLOPIFY_DISABLE_UPDATES=1`, `SLOPIFY_NO_OPEN=1`, a bundled subtitle model seed, `USER node`, `VOLUME /data` (`Dockerfile:21`, `:51`, `:56`).

### Engine → Docker

`Engine` methods (all `Promise`): `context(uid,gid)→{daemon,user}`, `image(ref)`, `imageVersion(ref)→string`, `inspect(name)→Container|null`, `legacyPrevious(name)`, `volumeExists`, `createVolume`, `volumeProjects(image,volume)→Digest|null`, `copyVolumeProjects`, `snapshot(image,volume,backup,labels)→Digest`, `restore(image,backup,volume,expected)`, `own(image,volume,user)`, `recoveryVolumes(volume)→RecoveryVolume[]`, `removeVolume`, `removeContainer`, `stop`, `start`, `rename`, `restartPolicy`, `compose(directory,name,args)`, `ready(id, {token,version}|null)`, `busy(id)→boolean|null` (`packages/app/src/edge/docker-install/engine.ts:32`). `Container` is `{id, name, image, user, running, restart, project, launcher, mounts[], port}` (`packages/app/src/edge/docker-install/engine.ts:8`).

- `context` accepts only a local `unix://` endpoint, rejects Docker Desktop and rootful `userns-remap`, requires `docker compose version`; rootless → user `0:0`, rootful → host `uid:gid` (`packages/app/src/edge/docker-install/engine.ts:207`–`:249`).
- `image` pulls when missing or when the ref ends `:latest`; `imageVersion` reads the image's package version in a network-less read-only run (`packages/app/src/edge/docker-install/engine.ts:251`, `:261`).
- `compose` runs `docker compose --project-directory <dir> --file <dir>/compose.yaml --env-file <dir>/.env --project-name <name> …` (`packages/app/src/edge/docker-install/engine.ts:419`).
- `ready` `docker exec`s a Node probe for up to 120 s: `GET /api/health` and, with a token, `GET /api/update/ready` with `X-Slopify-Update-Token`, both `status:"ok"` and matching `version` (`packages/app/src/edge/docker-install/engine.ts:433`).
- `busy` `docker exec`s `GET /api/update` and reads `busy` (`packages/app/src/edge/docker-install/engine.ts:464`).

### Fixed image-helper operations

The helper runs `docker run --rm --network none --read-only --user 0:0` (tmpfs `/data` unless mounted) with entrypoint `node …/edge/docker-install/volume.js <operation> <user>` (`packages/app/src/edge/docker-install/engine.ts:105`, `:155`).

| Operation | Filesystem input | JSON stdout |
| --- | --- | --- |
| `projects` | read-only `/source` | `{exists:false}` or `{exists:true, digest}` of `/source/projects` (`packages/app/src/edge/docker-install/volume.ts:9`) |
| `private` | read-only `/source` | `Digest` excluding top-level `projects` (`packages/app/src/edge/docker-install/volume.ts:17`) |
| `snapshot` | read-only `/source`, empty `/backup` | `Digest` after `cp -a` with before/copy/after agreement and `sync` (`packages/app/src/edge/docker-install/volume.ts:18`) |
| `restore` | read-only `/source` (recovery), `/data` | `Digest`; replaces everything except `projects`, restores root owner/mode, verifies hash (`packages/app/src/edge/docker-install/volume.ts:30`) |
| `own` | `/data`, `user` `uid:gid` | `{ok:true}`; chowns/chmods private entries (0700/0600), skips `projects`, creates `/data/home` (`packages/app/src/edge/docker-install/volume.ts:52`) |

Unknown operations throw; the wrapper prints a generic failure and exits 1 (`packages/app/src/edge/docker-install/volume.ts:73`, `:78`). Volume project copying uses a stopped `slopify-reader-<id>` container and `docker cp`, removed in `finally` (`packages/app/src/edge/docker-install/engine.ts:320`).

### HTTP contracts

| Route | Request | Response; sites |
| --- | --- | --- |
| `GET /api/health` | — | `{status:"ok", version, uptimeMs}` (`packages/app/src/edge/http/app.ts:168`); probed by `ready` and the compose/Dockerfile healthchecks. |
| `GET /api/update/ready` | `X-Slopify-Update-Token` | `{status:"ok", version}` or 403 (`packages/app/src/edge/http/update.ts:19`). |
| `POST /api/update/activate` | `X-Slopify-Update-Token` | `{status:"ok", version}`, 403 or 409 (`packages/app/src/edge/http/update.ts:25`). The Docker installer does not call it; it flips `activation.json` and the in-process watcher activates. |
| `GET /api/update` | — | `UpdateInfo` incl. `busy` (`packages/app/src/edge/http/update.ts:33`). In the container `unsupported()` returns the terminal-update sentence (`packages/app/src/main.ts:435`). |
| `POST /api/projects/:id/open-folder` | `{asset}` (`[a-z0-9-]+` or `images.zip`); optional `Origin` must match | `200 FolderReply`, `400/403/404/503` (`packages/app/src/edge/http/open-folder.ts:10`); client `packages/web/src/project/open-folder.tsx:28`. |
| `POST /api/projects/:id/revisions/:revisionId/:recordId/open-folder` | path ids | `200 FolderReply` or problems (`packages/app/src/edge/http/revision-files.ts:60`); client `packages/web/src/project/revision-api.ts:234`. |
| `GET/PUT /api/settings/autostart`, `POST /api/settings/autostart/answer` | PUT `{enabled:boolean}` | `AutostartView`; in Docker PUT always returns 409 with where Docker's own setting is (`packages/app/src/edge/http/autostart.ts:17`, `packages/app/src/edge/autostart/service.ts:82`). |

`FolderReply` is `{opened:true}` | `{opened:true, location:"docker-host", path}` | `{opened:false, location:"docker-host", path}` (`packages/app/src/edge/http/folder-location-schema.ts:5`). In a container `replyForFolder` verifies the file lies under `/data/projects` through real directories, maps it to `hostProjects/<dir>`, asks the host helper to open it (10 s timeout), and returns the host path either way; no configured host folder → 503 (`packages/app/src/edge/http/folder-location.ts:19`–`:65`). The host helper call is `POST /v1/open-folder` over the bridge socket (`packages/app/src/adapters/host-cli/index.ts:88`). Backup folder paths map through `hostFolder` over both the projects and backups binds (`packages/app/src/slices/backups/folder.ts:45`).

While `installationPending()` (the updater is locked) every non-GET `/api/*` request except `/api/update/activate` returns 503 (`packages/app/src/edge/http/app.ts:237`, `packages/app/src/main.ts:613`, `packages/app/src/updater/service.ts:53`).

There is no Docker-specific websocket, SSE event, broker or queue.

## Composition

### Install / update transaction (`applyDocker`)

1. Take `update.lock`; if `update.json` exists, roll it back first (`packages/app/src/edge/docker-install/apply.ts:95`, `:113`).
2. Refuse a mismatched `install.json` name/volume, a different Docker daemon ID, `update` with nothing installed, or an existing container whose `/data` is not the named volume (`packages/app/src/edge/docker-install/apply.ts:122`–`:142`).
3. Adopt a pre-compose installation: an unfinished 2.5.0 journal blocks; a container owned by another compose project blocks; a non-bind `/data/projects` blocks (`packages/app/src/edge/docker-install/apply.ts:464`).
4. Choose folders: explicit `--projects-dir`, else recorded/adopted projects, else `<Documents>/Slopify[/<name>]/Projects` (or `~/Slopify/...` without Documents). Only a brand-new install on the Documents default gets `Backups` beside `Projects` (`packages/app/src/edge/docker-install/apply.ts:144`–`:161`). `safePath` refuses system/shared folders, the state root, links and group/world-writable parents; a new destination must be empty; source and destination cannot contain each other (`packages/app/src/edge/docker-install/tree.ts:29`, `packages/app/src/edge/docker-install/apply.ts:170`, `:555`).
5. Pull the image and require its version to equal the installer's (`packages/app/src/edge/docker-install/apply.ts:182`).
6. No-op path: same image, version, user, folders, port and bridge → start if stopped, `ready`, ensure the bridge, return `changed:false` (`packages/app/src/edge/docker-install/apply.ts:189`).
7. Wait while `busy` (5 s poll), then `hostCli.ensure()` (`packages/app/src/edge/docker-install/apply.ts:215`, `:450`).
8. Write `update.json` (phase `stopping`); stop the old compose service, or for legacy set restart `no`, stop and rename to `<name>-previous-<id>` (`packages/app/src/edge/docker-install/apply.ts:251`).
9. Create the volume if missing, else phase `snapshot` into `<volume>-recovery-<id>` labelled `io.slopify.transaction` / `io.slopify.container` (`packages/app/src/edge/docker-install/apply.ts:259`).
10. Publish projects when the folder changes: copy host folder (digest-verified) or volume-held projects into `.slopify-projects-<id>`, then rename into place (`packages/app/src/edge/docker-install/apply.ts:500`).
11. `own` the volume on first install or user change; write `compose.yaml`, `activation.json {committed:false}`, `.env`; phase `starting`; `compose up --detach --force-recreate --no-build --pull never`; `ready` with token and version (`packages/app/src/edge/docker-install/apply.ts:277`–`:308`, `:80`).
12. Commit: write `install.json`, flip `activation.json` to `committed:true`, delete `update.json`, then `tidyUp` removes stopped legacy containers and older recovery volumes of this container; tidy failures become `problems` (`packages/app/src/edge/docker-install/apply.ts:326`–`:333`, `:402`).

### Recovery

Any failure runs `rollback`: stop the compose candidate (or remove a non-legacy occupant); in phase `starting` restore the private data from the recovery volume after re-verifying its digest; remove only the published folder whose dev/ino still match; restore the previous `.env` and `activation.json` and `compose up`, or rename/restart-policy/start the legacy container (`packages/app/src/edge/docker-install/apply.ts:361`, `packages/app/src/edge/docker-install/engine.ts:354`). A rollback failure keeps `update.json` and names the recovery volume; the next run finishes the undo (`packages/app/src/edge/docker-install/apply.ts:343`). SIGINT/SIGTERM abort through one `AbortController` (`packages/app/src/edge/docker-install/run.ts:63`). The newest recovery volume is kept after each commit (`packages/app/src/edge/docker-install/apply.ts:431`).

### Container activation

At boot the container requires `SLOPIFY_DOCKER_INSTALL_STATE` to be exactly `/opt/slopify-install/activation.json` inside a container (`packages/app/src/main.ts:229`). A pending candidate (`SLOPIFY_UPDATE_PENDING=1` and a valid token) defers storage reconciliation and sample seeding (`packages/app/src/main.ts:239`, `:282`, `:580`). `watchActivation` polls `updater.activate` every 250 ms; the committed check is `dockerActivationCommitted` (timing-safe token compare against the private marker); after 120 s uncommitted the candidate shuts itself down; on commit, deferred reconciliation runs (`packages/app/src/updater/candidate.ts:3`, `packages/app/src/main.ts:406`, `:411`, `:803`, `packages/app/src/edge/docker-install/activation.ts:17`).

Files layout in a container: projects `/data/projects`; backups `/data/backups` when `SLOPIFY_DOCKER_BACKUPS_DIR` is set, else `/data/projects/<backupsFolderName>`; no exports folder (`packages/app/src/edge/docker-install/activation.ts:27`, `packages/app/src/main.ts:257`). `dockerFolderConfiguration` returns host paths only when the projects bind is a real mount at `/data/projects` (per `/proc/self/mountinfo`) and the paths are absolute, normalized and comma-free (`packages/app/src/edge/docker-install/activation.ts:38`). The files service reports the host folder and refuses to move it from inside the container, pointing at `npx @gentbajko/slopify@latest update --docker --projects-dir documents` (`packages/app/src/slices/storage/files-location.ts:180`, `:332`). A files move leaves out the `.render-cache` folder (`renderCacheFolder`, the video clip caches) at the top of the projects folder (`packages/app/src/slices/storage/files-location.ts:418`, `packages/app/src/slices/storage/layout.ts:12`). The host projects folder is application-managed storage subject to reconciliation (`packages/app/src/slices/storage/reconcile.ts:14`).

### Start at login

After the transaction, `recordLoginStart` asks once (or takes `--autostart`/`--no-autostart`), inspects whether Docker starts by itself, and writes `login-start.json`; failures only warn (`packages/app/src/edge/docker-install/run.ts:129`). Inside the container `createAutostart` uses the `docker` source reading `/opt/slopify-install/login-start.json` (`packages/app/src/edge/autostart/index.ts:23`); the view is `available:false` with `howTo` text and `set` always throws `AutostartRefusal` (`packages/app/src/edge/autostart/service.ts:38`, `:82`).

## Frontend

Docker adds no page or bundle; folder and autostart UI render inside the client SPA (`packages/web/src/main.tsx:40`, `packages/web/vite.config.ts:13`). `OpenFolder` posts to the folder routes, validates `FolderReply`, and when `location:"docker-host"` without `opened` shows `dockerFolderHelp` and the read-only host path (`packages/web/src/project/open-folder.tsx:28`, `:36`, `:100`). Settings → General renders `AutostartSettings`; the shell calls `useInstallKind` to remember native vs Docker for the "not responding" message and renders `AutostartReminder` (`packages/web/src/autostart/use-install-kind.ts:10`, `packages/web/src/autostart/api.ts:14`).
