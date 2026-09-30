---
generated_at_commit: 54f5cb4c1dab
generated_date: 2026-09-30
capstone_version: 7.0.1
content_hash: 8086cd21db9c
paths_covered:
  - ":(top)packages/app/src/edge/docker-install/*.ts"
  - ":(top)packages/app/src/edge/docker.ts"
  - ":(top)packages/app/src/edge/autostart/docker.ts"
  - ":(top)packages/app/src/edge/autostart/docker-record.ts"
  - ":(top)packages/app/src/edge/http/folder-location-schema.ts"
  - ":(top)packages/app/src/edge/http/folder-location.ts"
  - ":(top)packages/app/src/edge/http/open-folder.ts"
  - ":(top)packages/app/src/edge/http/revision-files.ts"
  - ":(top)packages/app/src/edge/http/app.ts"
  - ":(top)packages/app/src/host-cli/open-folder.ts"
  - ":(top)packages/app/src/host-cli/service.ts"
  - ":(top)packages/app/src/kernel/paths.ts"
  - ":(top)packages/app/src/main.ts"
  - ":(top)packages/web/src/project/open-folder.tsx"
  - ":(top)packages/web/src/project/revision-api.ts"
  - ":(top)compose.yaml"
---

# Docker installation models

Scope: the `--docker` installer's private records (install, update, activation, login-start, host-CLI consent, adopted 2.5.0 records), the Docker and filesystem views it computes (container, recovery volume, directory identity, tree digest), the options it runs with, the application's path layout, and the folder reply the HTTP API sends. The installer lives in `packages/app/src/edge/docker-install/`; the 2.5.0-era `edge/docker-projects/` launcher (receipt/journal/transaction directories) no longer exists and is only read back through the legacy schemas below.

## Entities

| Name | Definition site | Storage | Purpose |
|---|---|---|---|
| Install | `packages/app/src/edge/docker-install/state.ts:52` | `<root>/<name>/install.json` (private JSON) | What the last install/update committed; renders compose `.env`, gates host folder opening. |
| Update | `packages/app/src/edge/docker-install/state.ts:85` | `<root>/<name>/update.json` (exists only mid-transaction) | Undo record for an interrupted install/update. |
| LegacyReceipt | `packages/app/src/edge/docker-install/state.ts:88` (`legacyReceiptSchema`, no type alias) | 2.5.0 `receipt.json` (read only) | Adoption input: name, volume, projects path, directory identity. |
| LegacyJournal | `packages/app/src/edge/docker-install/state.ts:91` (`legacyJournalSchema`, no type alias) | 2.5.0 `journal.json` (read only) | Blocks adoption while a 2.5.0 update is unsettled. |
| Activation | `packages/app/src/edge/docker-install/activation.ts:9` (`activationSchema`, no type alias) | `<root>/<name>/activation/activation.json`, bind-mounted read-only at `/opt/slopify-install` | Update handshake: candidate token and committed flag. |
| LoginStart | `packages/app/src/edge/autostart/docker.ts:29` | `<root>/<name>/activation/login-start.json` | Installer's record of whether Docker starts at login. |
| HostCliConsent | `packages/app/src/edge/docker.ts:72` (inline schema, no type alias) | `<XDG_DATA_HOME>/slopify/host-cli/consent.json` | Remembered consent for the host CLI bridge service. |
| Container | `packages/app/src/edge/docker-install/engine.ts:8` | In memory (from `docker container inspect`) | The installer's view of one container. |
| RecoveryVolume | `packages/app/src/edge/docker-install/engine.ts:26` | In memory (from `docker volume inspect`) | A `<volume>-recovery-<uuid>` volume and its labels. |
| Identity | `packages/app/src/edge/docker-install/tree.ts:6` | In memory; embedded in Install and Update | Directory device/inode pair. |
| Digest | `packages/app/src/edge/docker-install/tree.ts:10` | In memory; embedded in Update; helper JSON replies | Tree hash with file and byte counts. |
| DockerCommand | `packages/app/src/edge/docker-install/run.ts:17` | In memory | Parsed `--docker` / `install --docker` / `update --docker` options. |
| ApplyOptions | `packages/app/src/edge/docker-install/apply.ts:35` | In memory | Resolved inputs to `applyDocker`. |
| ApplyResult | `packages/app/src/edge/docker-install/apply.ts:69` | In memory | Outcome printed by the installer. |
| DockerHostOptions | `packages/app/src/edge/docker.ts:26` | In memory | Inputs to the host CLI bridge decision. |
| Paths | `packages/app/src/kernel/paths.ts:4` | In memory | Application filesystem layout. |
| FilesLayout | `packages/app/src/kernel/paths.ts:21` | In memory | Where user-visible files go (projects, backups, exports). |
| FolderReply | `packages/app/src/edge/http/folder-location-schema.ts:10` | HTTP JSON; browser memory | Result of an open-folder request. |

## Fields and types

### Install

Inferred from `installSchema` (strict) (`packages/app/src/edge/docker-install/state.ts:32`).

| Field | Type | Required | Notes |
|---|---|---|---|
| version | 2 | yes | accepted: 2 |
| name | string | yes | `identifier`: `^[a-zA-Z0-9][a-zA-Z0-9_.-]*$`, 1–128. Container and compose project name. |
| volume | string | yes | `identifier`; the external data volume. |
| daemon | string | yes | `docker info` `ID` at install time. |
| image | string | yes | Image reference, non-empty. |
| appVersion | string | yes | `^\d+\.\d+\.\d+$`. |
| user | string | yes | `^\d+:\d+$`; `uid:gid`, or `0:0` under rootless Docker (`packages/app/src/edge/docker-install/engine.ts:249`). |
| port | number | yes | Integer 0–65535; 0 means compose picks a free port. |
| projects | string | yes | `absolute`: canonical absolute path, ≤ 4096, no control characters or commas. |
| projectsIdentity | Identity | yes | Identity of `projects` after the commit. |
| backups | string | no | `absolute`; present on installs from 3.0 that took the Documents default. |
| hostCli | boolean | yes | Host CLI bridge share mounted. |
| token | string | yes | 64 lowercase hex; the committed candidate's token. |
| recovery | string \| null | yes | Recovery volume made by the committing run, or null. |

### Update

Inferred from `updateSchema` (strict) (`packages/app/src/edge/docker-install/state.ts:58`).

| Field | Type | Required | Notes |
|---|---|---|---|
| version | 2 | yes | accepted: 2 |
| id | string | yes | UUID of this run. |
| phase | "stopping" \| "snapshot" \| "starting" | yes | accepted: stopping, snapshot, starting |
| image | string | yes | Image being installed; its volume helper does snapshot and restore. |
| previous | { kind: "none" } \| { kind: "compose"; env: string; activation: string } \| { kind: "legacy"; id: string; name: string; renamed: string; running: boolean; restart: string } | yes | accepted kinds: none, compose, legacy. `compose` keeps the previous `.env` and `activation.json` text; `legacy` keeps the adopted container and its renamed name `<name>-previous-<id>`. |
| backup | string \| null | yes | `<volume>-recovery-<id>` once a snapshot starts. |
| backupDigest | Digest \| null | yes | Metadata digest of the snapshot, excluding top-level `projects`. |
| published | { path: string; identity: Identity } \| null | yes | Project folder this run filled; undo removes it only if the identity still matches. |

### LegacyReceipt

`legacyReceiptSchema` uses `.passthrough()`; only these keys are read (`packages/app/src/edge/docker-install/state.ts:88`).

| Field | Type | Required | Notes |
|---|---|---|---|
| name | string | yes | `identifier`. |
| volume | string | yes | `identifier`. |
| projects | string | yes | `absolute`; becomes the adoption source folder. |
| directoryIdentity | Identity | yes | Parsed, not used for adoption decisions. |

### LegacyJournal

`legacyJournalSchema` uses `.passthrough()` (`packages/app/src/edge/docker-install/state.ts:91`).

| Field | Type | Required | Notes |
|---|---|---|---|
| id | string | yes | 2.5.0 transaction id. |
| name | string | yes | `identifier`. |
| volume | string | yes | `identifier`. |
| phase | string | yes | Settled when one of: healthy, committed, restored, rolled-back (`packages/app/src/edge/docker-install/state.ts:100`). |
| backup | string | yes | 2.5.0 recovery volume name. |

### Activation

Strict object (`packages/app/src/edge/docker-install/activation.ts:9`).

| Field | Type | Required | Notes |
|---|---|---|---|
| version | 1 | yes | accepted: 1 |
| token | string | yes | 64 lowercase hex; equals `SLOPIFY_UPDATE_TOKEN` of the candidate. |
| committed | boolean | yes | Written false before `compose up`, true after `install.json` is written (`packages/app/src/edge/docker-install/apply.ts:285`, `packages/app/src/edge/docker-install/apply.ts:330`). |

### LoginStart

Inferred from `loginStartSchema` (strict) (`packages/app/src/edge/autostart/docker.ts:13`).

| Field | Type | Required | Notes |
|---|---|---|---|
| version | 1 | yes | accepted: 1 |
| checkedAt | string | yes | ISO time, ≤ 40 characters. |
| docker | "yes" \| "no" \| "unknown" | yes | accepted: yes, no, unknown |
| manager | "system" \| "rootless" | yes | accepted: system, rootless. `rootless` when `Install.user` is `0:0`. |
| wanted | boolean \| null | yes | Answer to "Start Slopify when you log in?", null when not asked. |
| platform | "linux" \| "darwin" \| "win32" \| "other" | no | accepted: linux, darwin, win32, other. Absent before 3.0.1. |
| desktop | boolean | no | Docker Desktop detected. Absent before 3.0.1. |

### HostCliConsent

Strict inline schema (`packages/app/src/edge/docker.ts:72`).

| Field | Type | Required | Notes |
|---|---|---|---|
| version | 1 | yes | accepted: 1 |
| automaticStartup | true | yes | accepted: true |

### Container

All fields `readonly`; built by `inspect` (`packages/app/src/edge/docker-install/engine.ts:175`).

| Field | Type | Required | Notes |
|---|---|---|---|
| id | string | yes | Docker container ID. |
| name | string | yes | Inspected name without the leading `/`. |
| image | string | yes | `Config.Image`. |
| user | string | yes | `Config.User`. |
| running | boolean | yes | `State.Running`. |
| restart | string | yes | Restart policy name, `on-failure:<n>` when a retry count is set, `no` when empty. |
| project | string \| null | yes | `com.docker.compose.project` label; null for a `docker run` container. |
| launcher | boolean | yes | `io.slopify.launcher` label present (2.5.0 launcher container). |
| mounts | { type: string; name: string; source: string; destination: string }[] | yes | Missing mount `Name` becomes `""`. |
| port | number \| null | yes | Host port of the first `6969/tcp` binding, or null. |

### RecoveryVolume

All fields `readonly` (`packages/app/src/edge/docker-install/engine.ts:26`).

| Field | Type | Required | Notes |
|---|---|---|---|
| name | string | yes | `<volume>-recovery-<uuid>` (`recoveryId` accepts only a UUID suffix, `packages/app/src/edge/docker-install/engine.ts:73`). |
| transaction | string \| null | yes | `io.slopify.transaction` label. |
| container | string \| null | yes | `io.slopify.container` label. |

### Identity

Both fields `readonly`; strict schema twin at `packages/app/src/edge/docker-install/state.ts:17`.

| Field | Type | Required | Notes |
|---|---|---|---|
| dev | string | yes | BigInt device number as string. |
| ino | string | yes | BigInt inode number as string. |

### Digest

All fields `readonly`; strict schema twin at `packages/app/src/edge/docker-install/state.ts:18`.

| Field | Type | Required | Notes |
|---|---|---|---|
| hash | string | yes | SHA-256 hex; schema requires 64 lowercase hex. |
| files | number | yes | Nonnegative integer count of regular files hashed. |
| bytes | number | yes | Nonnegative integer total bytes hashed. |

### DockerCommand

All fields `readonly`.

| Field | Type | Required | Notes |
|---|---|---|---|
| mode | "install" \| "update" | yes | accepted: install, update |
| port | string | no | `--port`; falls back to `SLOPIFY_DOCKER_HOST_PORT`; `""` means any free port. |
| projectsDir | string | no | `--projects-dir`; falls back to `SLOPIFY_DOCKER_PROJECTS_DIR`; `documents` selects `<Documents>/Slopify/Projects`. |
| hostCli | string | no | `off` disables the host CLI bridge. |
| acceptHostCli | boolean | no | Pre-accepts bridge consent. |
| autostart | boolean | no | `--autostart` / `--no-autostart`; absent asks on a TTY. |

### ApplyOptions

All fields `readonly`.

| Field | Type | Required | Notes |
|---|---|---|---|
| home | string | yes | Host home directory. |
| uid | number | yes | Installing user id. |
| gid | number | yes | Installing group id. |
| root | string | yes | `dockerRoot`: `<XDG_DATA_HOME or ~/.local/share>/slopify/docker` (`packages/app/src/edge/docker-install/state.ts:103`). |
| name | string | yes | `SLOPIFY_DOCKER_NAME`, default `slopify`. |
| volume | string | yes | `SLOPIFY_DOCKER_VOLUME`, default `slopify-data`. |
| image | string | yes | `SLOPIFY_DOCKER_IMAGE`, default `ghcr.io/gentbajko/slopify:<version>` (`packages/app/src/edge/docker-install/run.ts:99`). |
| version | string | yes | Installer version; the image must report the same. |
| port | number \| null | yes | Null keeps the remembered port (6969 on first install); 0 = any free port. |
| projects | string \| null | yes | Null keeps the remembered folder. |
| documents | string | no | Documents folder for new-install defaults. |
| mode | "install" \| "update" | yes | accepted: install, update |
| composeFile | string | yes | Shipped `compose.yaml` path. |
| hostCli | { enabled: false } \| { enabled: true; ensure: () => Promise<string> } | yes | `ensure` returns the bridge share folder. |
| report | (line: string) => void | yes | Progress output. |
| pollMs | number | no | Busy-poll interval, default 5000. |

### ApplyResult

All fields `readonly`.

| Field | Type | Required | Notes |
|---|---|---|---|
| url | string | yes | `http://127.0.0.1:<port>`. |
| projects | string | yes | Host project folder. |
| backups | string \| null | yes | Separate Backups folder, or null. |
| changed | boolean | yes | False when the installation already matched. |
| recovery | string \| null | yes | Recovery volume of this (or the committed) run. |
| removed | readonly string[] | yes | Old containers / recovery volumes tidied. |
| problems | readonly string[] | yes | Tidy-up failures (non-fatal). |

### DockerHostOptions

All fields `readonly`.

| Field | Type | Required | Notes |
|---|---|---|---|
| root | string | yes | `<XDG_DATA_HOME or ~/.local/share>/slopify/host-cli` (`packages/app/src/edge/docker-install/run.ts:74`). |
| version | string | yes | Installer version. |
| disabled | boolean | yes | True returns `{ enabled: false }`. |
| accepted | boolean | yes | Explicit consent flag. |
| interactive | boolean | yes | stdin is a TTY. |
| prompt | (message: string) => Promise<boolean> | yes | Consent question. |
| runner | HostSetupRunner | yes | Command port. |
| env | Readonly<NodeJS.ProcessEnv> | yes | Host environment. |
| signal | AbortSignal | yes | Cancel plus 20-minute deadline. |

### Paths

All fields `readonly`; built by `layout(dataDir, files?)` (`packages/app/src/kernel/paths.ts:31`).

| Field | Type | Required | Notes |
|---|---|---|---|
| dataDir | string | yes | Resolved data root; `/data` in the image. |
| db | string | yes | `<dataDir>/slopify.db`. |
| projects | string | yes | `FilesLayout.projects`, else `<dataDir>/projects`. |
| backups | string | yes | `FilesLayout.backups`, else `<projects>/Backups`. |
| exports | string \| null | yes | `FilesLayout.exports`; null without a layout. |
| staging | string | yes | `<dataDir>/staging`. |
| logs | string | yes | `<dataDir>/logs`. |
| lock | string | yes | `<dataDir>/.lock`. |

### FilesLayout

All fields `readonly`.

| Field | Type | Required | Notes |
|---|---|---|---|
| projects | string | yes | In a container: `<dataDir>/projects` (`packages/app/src/edge/docker-install/activation.ts:27`). |
| backups | string | yes | In a container: `<dataDir>/backups` when `SLOPIFY_DOCKER_BACKUPS_DIR` is set, else `<projects>/Backups`. |
| exports | string \| null | yes | Null in a container. |

### FolderReply

Union of three strict objects (`packages/app/src/edge/http/folder-location-schema.ts:5`).

| Field | Type | Required | Notes |
|---|---|---|---|
| opened | true \| false | yes | accepted: true, false |
| location | "docker-host" | no | accepted: docker-host. Required with `opened: false`; optional with `opened: true` (host helper opened it). |
| path | string | no | Non-empty host folder path; present exactly when `location` is. |

## Relationships

- Installation folder `<root>/<name>/` holds `install.json`, `update.json` (transient), `update.lock` (PID file), `.env`, `compose.yaml`, `host-cli-off/` and `activation/` (with `activation.json` and `login-start.json`) (`packages/app/src/edge/docker-install/apply.ts:103`, `packages/app/src/edge/autostart/docker-record.ts:35`).
- `.env` is rendered from the run's values by `composeEnv` as single-quoted `KEY='value'` lines: `SLOPIFY_NAME`, `SLOPIFY_IMAGE`, `SLOPIFY_USER`, `SLOPIFY_PORT`, `SLOPIFY_VOLUME`, `SLOPIFY_PROJECTS_DIR`, optional `SLOPIFY_BACKUPS_DIR`, `SLOPIFY_HOST_CLI_SHARE`, `SLOPIFY_ACTIVATION_DIR`, `SLOPIFY_UPDATE_TOKEN` (the candidate token), `SLOPIFY_UPDATE_PENDING` (`packages/app/src/edge/docker-install/apply.ts:289`, `packages/app/src/edge/docker-install/apply.ts:567`).
- `compose.yaml` maps them: external volume `${SLOPIFY_VOLUME}` → `/data`; bind `${SLOPIFY_PROJECTS_DIR}` → `/data/projects`; bind `${SLOPIFY_BACKUPS_DIR:-./backups-off}` → `/data/backups`; read-only bind of the host-CLI share → `/opt/slopify-host`; read-only bind of the activation folder → `/opt/slopify-install`; port `127.0.0.1:${SLOPIFY_PORT-6969}:6969`; container env `SLOPIFY_DOCKER_PROJECTS_DIR`, `SLOPIFY_DOCKER_BACKUPS_DIR`, `SLOPIFY_HOST_CLI_DIR`, `SLOPIFY_DOCKER_INSTALL_STATE=/opt/slopify-install/activation.json` (`compose.yaml:9`).
- `Install.token` equals the token in the committed `activation.json`; the candidate app reads that file through `dockerActivationCommitted` to decide its update is committed (`packages/app/src/edge/docker-install/activation.ts:17`, `packages/app/src/main.ts:406`).
- `Update.previous` embeds what rollback restores: the previous `.env`/`activation.json` text (compose) or the adopted container's id, name, renamed name, running state and restart policy (legacy) (`packages/app/src/edge/docker-install/apply.ts:361`).
- Recovery volumes carry labels `io.slopify.transaction=<Update.id>` and `io.slopify.container=<name>` (`packages/app/src/edge/docker-install/apply.ts:265`). After a commit, tidy-up removes older recovery volumes of the same data volume whose name id equals their transaction label and whose container label is absent or this name, and stopped `<name>-previous-*` containers (`packages/app/src/edge/docker-install/apply.ts:402`).
- Adoption: with no `install.json`, the 2.5.0 `receipt.json` supplies the source projects folder when no container exists; an existing non-compose container supplies it from its `/data/projects` bind (`packages/app/src/edge/docker-install/apply.ts:464`).
- The host helper reads every installation's `install.json` and opens a folder only inside `projects` whose identity still equals `projectsIdentity` (`packages/app/src/host-cli/open-folder.ts:57`, `packages/app/src/host-cli/open-folder.ts:100`).
- Folder replies: `replyForFolder` maps a verified file under `Paths.projects` to `join(hostProjects, dirname(relative))`; browser requests carry only project/output/record identifiers, never a path (`packages/app/src/edge/http/folder-location.ts:12`, `packages/app/src/edge/http/open-folder.ts:10`, `packages/app/src/edge/http/revision-files.ts:60`). `folderLocation` (`container`, `hostProjects`, optional `hostBackups`, optional `openOnHost`) is assembled from `dockerFolderConfiguration` plus the host CLI client (`packages/app/src/edge/http/app.ts:96`, `packages/app/src/main.ts:609`).

## Boundaries

| Boundary | Conversion |
|---|---|
| CLI/env → ApplyOptions | `runDockerCommand` validates port text (`^\d{1,5}$`, ≤ 65535), name/volume with `identifier`, expands `~/` and resolves the projects path, checks it with `absolute`, and builds the image reference (`packages/app/src/edge/docker-install/run.ts:28`). |
| Docker inspect JSON → Container | `inspectSchema` parses the raw array; `inspect` normalizes name, restart policy, labels, mounts and port (`packages/app/src/edge/docker-install/engine.ts:106`, `packages/app/src/edge/docker-install/engine.ts:175`). |
| Docker context/info → daemon, user | `context` requires a `unix://` endpoint, rejects Docker Desktop and userns-remap, requires `docker compose`, returns `{ daemon: info.ID, user }` (`packages/app/src/edge/docker-install/engine.ts:207`). |
| Filesystem → Identity | `lstat(path, { bigint: true })`, rejecting non-directories and symlinks (`packages/app/src/edge/docker-install/tree.ts:15`). |
| Filesystem → Digest | `treeDigest(root, metadata, omitProjects)`: sorted walk hashing JSON lines `[name, kind, …]`; metadata mode adds uid/gid/mode and hashes symlink targets; plain mode rejects symlinks and multiply linked files; `omitProjects` skips the root's `projects`; identity/size/mtime re-checks detect concurrent change (`packages/app/src/edge/docker-install/tree.ts:100`). |
| Volume helper JSON → Digest | The helper (`volume.js` inside the image, run `--network none --read-only` as root) prints JSON: `projects` → `{ exists: false }` or `{ exists: true, digest }`, parsed with a Zod union into `Digest \| null`; `private`, `snapshot`, `restore` return a Digest used after `JSON.parse` without a schema; `own` returns `{ ok: true }` (`packages/app/src/edge/docker-install/volume.ts:7`, `packages/app/src/edge/docker-install/engine.ts:155`, `packages/app/src/edge/docker-install/engine.ts:308`). |
| Records ↔ files | `readState` checks the file (regular, not a symlink, one link, owned by uid, no group/other bits), reads it with `privateRead`, parses JSON and the schema, and turns a parse failure into a "damaged" error (`packages/app/src/edge/docker-install/state.ts:135`). `writeState` → `writeText`: 64 KiB limit, `privateWrite` (exclusive mode-0600 temp file, sync, rename), then directory sync (`packages/app/src/edge/docker-install/state.ts:161`, `packages/app/src/host-cli/service.ts:71`). |
| Container env → FilesLayout / folder config | `dockerFilesLayout` (`packages/app/src/edge/docker-install/activation.ts:27`); `dockerFolderConfiguration` returns `{ container, hostProjects, hostBackups }` (`packages/app/src/edge/docker-install/activation.ts:38`). |
| Registered file → FolderReply | `POST /:id/open-folder` resolves `findDownload` (for `images.zip`, the first existing image/thumbnail output); `POST /:id/revisions/:revisionId/:recordId/open-folder` resolves `findRevisionDownload`; both call `replyForFolder`, which parses the outgoing union (`packages/app/src/edge/http/open-folder.ts:34`, `packages/app/src/edge/http/revision-files.ts:64`, `packages/app/src/edge/http/folder-location.ts:53`). The web client parses it again with the same schema (`packages/web/src/project/open-folder.tsx:33`, `packages/web/src/project/revision-api.ts:237`). |

## Validation

- `identifier` and `absolute` are the shared path/name validators (`packages/app/src/edge/docker-install/state.ts:7`, `packages/app/src/edge/docker-install/state.ts:12`). Every state schema is `.strict()` except the two legacy schemas (`.passthrough()`).
- `privateDirectory` creates each missing component mode 0700, rejects symlinks and group/other-writable components without the sticky bit, and requires the leaf to be owned by the user with no group/other bits (`packages/app/src/edge/docker-install/state.ts:107`).
- `safePath` rejects non-canonical paths, `/`, `/home`, `/root`, `/tmp`, `/var`, `/srv`, `/mnt`, `/media`, home, `~/Slopify`, anything overlapping the state root, and anything under `/proc`, `/sys`, `/dev`, `/etc`, `/usr`, `/bin`, `/sbin`, `/lib`, `/var/lib/docker`; each component must be a real directory; the leaf must be user-owned and not group/other-writable; ancestors must not be group/other-writable without the sticky bit (`packages/app/src/edge/docker-install/tree.ts:29`). Projects and Backups may not contain each other, nor may old and new projects folders (`packages/app/src/edge/docker-install/apply.ts:162`).
- Cross-record checks in `locked`: an `install.json` for another name/volume, a different daemon ID, a current container whose `/data` is not the named volume, a missing remembered projects folder, a non-empty new projects folder, an image reporting a different version, an unsettled 2.5.0 journal, or a container owned by another compose project each stop the run before changes (`packages/app/src/edge/docker-install/apply.ts:113`, `packages/app/src/edge/docker-install/apply.ts:137`, `packages/app/src/edge/docker-install/apply.ts:184`, `packages/app/src/edge/docker-install/apply.ts:474`, `packages/app/src/edge/docker-install/apply.ts:484`).
- Copies are verified: a host-to-host copy must hash equal to the source digest after `privateTree` (dirs 0700, files 0600, owned by uid:gid); a copy out of the volume must equal the helper's `projects` digest (`packages/app/src/edge/docker-install/apply.ts:500`). Snapshot requires an empty backup volume and equal digests before, copied and after; restore requires the backup's private digest to equal `Update.backupDigest` before and after (`packages/app/src/edge/docker-install/volume.ts:18`, `packages/app/src/edge/docker-install/engine.ts:354`). Data is restored only when the phase reached `starting` (`packages/app/src/edge/docker-install/apply.ts:373`).
- `composeEnv` rejects any value containing `'`, `\n` or `\r` (`packages/app/src/edge/docker-install/apply.ts:567`). The lock file is exclusive; a stale PID lock is removed once (`packages/app/src/edge/docker-install/apply.ts:579`).
- Activation: `dockerActivationCommitted` requires a 64-hex token, a valid private `activation.json`, `committed: true` and a `timingSafeEqual` token match (`packages/app/src/edge/docker-install/activation.ts:17`). In the container, `SLOPIFY_DOCKER_INSTALL_STATE` must be `/opt/slopify-install/activation.json` (`packages/app/src/main.ts:229`).
- Runtime folder configuration requires `SLOPIFY_CONTAINER=1`, the fixed activation path, canonical host paths without commas/control characters, and `/data/projects` as a real directory listed as a mount point in `/proc/self/mountinfo`; `hostBackups` is set only when `/data/backups` is also a mount point (`packages/app/src/edge/docker-install/activation.ts:38`).
- Folder requests: ids 1–64 matching `^[0-9A-Za-z_-]+$`; asset names ≤ 64 matching `^(?:[a-z0-9-]+|images\.zip)$`; a cross-origin `Origin` header gets 403 (`packages/app/src/edge/http/open-folder.ts:13`, `packages/app/src/edge/http/revision-files.ts:11`). `replyForFolder` rejects paths outside `Paths.projects`, a symlinked or non-directory root, and any symlink or wrong entry kind along the file path (`packages/app/src/edge/http/folder-location.ts:29`).

## Schema

No SQLite table, index or migration belongs to the Docker installer. `Install`, `Update`, Activation, LoginStart and HostCliConsent are private JSON files; `Container` and `RecoveryVolume` are Docker metadata; the rest are runtime values or HTTP DTOs. The application's own migrations run against `/data/slopify.db` inside the candidate container at boot (`packages/app/src/main.ts:253`); output and asset registrations stay in the database while their files sit under the `/data/projects` bind (`02-models.md`).
