---
generated_at_commit: a472d513f12c
generated_date: 2026-09-25
content_hash: 871c655a48a5
paths_covered:
  - ':(top)packages/app/src/edge/cli.ts'
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
  - ':(top)packages/app/src/edge/http/folder-location-schema.ts'
  - ':(top)packages/app/src/edge/http/folder-location.ts'
  - ':(top)packages/app/src/edge/http/open-folder.ts'
  - ':(top)packages/app/src/edge/http/revision-files.ts'
  - ':(top)packages/app/src/host-cli/install.ts'
  - ':(top)packages/app/src/host-cli/service.ts'
  - ':(top)packages/app/src/kernel/db/migrate.ts'
  - ':(top)packages/app/src/kernel/paths.ts'
  - ':(top)packages/app/src/main.ts'
  - ':(top)packages/app/src/slices/revisions/downloads.ts'
  - ':(top)packages/app/src/slices/storage/downloads.ts'
  - ':(top)packages/web/src/project/open-folder.tsx'
  - ':(top)packages/web/src/project/revision-api.ts'
absorbed_from:
  - features/2026-09-25-docker-project-folder@2026-09-25
---

# Docker storage models


Scope: installation configuration and records, filesystem identity/digests, application paths and folder replies. Executable dependency ports and component props are not persisted entities. Anonymous wire records remain anonymous; their fields are documented below or in `01-architecture-docker.md § Communication`.

## Entities

| Name | Definition site | Storage | Purpose |
| --- | --- | --- | --- |
| DockerHostOptions | `packages/app/src/edge/docker.ts:26` | In memory | Inputs to optional host-helper setup. |
| DockerConfig | `packages/app/src/edge/docker-projects/state.ts:120` | In memory | Resolved host installation configuration. |
| Container | `packages/app/src/edge/docker-projects/state.ts:32`, `packages/app/src/edge/docker-projects/state.ts:54` | In memory; embedded in journals | Normalized Docker inspection and previous-container state. |
| Receipt | `packages/app/src/edge/docker-projects/state.ts:55`, `packages/app/src/edge/docker-projects/state.ts:71` | Private `receipt.json`; embedded in journals | Committed installation and transaction authority. |
| Journal | `packages/app/src/edge/docker-projects/state.ts:86`, `packages/app/src/edge/docker-projects/state.ts:119` | Private installation and transaction `journal.json` files | Durable migration/recovery state. |
| Identity | `packages/app/src/edge/docker-projects/tree.ts:6` | In memory; structurally embedded in records | Directory device/inode identity. |
| Digest | `packages/app/src/edge/docker-projects/tree.ts:10` | In memory; structurally embedded in journals and helper replies | Verified tree hash and size counters. |
| Paths | `packages/app/src/kernel/paths.ts:4` | In memory | Application filesystem layout. |
| FolderReply | `packages/app/src/edge/http/folder-location-schema.ts:3`, `packages/app/src/edge/http/folder-location-schema.ts:13` | HTTP JSON and browser memory | Native open acknowledgement or Docker host-folder location. |

## Fields and types

Nullable fields are required unless marked otherwise. Schema defaults describe accepted input; parsed records contain the defaulted field. `Identity` and `Digest` name the existing interfaces whose shapes match the corresponding Zod schemas.

### DockerHostOptions

Source: `packages/app/src/edge/docker.ts:26`.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| root | string | yes | Private helper state root, separate from Docker installation state. |
| version | string | yes | Installed application version. |
| image | string | yes | Image reference used for protocol compatibility checking. |
| disabled | boolean | yes | True returns without helper setup. |
| accepted | boolean | yes | Explicit helper consent. |
| interactive | boolean | yes | Whether prompting is available. |
| prompt | (message: string) => Promise<boolean> | yes | Consent callback. |
| runner | HostSetupRunner | yes | Command port declared at `packages/app/src/host-cli/install.ts:9`. |
| env | Readonly<NodeJS.ProcessEnv> | yes | Host environment. |
| signal | AbortSignal | yes | Setup cancellation/deadline. |

### DockerConfig

Source and conversion: `packages/app/src/edge/docker-projects/state.ts:120`, `packages/app/src/edge/docker-projects/state.ts:133`.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| home | string | yes | Host home supplied by launcher. |
| uid | number | yes | Installing host user ID. |
| gid | number | yes | Installing host group ID. |
| root | string | yes | `<XDG_DATA_HOME or ~/.local/share>/slopify/docker`. |
| directory | string | yes | `<root>/<name>`. |
| name | string | yes | `SLOPIFY_DOCKER_NAME`, default `slopify`; 1–128 characters. |
| volume | string | yes | `SLOPIFY_DOCKER_VOLUME`, default `slopify-data`; 1–128 characters. |
| image | string | yes | `SLOPIFY_DOCKER_IMAGE`, default `ghcr.io/gentbajko/slopify:latest`. |
| port | number | yes | `SLOPIFY_DOCKER_HOST_PORT`, default `6969`; integer 0–65535. |
| projectsOverride | string \| null | yes | Resolved `SLOPIFY_DOCKER_PROJECTS_DIR`; empty/unset becomes null. Leading `~/` expands against `home`; relative input resolves against cwd. |
| bridge | string \| null | yes | `SLOPIFY_HOST_CLI_DIR`; empty/unset becomes null. |

### Container

Source: `packages/app/src/edge/docker-projects/state.ts:32`. Nested mount/restart objects have no separately declared type names.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| id | string | yes | Docker container ID. |
| name | string | yes | Inspected name with leading slash removed. |
| image | string | yes | Inspected image ID. |
| user | string | yes | Inspected configured user. |
| running | boolean | yes | Recorded running state. |
| restart | { Name: string; MaximumRetryCount: number } | yes | Both nested fields required; retry count is an integer. |
| signature | string \| null | yes | `io.slopify.launcher` label or null. |
| installation | string \| null | yes | `io.slopify.installation` label or null. |
| mounts | { type: string; name: string; source: string; destination: string; rw: boolean }[] | yes | Every nested field required; missing Docker mount name becomes `""`. |
| port | string \| null | yes | First `6969/tcp` binding encoded as `HostIp:HostPort`, or null. |

The schema does not enumerate restart-policy strings or mount types. Transaction and reader labels are queried separately rather than stored as fields of `Container` (`packages/app/src/edge/docker-projects/engine.ts:100`, `packages/app/src/edge/docker-projects/recover.ts:66`, `packages/app/src/edge/docker-projects/claims.ts:33`).

### Receipt

Source: `packages/app/src/edge/docker-projects/state.ts:55`.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| version | 1 | yes | accepted: 1 |
| installation | string | yes | UUID retained across committed replacements. |
| daemon | string | yes | Docker daemon ID. |
| name | string | yes | Installation/container name; validated identifier, maximum 128. |
| volume | string | yes | Private named volume; validated identifier, maximum 128. |
| volumeIdentity | string | yes | Serialized volume name/creation time/driver tuple. |
| projects | string | yes | Canonical absolute host projects path, maximum 4096 characters. |
| directoryIdentity | Identity | yes | Published directory device/inode. |
| user | string | yes | Selected container user. |
| image | string | yes | Resolved image ID. |
| signature | string | yes | Launcher configuration hash. |
| transaction | string | yes | UUID of the authoritative transaction directory. |

### Journal

Source: `packages/app/src/edge/docker-projects/state.ts:72`, `packages/app/src/edge/docker-projects/state.ts:86`.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| version | 1 | yes | accepted: 1 |
| id | string | yes | Transaction UUID. |
| installation | string | yes | Installation UUID. |
| daemon | string | yes | Docker daemon ID. |
| name | string | yes | Validated identifier, maximum 128. |
| volume | string | yes | Validated identifier, maximum 128. |
| volumeIdentity | string \| null | yes | Null allowed before a fresh volume exists. |
| image | string | yes | Resolved image ID. |
| user | string | yes | Selected container user. |
| signature | string | yes | Launcher configuration hash. |
| phase | "prepared" \| "stopping" \| "stopped" \| "snapshot" \| "copying" \| "verified" \| "published" \| "starting" \| "healthy" \| "committed" \| "restored" \| "rolled-back" | yes | accepted: prepared, stopping, stopped, snapshot, copying, verified, published, starting, healthy, committed, restored, rolled-back |
| previous | Container \| null | yes | Previous container, including original running/restart state. |
| previousReceipt | Receipt \| null | yes | Previous committed installation record. |
| sourceBind | string \| null | yes | Original authoritative host projects bind, if any. |
| sourceIdentity | Identity \| null | yes | Input may omit; parser defaults to null. Required by recovery when `sourceBind` is non-null. |
| destination | string | yes | Selected host projects path. |
| destinationBefore | Identity \| null | yes | Existing empty destination identity, or null when absent. |
| staging | string | yes | Sibling `.slopify-projects-<id>` path. |
| stagingIdentity | Identity \| null | yes | Identity captured after creating staging. |
| publishedIdentity | Identity \| null | yes | Identity of the published destination. |
| sourceDigest | Digest \| null | yes | Source/copy baseline; can hold the empty published digest when the original source was absent. |
| sourceAbsent | boolean | yes | Input may omit; parser defaults to false. Distinguishes absence from an existing empty tree. |
| backup | string | yes | `<volume>-recovery-<id>`; validated identifier, maximum 174 characters. |
| backupDigest | Digest \| null | yes | Metadata-sensitive recovery digest excluding top-level `projects`. |
| candidate | string \| null | yes | Candidate container ID once known. |
| token | string | yes | Exactly 64 lowercase hexadecimal characters. |

The backup limit is deliberately larger than the configuration identifier limit: 128 characters for the volume, 10 for `-recovery-`, and 36 for the UUID total 174 (`packages/app/src/edge/docker-projects/state.ts:14`, `packages/app/src/edge/docker-projects/state.ts:110`, `packages/app/src/edge/docker-projects/install.ts:167`).

### Identity

Source: `packages/app/src/edge/docker-projects/tree.ts:6`; matching strict schema: `packages/app/src/edge/docker-projects/state.ts:24`.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| dev | string | yes | BigInt filesystem device number converted to string. |
| ino | string | yes | BigInt inode number converted to string. |

### Digest

Source: `packages/app/src/edge/docker-projects/tree.ts:10`; matching strict schema: `packages/app/src/edge/docker-projects/state.ts:25`.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| hash | string | yes | SHA-256 hexadecimal digest; schema requires 64 lowercase hex characters. |
| files | number | yes | Nonnegative integer count of regular files. |
| bytes | number | yes | Nonnegative integer total regular-file bytes. |

### Paths

Source and construction: `packages/app/src/kernel/paths.ts:4`, `packages/app/src/kernel/paths.ts:17`.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| dataDir | string | yes | Resolved application data root; `/data` in the image. |
| db | string | yes | `<dataDir>/slopify.db`. |
| projects | string | yes | `<dataDir>/projects`; managed Docker overlays this with the host bind. |
| staging | string | yes | `<dataDir>/staging`; application upload staging, distinct from host migration staging. |
| logs | string | yes | `<dataDir>/logs`. |
| lock | string | yes | `<dataDir>/.lock`; distinct from the host setup lock. |

### FolderReply

Source: `packages/app/src/edge/http/folder-location-schema.ts:3`.

This is a strict discriminated union. `location` and `path` are absent from the `opened: true` branch and required in the `opened: false` branch.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| opened | true \| false | yes | accepted: true, false |
| location | "docker-host" | no | Required when `opened` is false; accepted: docker-host |
| path | string | no | Required when `opened` is false; nonempty host directory path. |

## Relationships

`DockerConfig.directory` contains the installation’s `receipt.json`, mutable `journal.json`, and UUID transaction directories. Each transaction has its own `journal.json` and `activation.json`. Normal phase saves write the transaction journal before the installation journal (`packages/app/src/edge/docker-projects/install.ts:36`, `packages/app/src/edge/docker-projects/install.ts:137`, `packages/app/src/edge/docker-projects/install.ts:172`).

`Receipt.transaction` selects the authoritative transaction journal. That journal must agree on installation, daemon, name, volume identity, destination, image, user, signature and published directory identity. If a current container exists, its ID must equal `Journal.candidate` and its relevant mounts must match (`packages/app/src/edge/docker-projects/committed.ts:11`).

A `Journal` embeds the previous `Container` and optional `Receipt`, plus directory identities and digests for the source, staging, destination and private backup. `sourceBind` identifies the original project authority; it is not replaced by hidden volume projects during recovery (`packages/app/src/edge/docker-projects/recover.ts:13`, `packages/app/src/edge/docker-projects/install.ts:61`).

The named data volume contains private application state. `/data/projects` is overlaid by the host project directory; `/opt/slopify-install` exposes only the transaction directory read-only. The optional host-helper share has a separate mount and consent record (`packages/app/src/edge/docker-projects/engine.ts:408`, `packages/app/src/edge/docker.ts:62`).

Docker folder replies derive their path from the configured host root plus the verified saved file’s relative parent. Browser requests carry project/output identifiers, never an arbitrary filesystem path (`packages/app/src/edge/http/open-folder.ts:43`, `packages/app/src/edge/http/revision-files.ts:65`, `packages/app/src/edge/http/folder-location.ts:29`).

## Boundaries

Environment → `DockerConfig`: `dockerConfig` validates identifiers/port/image, expands the project override and derives private-state locations (`packages/app/src/edge/docker-projects/state.ts:133`). Host CLI arguments become environment overrides before invoking the launcher (`packages/app/src/edge/cli.ts:76`).

Docker inspect JSON → `Container`: `inspect` validates the raw response, normalizes the name and mount fields, selects labels and converts the first application port binding to a string (`packages/app/src/edge/docker-projects/engine.ts:100`). Volume inspection → identity string is `JSON.stringify([Name, CreatedAt, Driver])`; it is not a volume-content hash (`packages/app/src/edge/docker-projects/engine.ts:268`).

Filesystem → `Identity`: `lstat(..., { bigint: true })` rejects a non-directory/symlink and stringifies `dev`/`ino` (`packages/app/src/edge/docker-projects/tree.ts:15`).

Filesystem → `Digest`: sorted traversal hashes relative names, entry kinds and file-content hashes. Metadata mode adds UID/GID/mode and permits symlink metadata; ordinary project mode rejects symlinks and multiply linked files. `omitProjects` skips only the root’s `projects` entry. File identity, size and modification checks detect changes during reads (`packages/app/src/edge/docker-projects/tree.ts:94`).

Helper JSON → source baseline: `{ exists: false }` becomes `null`; `{ exists: true; digest: Digest }` becomes a digest. An empty existing directory still has a digest. After publishing an empty copy of an absent source, `sourceDigest` can be non-null while `sourceAbsent` remains true; retry compares absence separately from hashes (`packages/app/src/edge/docker-projects/volume.ts:9`, `packages/app/src/edge/docker-projects/engine.ts:307`, `packages/app/src/edge/docker-projects/install.ts:191`, `packages/app/src/edge/docker-projects/install.ts:214`).

Records ↔ JSON files: `readState` checks the file, reads JSON and parses the supplied schema; `writeState` serializes with a 64-KiB limit, uses a private atomic write and syncs the containing directory. `privateWrite` creates an exclusive mode-0600 temporary file, syncs it and renames it (`packages/app/src/edge/docker-projects/state.ts:193`, `packages/app/src/host-cli/service.ts:47`, `packages/app/src/host-cli/service.ts:66`).

The activation schema has no declared TypeScript entity alias. Its complete JSON shape is:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| version | 1 | yes | accepted: 1 |
| token | string | yes | 64 lowercase hexadecimal characters; matches the candidate token. |
| committed | boolean | yes | Written false before startup and true after receipt publication. |

Writer: `packages/app/src/edge/docker-projects/install.ts:178`, `packages/app/src/edge/docker-projects/install.ts:260`. Strict parser and constant-time token comparison: `packages/app/src/edge/docker-projects/activation.ts:7`.

Registered storage → folder DTO: current assets resolve through `findDownload`; retained records resolve through revision output/piece registration and project assets. `replyForFolder` either calls the native opener or maps the verified file into a host directory and parses the outgoing union. Browser callers parse it again (`packages/app/src/slices/storage/downloads.ts:74`, `packages/app/src/slices/revisions/downloads.ts:15`, `packages/app/src/edge/http/folder-location.ts:42`, `packages/web/src/project/open-folder.tsx:46`, `packages/web/src/project/revision-api.ts:211`).

## Validation

State schemas are strict at their declared record boundaries. Names/volumes use `[a-zA-Z0-9][a-zA-Z0-9_.-]*` with a 128-character limit; recovery names permit 174. Recorded paths must be canonical absolute paths, at most 4096 characters, without commas/control characters. UUIDs, digest counters, tokens and phases are validated explicitly (`packages/app/src/edge/docker-projects/state.ts:14`, `packages/app/src/edge/docker-projects/state.ts:55`, `packages/app/src/edge/docker-projects/state.ts:86`).

Private directories must have safe ancestors and be private/user-owned at the leaf. State files must be user-owned, singly linked regular files without group/other permission bits. Files are opened without following symlinks (`packages/app/src/edge/docker-projects/state.ts:170`, `packages/app/src/edge/docker-projects/state.ts:193`, `packages/app/src/host-cli/service.ts:47`).

Project-path checks reject broad roots, overlap with private installation state, protected system trees, symlink/non-directory components and unsafe writable ancestors. Existing source trees must belong to the host user and supply owner read/write permissions, plus directory traversal. Newly copied trees are normalized to directory mode 0700 and file mode 0600; arbitrary existing source files are not recursively re-owned by this step (`packages/app/src/edge/docker-projects/tree.ts:29`, `packages/app/src/edge/docker-projects/tree.ts:151`, `packages/app/src/edge/docker-projects/tree.ts:165`).

Cross-record validation is separate from schema parsing. It checks remembered daemon/volume identity, source identity, receipt/journal agreement, actual committed-container identity/mounts, competing volume claims and overlapping running writers. A matching label alone is insufficient restart authority (`packages/app/src/edge/docker-projects/install.ts:41`, `packages/app/src/edge/docker-projects/committed.ts:21`, `packages/app/src/edge/docker-projects/claims.ts:6`, `packages/app/src/edge/docker-projects/engine.ts:149`).

Recovery-volume restore requires the matching `io.slopify.transaction` label and a matching private digest before and after restoration. The full snapshot includes original volume projects, but private restoration skips projects; source binds and published copies remain separate (`packages/app/src/edge/docker-projects/engine.ts:184`, `packages/app/src/edge/docker-projects/engine.ts:353`, `packages/app/src/edge/docker-projects/volume.ts:18`).

At runtime, managed folder configuration requires `SLOPIFY_CONTAINER=1`, the fixed activation path, a canonical host path, and `/data/projects` as a real directory/mountpoint in `/proc/self/mountinfo`. This runtime check establishes the mountpoint; host-side receipt/inspection checks establish the expected bind source (`packages/app/src/edge/docker-projects/activation.ts:23`, `packages/app/src/edge/docker-projects/committed.ts:38`).

Folder request IDs are 1–64 characters matching `[0-9A-Za-z_-]+`. Current asset names are at most 64 characters and match lowercase alphanumeric/hyphen names or `images.zip`. Current `images.zip` folder lookup chooses the first existing registered image/thumbnail instead of creating an archive. Docker replies reject paths outside projects and symlinks/nonmatching entry kinds throughout the resolved file path (`packages/app/src/edge/http/open-folder.ts:13`, `packages/app/src/edge/http/open-folder.ts:45`, `packages/app/src/edge/http/revision-files.ts:11`, `packages/app/src/edge/http/folder-location.ts:29`).

## Schema

This scope adds no SQLite table, index, constraint or SQL migration. `Receipt`, `Journal` and activation state are private JSON files; `Container` is Docker metadata; the remaining entities are runtime values or HTTP DTOs. There are no Docker-owned tables lacking a corresponding code model.

Application migrations still run against the private database during candidate boot (`packages/app/src/main.ts:184`, `packages/app/src/kernel/db/migrate.ts:10`). Existing output and revision-asset registrations remain database-owned; Docker changes their filesystem placement through the projects bind, without introducing a database representation of the host root (`packages/app/src/slices/storage/downloads.ts:79`, `packages/app/src/slices/revisions/downloads.ts:25`, `packages/app/src/edge/docker-projects/engine.ts:408`).
