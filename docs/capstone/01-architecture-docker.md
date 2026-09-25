---
generated_at_commit: a472d513f12c
generated_date: 2026-09-25
content_hash: c78936891493
paths_covered:
  - ':(top)Dockerfile'
  - ':(top)biome.json'
  - ':(top)packages/app/package.json'
  - ':(top)packages/app/scripts/copy-web.mjs'
  - ':(top)packages/app/scripts/docker-run.sh'
  - ':(top)packages/app/src/edge/cli.ts'
  - ':(top)packages/app/src/edge/docker-launch.ts'
  - ':(top)packages/app/src/edge/docker-projects/activation.ts'
  - ':(top)packages/app/src/edge/docker-projects/claims.ts'
  - ':(top)packages/app/src/edge/docker-projects/committed.ts'
  - ':(top)packages/app/src/edge/docker-projects/engine.ts'
  - ':(top)packages/app/src/edge/docker-projects/install.ts'
  - ':(top)packages/app/src/edge/docker-projects/recover.ts'
  - ':(top)packages/app/src/edge/docker-projects/state.ts'
  - ':(top)packages/app/src/edge/docker-projects/tree.ts'
  - ':(top)packages/app/src/edge/docker-projects/volume.ts'
  - ':(top)packages/app/src/edge/docker.ts'
  - ':(top)packages/app/src/edge/host-cli.ts'
  - ':(top)packages/app/src/edge/http/app.ts'
  - ':(top)packages/app/src/edge/http/folder-location-schema.ts'
  - ':(top)packages/app/src/edge/http/folder-location.ts'
  - ':(top)packages/app/src/edge/http/open-folder.ts'
  - ':(top)packages/app/src/edge/http/problem.ts'
  - ':(top)packages/app/src/edge/http/revision-files.ts'
  - ':(top)packages/app/src/edge/http/update.ts'
  - ':(top)packages/app/src/host-cli/install.ts'
  - ':(top)packages/app/src/main.ts'
  - ':(top)packages/app/src/slices/storage/reconcile.ts'
  - ':(top)packages/app/src/updater/candidate.ts'
  - ':(top)packages/app/src/updater/service.ts'
  - ':(top)packages/web/index.html'
  - ':(top)packages/web/src/api.ts'
  - ':(top)packages/web/src/main.tsx'
  - ':(top)packages/web/src/project/open-folder.tsx'
  - ':(top)packages/web/src/project/revision-api.ts'
  - ':(top)packages/web/src/router.tsx'
  - ':(top)packages/web/src/styles/index.css'
  - ':(top)packages/web/vite.config.ts'
absorbed_from:
  - features/2026-09-25-docker-project-folder@2026-09-25
---

# Docker storage and folder access


Scope: managed Docker launch, project-folder migration and recovery, activation, and current/retained-output folder access. Provider execution and the host-helper socket protocol belong to their existing modules.

## Layers

| Layer | Directories/files | Observed dependency direction |
| --- | --- | --- |
| Host entry and setup | `packages/app/src/edge/{cli,docker,docker-launch}.ts`, `packages/app/scripts/docker-run.sh` | CLI imports native boot and dynamically loads Docker setup; the shell delegates to the compiled launcher; the launcher composes installation policy with the Docker command adapter (`packages/app/src/edge/cli.ts:8`, `packages/app/src/edge/cli.ts:43`, `packages/app/scripts/docker-run.sh:3`, `packages/app/src/edge/docker-launch.ts:8`). |
| Installation policy and records | `packages/app/src/edge/docker-projects/` | `install.ts` imports claims, committed-record validation, recovery, state and tree helpers; its Docker dependency is the `Engine` interface. State uses host-helper private-file utilities; tree operations use Node built-ins (`packages/app/src/edge/docker-projects/install.ts:1`, `packages/app/src/edge/docker-projects/state.ts:1`, `packages/app/src/edge/docker-projects/tree.ts:1`). |
| Docker command adapter and image helper | `docker-projects/{engine,volume}.ts`, `Dockerfile` | The engine calls the injected host command runner and invokes the image’s fixed volume helper. The helper imports tree verification, not application boot or provider execution (`packages/app/src/edge/docker-projects/engine.ts:42`, `packages/app/src/edge/docker-projects/engine.ts:63`, `packages/app/src/edge/docker-projects/volume.ts:1`). |
| Application composition and HTTP | `packages/app/src/main.ts`, `packages/app/src/edge/http/` | Boot imports activation checks and injects folder configuration into HTTP. Folder routes resolve registered storage/revision files before calling the shared reply function (`packages/app/src/main.ts:16`, `packages/app/src/main.ts:384`, `packages/app/src/edge/http/open-folder.ts:4`, `packages/app/src/edge/http/revision-files.ts:6`). |
| Browser | `packages/web/src/project/` | Browser code imports the browser-safe reply schema and uses HTTP clients; it does not import installation or filesystem implementations (`packages/web/src/project/open-folder.tsx:1`, `packages/web/src/project/revision-api.ts:1`). |

## Module boundaries

| Module | Public surface and boundary |
| --- | --- |
| CLI and host setup | `assertManagedDockerHost` and `prepareDockerHostCli` validate the host and optionally prepare the helper. Helper consent is separate from project-storage authority. Disabled setup or no detected supported CLI returns no share directory (`packages/app/src/edge/docker.ts:11`, `packages/app/src/edge/docker.ts:38`, `packages/app/src/edge/docker.ts:62`). |
| Managed launcher | Builds `DockerConfig`, holds the installation-root `flock`, handles interruption and injects a fresh recovery engine. It owns orchestration, not provider execution (`packages/app/src/edge/docker-launch.ts:14`, `packages/app/src/edge/docker-launch.ts:62`). |
| Installation policy | `installProjects`, `recoverInstallation`, `readCommittedJournal` and `assertVolumeClaims` own migration, restart authority and transaction reconciliation. Their Docker calls pass through `Engine`; they do not import Docker subprocess implementations (`packages/app/src/edge/docker-projects/install.ts:7`, `packages/app/src/edge/docker-projects/recover.ts:3`, `packages/app/src/edge/docker-projects/claims.ts:3`). |
| State and filesystem | `dockerConfig`, state schemas, private reads/writes, project selection, directory identity and digest functions own record/path validation. `tree.ts` has no application-layer imports (`packages/app/src/edge/docker-projects/state.ts:133`, `packages/app/src/edge/docker-projects/state.ts:193`, `packages/app/src/edge/docker-projects/tree.ts:1`). |
| Docker adapter | `dockerEngine` implements all `Engine` methods using `HostSetupRunner.exec`. `volumeOperation` dispatches only the six fixed operations listed below (`packages/app/src/edge/docker-projects/engine.ts:15`, `packages/app/src/edge/docker-projects/volume.ts:7`). |
| Runtime activation | `dockerActivationCommitted` reads the private activation record; `dockerFolderConfiguration` verifies container configuration and the projects mountpoint. Application boot imports these functions directly; no separate dependency rule forbids this observed composition (`packages/app/src/edge/docker-projects/activation.ts:15`, `packages/app/src/main.ts:16`). |
| Folder HTTP and browser schema | `openFolderRoutes`, `revisionFolderRoutes` and `revisionFileRoutes` resolve IDs through storage. `replyForFolder` chooses native opening or Docker host-path reporting. `folderReplySchema` imports only Zod and is shared with the browser (`packages/app/src/edge/http/open-folder.ts:10`, `packages/app/src/edge/http/revision-files.ts:20`, `packages/app/src/edge/http/revision-files.ts:53`, `packages/app/src/edge/http/folder-location-schema.ts:1`). |

Enforced import restrictions prevent kernel code from importing edge/slices, slices from importing edge, and provider adapters from importing edge. Therefore those layers cannot import this installation module. Other boundaries above are observed imports, not additional enforced rules (`biome.json:44`, `biome.json:70`, `biome.json:99`).

## Entry points

| Entry | Dispatch |
| --- | --- |
| Published `slopify` executable | `packages/app/package.json:16` selects compiled `edge/cli.js`; argument parsing starts at `packages/app/src/edge/cli.ts:15`. |
| Managed Docker branch | `packages/app/src/edge/cli.ts:38` prepares the helper and launches Bash at `packages/app/src/edge/cli.ts:71`. |
| Packaged shell wrapper | `packages/app/scripts/docker-run.sh:1`; line 3 replaces the shell with compiled `edge/docker-launch.js`. |
| Locked installer process | `packages/app/src/edge/docker-launch.ts:14`; `flock` re-enters it with `--locked` at line 28; top-level execution is at line 82. |
| Image volume helper | `packages/app/src/edge/docker-projects/volume.ts:79` dispatches `process.argv.slice(2)` and prints JSON. |
| Container application | `Dockerfile:52` runs compiled `edge/cli.js --no-open`; native CLI dispatch calls `boot` at `packages/app/src/edge/cli.ts:96`, defined at `packages/app/src/main.ts:160`. |
| Optional host-helper service | The separate helper process parses `--state-dir` at `packages/app/src/edge/host-cli.ts:14` and starts its server at line 40. Docker setup delegates service installation to `ensureHostService` (`packages/app/src/edge/docker.ts:144`). |
| Browser | `packages/web/index.html:12` loads `src/main.tsx`; client mounting starts at `packages/web/src/main.tsx:22`. |

Docker accepts `--projects-dir` and `--port`; `--projects-dir` requires `--docker`. Docker rejects native `--host`/`--data-dir` overrides. `--host-cli=off` is the only host-CLI string override; `--accept-host-cli` supplies helper consent (`packages/app/src/edge/cli.ts:15`, `packages/app/src/edge/cli.ts:28`).

## Communication

### Host calls and persisted control records

Named records below are defined in `02-models-docker.md`.

| Channel | Request | Response and sites |
| --- | --- | --- |
| CLI → helper preparation | `DockerHostOptions` | `{ directory?: string }`; absent directory means no helper share. Send: `packages/app/src/edge/cli.ts:47`; receive/return: `packages/app/src/edge/docker.ts:38`, `packages/app/src/edge/docker.ts:155`. |
| CLI → shell → installer | Inherited environment; `SLOPIFY_HOST_CLI_DIR: string` is always supplied, possibly empty; optional `SLOPIFY_DOCKER_HOST_PORT: string` and `SLOPIFY_DOCKER_PROJECTS_DIR: string` override environment values. No JSON body. | Inherited stdout/stderr and process exit status. Send: `packages/app/src/edge/cli.ts:71`; delegation: `packages/app/scripts/docker-run.sh:3`; receive: `packages/app/src/edge/docker-launch.ts:19`. |
| Installer composition → policy | `c: DockerConfig`, `e: Engine`, `recovery: () => Engine` | `Promise<{ url: string; projects: string; recovery: string \| null }>`; errors reject. Caller: `packages/app/src/edge/docker-launch.ts:67`; implementation: `packages/app/src/edge/docker-projects/install.ts:31`. |
| Engine → command runner | `file: string`, `args: readonly string[]`, `signal: AbortSignal`; engine uses executable `docker`. | `Promise<{ code: number; stdout: string }>`; engine rejects nonzero codes and otherwise trims stdout. Send: `packages/app/src/edge/docker-projects/engine.ts:47`; receiver: `packages/app/src/host-cli/install.ts:9`, `packages/app/src/host-cli/install.ts:23`. |
| Installer → private state files | JSON `Receipt` and `Journal`; activation JSON `{ version: 1; token: string; committed: boolean }`, all fields required. | State reads return parsed records or `null` for absence; unsafe/malformed records throw. Write: `packages/app/src/edge/docker-projects/install.ts:172`, `packages/app/src/edge/docker-projects/install.ts:258`; read: `packages/app/src/edge/docker-projects/state.ts:193`, `packages/app/src/edge/docker-projects/activation.ts:15`. |
| Runtime folder configuration → HTTP dependencies | Environment plus `projectsRoot: string` | `Promise<{ container: boolean; hostProjects: string \| null }>`; both fields required. Producer: `packages/app/src/edge/docker-projects/activation.ts:23`; injection: `packages/app/src/main.ts:390`; consumer: `packages/app/src/edge/http/folder-location.ts:19`. |

The helper consent record is anonymous JSON `{ version: 1; automaticStartup: true }`, with both fields required. It is read and validated separately from the installation receipt (`packages/app/src/edge/docker.ts:62`, `packages/app/src/edge/docker.ts:154`).

The complete installation-facing `Engine` contract is declared at `packages/app/src/edge/docker-projects/engine.ts:15`. Every result below is a `Promise`; `void` means successful completion without a payload.

| Method | Required arguments | Result |
| --- | --- | --- |
| `context` | `uid: number`, `gid: number` | `{ daemon: string; user: string }` |
| `image` | `ref: string` | `string` image ID |
| `version` | `image: string` | `string` package version |
| `inspect` | `name: string` | `Container \| null` |
| `claims` | `volume: string`, `permitted: readonly string[]` | `void` |
| `writers` | `volume: string`, `paths: readonly string[]`, `permitted: readonly string[]` | `void` |
| `probe` | `c: DockerConfig`, `image: string`, `user: string`, `destination: string` | `void` |
| `ensureVolume` | `volume: string` | `void` |
| `volume` | `name: string` | `string \| null` volume identity |
| `projects` | `image: string`, `volume: string`, `bind: string \| null` | `Digest \| null` |
| `copy` | `image: string`, `volume: string`, `bind: string \| null`, `destination: string`, `id: string` | `void` |
| `snapshot` | `j: Journal` | `Digest` |
| `restore` | `j: Journal` | `void` |
| `own` | `j: Journal` | `void` |
| `stop` | `c: Container` | `void` |
| `restart` | `c: Container` | `void` |
| `start` | `c: DockerConfig`, `j: Journal`, `transactionDirectory: string` | `string` candidate container ID |
| `health` | `id: string`, `token: string`, `expectedVersion: string` | `void` |
| `command` | `args: readonly string[]` | `string` trimmed stdout |

Call sites are `packages/app/src/edge/docker-projects/install.ts:41`, `packages/app/src/edge/docker-projects/install.ts:104`, `packages/app/src/edge/docker-projects/install.ts:184`, `packages/app/src/edge/docker-projects/recover.ts:27`, `packages/app/src/edge/docker-projects/claims.ts:30`. The implementation dispatch object begins at `packages/app/src/edge/docker-projects/engine.ts:194`.

### Fixed image-helper operations

The engine sends positional arguments `[operation, user]` to `volume.js`; `user` defaults to `"0:0"`. Helpers run without networking and with a read-only root filesystem. Source mounts are read-only; destination mounts are writable. Only the ownership probe runs under the selected application user; other helper operations use container `"0:0"` (`packages/app/src/edge/docker-projects/engine.ts:55`, `packages/app/src/edge/docker-projects/engine.ts:63`).

| Operation | Filesystem input | JSON stdout |
| --- | --- | --- |
| `projects` | `/source/projects`, optionally overlaid by the original host bind | `{ exists: false }` or `{ exists: true; digest: Digest }`; all branch fields required (`packages/app/src/edge/docker-projects/volume.ts:9`). |
| `private` | `/source` | `Digest` including metadata and excluding top-level `projects` (`packages/app/src/edge/docker-projects/volume.ts:17`). |
| `snapshot` | `/source`, empty `/backup` | `Digest` for private data after copying and verifying the entire source volume (`packages/app/src/edge/docker-projects/volume.ts:18`). |
| `restore` | Recovery `/source`, live `/data` | `Digest` after restoring private entries while preserving top-level `projects` (`packages/app/src/edge/docker-projects/volume.ts:30`). |
| `own` | `/data`, `user: string` containing decimal UID:GID | `{ ok: true }`; recursively changes private-volume ownership/modes, skips top-level `projects`, creates `/data/home` (`packages/app/src/edge/docker-projects/volume.ts:49`). |
| `probe` | Writable `/probe` | `{ uid: number \| undefined; gid: number \| undefined }`; undefined values are omitted by JSON serialization. Also creates the private probe file checked by the host (`packages/app/src/edge/docker-projects/volume.ts:73`). |

These six branches are the entire operation dispatch; unknown operations fail. The wrapper prints a generic failure and exits unsuccessfully (`packages/app/src/edge/docker-projects/volume.ts:77`). Engine send/parse sites are `packages/app/src/edge/docker-projects/engine.ts:286`, `packages/app/src/edge/docker-projects/engine.ts:307`, `packages/app/src/edge/docker-projects/engine.ts:340`, `packages/app/src/edge/docker-projects/engine.ts:353`, `packages/app/src/edge/docker-projects/engine.ts:370`.

Project copying uses a separate stopped reader container and `docker cp`, not a seventh helper operation (`packages/app/src/edge/docker-projects/engine.ts:316`).

### HTTP and browser contracts

The scoped route registrations are `revisionFolderRoutes` and `openFolderRoutes` beneath `/api/projects`, update routes beneath `/api/update`, and revision downloads at the root (`packages/app/src/edge/http/app.ts:111`, `packages/app/src/edge/http/app.ts:179`, `packages/app/src/edge/http/app.ts:188`).

| Channel | Request | Response and send/receive sites |
| --- | --- | --- |
| `POST /api/projects/:id/open-folder` | Required `id: string` path parameter and JSON `{ asset: string }`; optional `Origin` header must match when present. | `200 FolderReply`; validation `400`, origin `403`, unavailable file `404`, unavailable folder service `503`. Browser send: `packages/web/src/project/open-folder.tsx:41`; route: `packages/app/src/edge/http/open-folder.ts:10`; reply: `packages/app/src/edge/http/folder-location.ts:12`. |
| `POST /api/projects/:id/revisions/:revisionId/:recordId/open-folder` | Required string path parameters `id`, `revisionId`, `recordId`; no body. Same optional-origin check. | `200 FolderReply`; `400`, `403`, `404`, `503` problems. Browser send/parse: `packages/web/src/project/revision-api.ts:201`; route: `packages/app/src/edge/http/revision-files.ts:53`. |
| `GET /files/:projectId/revisions/:revisionId/:recordId` | Required string path parameters; no body. | Registered file byte stream; `Content-Type`, `Content-Length` and attachment filename headers. Invalid parameters return `400`; unavailable registration/file returns `404`. URL producer: `packages/web/src/project/revision-api.ts:192`; route/stream: `packages/app/src/edge/http/revision-files.ts:36`. |
| `GET /files/:projectId/revisions/:revisionId/images.zip` | Required string path parameters; no body. | ZIP bytes with `application/zip`, byte length and attachment filename; `400`/`404` problems. URL producer: `packages/web/src/project/revision-api.ts:215`; route: `packages/app/src/edge/http/revision-files.ts:22`. |
| `GET /api/health` | No body or required authentication header. | `{ status: "ok"; version: string; uptimeMs: number }`, all required. Probe send: `packages/app/src/edge/docker-projects/engine.ts:445`; receive: `packages/app/src/edge/http/app.ts:94`. |
| `GET /api/update/ready` | `X-Slopify-Update-Token: string`; no body. | `{ status: "ok"; version: string }`, both required, or `403` problem. Probe send: `packages/app/src/edge/docker-projects/engine.ts:445`; receive: `packages/app/src/edge/http/update.ts:17`. |
| `POST /api/update/activate` | `X-Slopify-Update-Token: string`; no body. | `{ status: "ok"; version: string }`, or `403`/`409` problem. Registered receiver: `packages/app/src/edge/http/update.ts:23`. The Docker installer activates through the shared file marker and in-process watcher; it does not POST this route (`packages/app/src/edge/docker-projects/install.ts:260`, `packages/app/src/updater/candidate.ts:14`). |

HTTP problems carry required `type: string`, `title: string`, `status: number`, `instance: string`; optional `detail: string`. Relevant extensions are `errors?: { path: string; message: string }[]`, `reason?: string`, and unexpected-error `correlationId?: string`. Serialization and validation mapping are at `packages/app/src/edge/http/problem.ts:28`, `packages/app/src/edge/http/problem.ts:43`, `packages/app/src/edge/http/problem.ts:77`; retained-file reasons are added at `packages/app/src/edge/http/revision-files.ts:73`. Browser error receivers are `packages/web/src/project/open-folder.tsx:45` and `packages/web/src/project/revision-api.ts:48`.

Both folder actions return `Cache-Control: no-store`. Native success is `{ opened: true }` after calling the injected opener. Docker success is `{ opened: false; location: "docker-host"; path: string }`, where `path` is the host directory corresponding to a verified saved file. Docker with no configured host folder returns `503`; it does not invoke a container desktop opener (`packages/app/src/edge/http/folder-location.ts:18`, `packages/app/src/edge/http/folder-location.ts:42`, `packages/app/src/edge/http/folder-location.ts:61`).

There is no Docker-specific websocket, SSE event, broker or queue contract in these modules.

## Composition

`docker-launch.ts` holds a nonblocking lock at `<root>/setup.lock` across installation. The lock must be a private, singly linked regular file owned by the installing user. SIGINT/SIGTERM abort ordinary work; rollback gets a separate five-minute signal (`packages/app/src/edge/docker-launch.ts:21`, `packages/app/src/edge/docker-launch.ts:62`).

Managed launch requires a non-root Linux host user. The engine accepts a local `unix://` Linux daemon, rejects Docker Desktop and rootful `userns-remap`, and accepts only ordinary local named volumes without driver options. Rootful containers use the host UID:GID; rootless containers use `"0:0"`. A real ownership probe must create a private file with the host UID/GID that the host can append to. This describes implemented support checks, not evidence of a completed real-rootless test (`packages/app/src/edge/docker.ts:11`, `packages/app/src/edge/docker-projects/engine.ts:199`, `packages/app/src/edge/docker-projects/engine.ts:268`, `packages/app/src/edge/docker-projects/engine.ts:286`).

The image declares `/data`, defaults to `USER node`, and disables browser opening and in-app installation. Managed launch overrides the container user and mounts the private named volume at `/data`, the host projects folder at `/data/projects`, the transaction directory read-only at `/opt/slopify-install`, and an optional helper share read-only at `/opt/slopify-host`. It publishes only `127.0.0.1:<port>:6969`; port zero requests an assigned port (`Dockerfile:20`, `Dockerfile:47`, `packages/app/src/edge/docker-projects/engine.ts:389`).

Project selection is explicit override, receipt path, existing projects bind, then `~/Slopify/Projects` or `~/Slopify/<name>/Projects`. A different destination must be empty/absent unless it is an identity- and digest-verified published retry. Source and destination cannot contain one another (`packages/app/src/edge/docker-projects/state.ts:216`).

Reconciliation checks actual mounts, not just the signature label. Existing `/data` must be the configured named volume; an existing `/data/projects` mount must be a writable bind; other nested `/data/` mounts are refused. A receipt additionally requires its remembered directory identity and matching bind source/installation label. Committed-container validation requires the journal’s candidate ID, image, user, signature and installation; writable volume `/data`; writable bind `/data/projects`; and the exact read-only transaction bind at `/opt/slopify-install`. The reuse predicate also checks restart policy `always`, localhost port, requested port when nonzero, and helper-share source. It does not compare every possible mount or check the helper bind’s read-only flag in that predicate (`packages/app/src/edge/docker-projects/state.ts:222`, `packages/app/src/edge/docker-projects/committed.ts:21`, `packages/app/src/edge/docker-projects/install.ts:115`).

The signature hashes `[imageId, volume, requestedPort, bridge, projects, user]`. Image package version must equal the installed launcher version before stopping the old container (`packages/app/src/edge/docker-projects/install.ts:104`). Daemon and volume identity mismatches are refused before recovery (`packages/app/src/edge/docker-projects/install.ts:41`).

A transaction records `prepared → stopping → stopped → snapshot → copying → verified → published → starting → healthy → committed`; in-place/reused projects skip copying and verification phases. Failures can persist `restored → rolled-back`. The installer stops the old container with restart disabled, checks writers, snapshots, copies into a private sibling staging directory, verifies, then publishes by rename before starting the candidate (`packages/app/src/edge/docker-projects/state.ts:72`, `packages/app/src/edge/docker-projects/install.ts:183`, `packages/app/src/edge/docker-projects/recover.ts:87`).

Recovery material has three distinct roles:

- The original project tree remains in its original volume or bind. An existing bind is authoritative over hidden volume projects; retry refuses a missing/replaced original bound container when no receipt supersedes it (`packages/app/src/edge/docker-projects/install.ts:61`, `packages/app/src/edge/docker-projects/recover.ts:13`).
- The labelled recovery volume copies and verifies the entire original named volume, including its hidden projects. Its saved `backupDigest` covers private entries and metadata while excluding top-level `projects`. Restore replaces only private entries and verifies that digest (`packages/app/src/edge/docker-projects/volume.ts:18`, `packages/app/src/edge/docker-projects/volume.ts:30`, `packages/app/src/edge/docker-projects/engine.ts:353`).
- Staging and published host files are separate recovery material. Recovery retains them; a published retry must still match its directory identity and digest. `sourceAbsent` preserves the distinction between a missing source and an existing empty directory. Existing sources require before/copy/after hash agreement; missing sources skip copying and require zero copied files (`packages/app/src/edge/docker-projects/install.ts:81`, `packages/app/src/edge/docker-projects/install.ts:191`).

The candidate starts with restart disabled and pending activation. Health waits up to 120 seconds for both health/readiness responses to match the expected version, then verifies that the container is running. The receipt is written before enabling `always`, publishing `committed: true`, and saving the committed phase. Once the receipt points at this transaction, errors require finishing activation on rerun rather than rolling it back (`packages/app/src/edge/docker-projects/engine.ts:429`, `packages/app/src/edge/docker-projects/install.ts:240`).

Restart authority comes from `Receipt.transaction` and that transaction’s matching journal, not merely the mutable top-level journal or matching launcher signature. Validation occurs before a remembered committed container is started. Uncommitted recovery identifies any candidate by transaction/installation/signature, stops and renames it, restores verified private data, then restores the previous container’s name and recorded restart policy, including an `on-failure` retry count. It starts the previous container only if it was recorded running (`packages/app/src/edge/docker-projects/committed.ts:11`, `packages/app/src/edge/docker-projects/recover.ts:27`, `packages/app/src/edge/docker-projects/recover.ts:62`, `packages/app/src/edge/docker-projects/engine.ts:377`).

Claims checking inventories stopped as well as running containers. It permits recorded prior/candidate containers under explicit identity checks. A leftover `slopify-reader-<transaction>` is removed only after checking its reader label, name, image, stopped state, read-only source mounts and absence of extra mounts except `/data` tmpfs. Conflicts retain recovery material. Running-writer checks separately reject writable overlapping bind paths or the installation volume (`packages/app/src/edge/docker-projects/claims.ts:14`, `packages/app/src/edge/docker-projects/engine.ts:149`).

Pending application boot still opens/migrates the private database and performs boot recovery, but defers destructive storage reconciliation. The updater lock blocks queue/schedule mutation admission; managed HTTP mutations return `503` except activation. The watcher checks the committed marker every 250 ms, then settles deferred reconciliation before unlocking mutations. An uncommitted false result after its 120-second deadline shuts down the candidate; marker-check exceptions are logged (`packages/app/src/main.ts:184`, `packages/app/src/main.ts:264`, `packages/app/src/main.ts:375`, `packages/app/src/main.ts:411`, `packages/app/src/edge/http/app.ts:139`, `packages/app/src/updater/candidate.ts:10`, `packages/app/src/updater/service.ts:92`).

The host project directory remains application-managed storage. Reconciliation can remove unregistered files and unknown project directories; it is not a general document folder (`packages/app/src/slices/storage/reconcile.ts:14`, `packages/app/src/slices/storage/reconcile.ts:47`).

## Frontend

Folder actions render inside the React client SPA; no Docker-specific page or server-rendered bundle is added. Vite builds the browser entry from `index.html`, using React and Tailwind plugins. The application build copies the web distribution into `packages/app/dist/web`, and the HTTP server supplies static assets plus an `index.html` fallback (`packages/web/index.html:12`, `packages/web/vite.config.ts:12`, `packages/app/scripts/copy-web.mjs:4`, `packages/app/src/edge/http/app.ts:193`).

The code-defined route tree contains `/`, `/play`, `/templates`, `/schedules`, `/projects/$projectId`, `/prompts`, `/prompts/new`, `/prompts/$promptId`, `/entries`, `/entries/new`, `/entries/$entryId`, `/settings` and `/usage`. All use client rendering; project details receive the route parameter through `ProjectPage` (`packages/web/src/router.tsx:43`, `packages/web/src/router.tsx:87`, `packages/web/src/router.tsx:153`, `packages/web/src/router.tsx:250`).

The client root supplies React Query, app dependencies and TanStack Router. The API seam is `hc<AppType>` plus injected fetch/origin; both folder callers validate `FolderReply` with the shared schema (`packages/web/src/main.tsx:22`, `packages/web/src/api.ts:130`, `packages/web/src/project/open-folder.tsx:37`, `packages/web/src/project/revision-api.ts:201`).

`OpenFolder` uses native button/input elements, Lucide’s folder icon and the project’s Tailwind tokens/Barlow fonts. It disables the action while locating, shows errors inline, and presents Docker’s host path in a read-only input that selects on focus. Native success needs no path display. Changing project/asset/revision/record resets the action through its React key (`packages/web/src/project/open-folder.tsx:14`, `packages/web/src/project/open-folder.tsx:55`, `packages/web/src/styles/index.css:7`, `packages/web/src/main.tsx:1`).
