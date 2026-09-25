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

# Docker Storage and Folder Access

Scoped baseline before host-project-folder migration; unrelated historical chapter stamps are unchanged.

## Layers

The host CLI prepares an optional host-provider helper, then starts a Linux shell launcher. The container runs the application with a private data root at `/data`. All project bytes currently remain inside that root's named volume (`packages/app/src/edge/cli.ts:36`, `packages/app/scripts/docker-run.sh:57`, `Dockerfile:19`).

## Module boundaries

- The shell launcher owns image selection, named volume, localhost port, optional helper-share bind, container replacement and immediate launch-failure rollback. It does not migrate project files or persist an installation receipt (`packages/app/scripts/docker-run.sh:9`, `:36`, `:57`).
- `prepareDockerHostCli` owns host-provider consent, installation and systemd service setup. API-only mode bypasses it; its receipt concerns CLI access, not project storage (`packages/app/src/edge/docker.ts:23`).
- `layout` places database, projects, staging, logs and lock under one data directory. `ensureDirs` forces the caller's mode even on existing directories (`packages/app/src/kernel/paths.ts:17`, `:29`).
- Asset publication creates private files; storage reconciliation retains registered outputs, immutable project assets and files referenced by unfinished stage pieces, then deletes unregistered content (`packages/app/src/slices/storage/assets.ts:62`, `reconcile.ts:14`).

## Entry points

`slopify --docker` accepts an optional port and host-CLI choices, but rejects native host/data-dir overrides. It invokes packaged `scripts/docker-run.sh`; the script's environment overrides image, container name, volume and port (`packages/app/src/edge/cli.ts:15`, `:33`, `:66`; `packages/app/scripts/docker-run.sh:9`).

## Communication

The launcher compares a label hash of image ID, volume, port, helper path and protocol. A changed signature disables the prior restart policy, stops and renames the old container, then creates the replacement. A failed Docker run restores the prior container; a successful run is not followed by an application-health wait. The stopped prior container uses the same data volume, so it is not an independent data backup (`packages/app/scripts/docker-run.sh:36`, `:45`, `:50`, `:66`).

## Composition

The image runs as `node`, sets `HOME=/data/home`, declares `/data` as a volume and exposes health checking. The launcher mounts that volume read/write and the optional helper share read-only; there is no projects bind mount or host-owner mapping (`Dockerfile:19`, `:50`; `packages/app/scripts/docker-run.sh:28`, `:62`).

## Frontend

Current and historical output actions ask the server to open a verified saved file's directory. The injected native opener runs on the application's machine; in Docker that is the container. Success returns `opened: true`; failure reports an unavailable desktop session. The browser does not receive a real host path (`packages/app/src/edge/http/open-folder.ts:64`, `revision-files.ts:69`, `packages/web/src/project/open-folder.tsx:20`).

