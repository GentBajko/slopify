---
generated_at_commit: d5fd1db5e46a
generated_date: 2026-09-25
content_hash: 42094e1ed441
paths_covered:
  - ':(top)Dockerfile'
  - ':(top)packages/app/scripts/docker-run.sh'
  - ':(top)packages/app/src/edge/cli.ts'
  - ':(top)packages/app/src/edge/docker.ts'
  - ':(top)packages/app/src/kernel/paths.ts'
  - ':(top)packages/app/src/slices/storage/assets.ts'
  - ':(top)packages/app/src/slices/storage/reconcile.ts'
  - ':(top)packages/app/src/edge/http/open-folder.ts'
  - ':(top)packages/app/src/edge/http/revision-files.ts'
  - ':(top)packages/web/src/project/open-folder.tsx'
---

# Docker Storage Models

Scoped baseline: no host-project-directory receipt or migration journal exists.

## Entities

### Paths

The application filesystem layout is derived from one resolved data root (`packages/app/src/kernel/paths.ts:5`, `:17`).

### Launcher configuration

The shell reads installation choices from environment variables and stores only a reconciliation signature on the container (`packages/app/scripts/docker-run.sh:9`, `:36`).

### Folder response

Both current and retained-output routes return a folder-open acknowledgement after resolving a registered file (`packages/app/src/edge/http/open-folder.ts:65`, `revision-files.ts:70`).

## Fields and types

| Entity | Field | Type | Required |
| --- | --- | --- | --- |
| Paths | dataDir, db, projects, staging, logs, lock | Absolute path string | Yes |
| Launcher configuration | image | Image reference; default ghcr.io/gentbajko/slopify:latest | Defaulted |
| Launcher configuration | container | Name; default slopify | Defaulted |
| Launcher configuration | volume | Name; default slopify-data | Defaulted |
| Launcher configuration | host_port | Decimal port 0–65535; default 6969 | Defaulted |
| Launcher configuration | bridge_directory | Optional helper share path | No |
| Container label | io.slopify.launcher | SHA-256 reconciliation identity | Launcher-created containers |
| Folder response | opened | Literal true | Successful response |

Sources: `packages/app/src/kernel/paths.ts:5`, `packages/app/scripts/docker-run.sh:9`, `:22`, `:36`, `packages/app/src/edge/http/open-folder.ts:66`.

## Relationships

Project asset paths remain relative to their project. The named data volume contains both the private database and all project directories. A helper-share bind contains a socket/token for host-provider access, not an export folder. A retained record identifies the registered file opened/downloaded; the browser does not submit a filesystem path (`packages/app/src/slices/storage/assets.ts:26`, `packages/app/scripts/docker-run.sh:28`, `:62`, `packages/app/src/edge/http/revision-files.ts:53`).

## Boundaries

No project-file mount, public export root or installation journal is persisted. Unknown files under the managed projects tree can be removed by boot reconciliation; it is not a general-purpose user document directory (`packages/app/src/slices/storage/reconcile.ts:45`). Database/credential storage is outside any current separate public-folder contract (`packages/app/src/kernel/paths.ts:17`).

## Validation

The launcher validates port syntax and verifies optional helper directory/socket/token presence. A pre-existing container must use the expected named data volume before replacement. Folder endpoints validate IDs and same-origin requests, then resolve existing registered files; failures return typed HTTP errors rather than an arbitrary path opener (`packages/app/scripts/docker-run.sh:13`, `:24`, `:45`; `packages/app/src/edge/http/open-folder.ts:14`, `:36`; `revision-files.ts:53`).

## Schema

There is no storage schema migration for Docker. The filesystem layout and shell environment are runtime configuration; immutable file registration and revision records stay in the application database (`packages/app/src/kernel/paths.ts:17`, `packages/app/src/slices/storage/reconcile.ts:18`).

