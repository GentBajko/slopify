---
docker_project_folder_verified_at_commit: a472d51
absorbed_from:
- features/2026-09-25-docker-project-folder@2026-09-25
- features/2026-09-09-pausable-optional-runs@2026-09-10
- features/2026-09-10-subtitles-fonts@2026-09-10
- features/2026-09-10-editable-projects@2026-09-12
scenario: storage-and-downloads
mockup_row: S14
screens:
- 07-projects
- 08-project
depends_on:
- 01-pipeline-lifecycle
- 05-provided-outputs
- 12-reruns-and-edits
generated_date: '2026-09-13'
generated_at_commit: 7bdb84e3f57e
capstone_version: 5.2.0
paths_covered:
  - :(top)packages/app/src/slices/storage/**
  - :(top)packages/app/src/slices/revisions/**
  - :(top)packages/app/src/edge/http/storage.ts
  - :(top)packages/app/src/edge/http/diagnostics.ts
  - :(top)packages/web/src/routes/settings.tsx
  - :(top)packages/web/src/project/**
content_hash: 4dfbc2d26424
---

# 14 Storage and downloads

Project revisions retain immutable media in the local data directory. Saving or restoring configuration shares unchanged assets; only successful new work adds replacements. There is no automatic revision purge.

## Trigger & preconditions

App startup reconciles disk records. Save, provider settlement and local rendering prepare assets for transactional publication. Current outputs and History expose downloads. Delete requires no running stage or in-flight work for the project (`slices/storage/delete-project.ts`).

## Steps

1. Resolve the data directory from launch settings, default `~/.slopify`; create SQLite, `projects/`, `staging/`, logs, fonts, local alignment models and managed-update storage. Acquire its single-instance lock (`kernel/paths.ts`, `main.ts`).
2. Allocate a unique immutable project asset path, write/copy/probe its bytes, then register it with the revision manifest transaction. Keep original filenames and media metadata in descriptors. Revisions share registered assets instead of copying unchanged bytes (`slices/storage/assets.ts`, `prepare.ts`, `slices/revisions/mutations.ts`).
3. A revision output record identifies a role/slot, originating work, asset and fingerprint. Current selection can change while previous records remain retained. Narration pieces also have immutable revision records; accepted partial article results are retained as unselected outdated history without satisfying a complete article (`slices/revisions/manifest-repo.ts`, `slices/rebuild/runtime-publication.ts`).
4. Serve a specific retained record through `/files/:projectId/revisions/:revisionId/:recordId`. Resolve project, revision and record ownership before looking up bytes; build its download name from that revision's title and stored descriptor, so newer title edits do not rename old downloads. `/files/:projectId/revisions/:revisionId/images.zip` follows that revision's selected image order and includes its selected thumbnail (`slices/revisions/downloads.ts`, `edge/http/revision-files.ts`). Records are sent as attachments; `?inline=1` on a PDF (the Document stage's `document.pdf`, served as `application/pdf`) answers `content-disposition: inline` so the project page's Open PDF link reads it in a browser tab, while every other type stays a download. The YouTube description's `description.txt` and `tags.txt` (roles `youtube_description`, `youtube_tags`, stage `video`) are served the same way (scenario 27).
5. Open folder uses the same retained-record ownership lookup. Native execution opens its containing directory; managed Docker returns the actual host directory, which the browser displays for selection/copying. It accepts an identified record, not an arbitrary filesystem path; cross-origin requests are refused (`edge/http/revision-files.ts`, `edge/http/folder-location.ts`).
6. On startup retain all legacy output paths, registered project assets and completed legacy piece paths. Remove unregistered orphan files and unattached staging data. Registry retention includes historical revisions, not merely the latest selection (`slices/storage/reconcile.ts`).
7. Delete removes the project folder first; only after successful removal delete the project row and cascade its revisions, manifests, assets, grants, previews and admissions. A file-manager/OS lock leaves the project listed with a recoverable deletion error (`slices/storage/delete-project.ts`, kernel migrations 0004/0005).
8. Settings → Backup & storage exports everything as one tar streamed from disk (`packages/app/src/slices/storage/backup-export.ts`): a versioned manifest (backup schema, app version, database schema, backup id), the library part (non-secret settings, prompts, intros/outros, voices, document themes, every template version, schedules with their topic queues and run history, unstarted Play drafts with their complete uploads), the usage event log without the install event, one part per project holding every row of its history, then every file under each project folder, uploaded fonts and draft uploads, and a SHA-256 list. Provider keys, the telemetry machine id, logs, the model cache, updates and staging leftovers are never read. Export refuses while any project is running or queued and names them. Import (`packages/app/src/slices/storage/backup-import.ts`) checks every JSON part with zod, loads the rows into a scratch database at the backup's schema and carries them forward with the app's own migrations, then adds: a project whose id is already here is skipped, library items with a taken name come in as "<name> (imported)" and identical ones are skipped, settings only fill unset keys, schedules come in paused, and usage is added once per backup id (`backup_imports`) and marked delivered. The older settings-only .zip (`portable.ts`) still imports.
9. Storage usage reports total data, projects, staging and per-project directory bytes. Diagnostics downloads secret-free JSON with app/schema/platform, provider readiness and configured CLI path, project count and catalogue status (`packages/app/src/slices/storage/portable.ts:224`, `packages/app/src/edge/http/diagnostics.ts:10`).

## Branches

- Missing externally deleted bytes: retain their history/metadata but mark them unavailable. A direct download returns a structured404; image ZIP skips unavailable entries and refuses an empty archive. Explicit affected rebuild can recreate missing work; it does not silently start on download or restore.
- A multi-file export is reusable only if all retained bundle members are available and ready. Surviving render metadata alone cannot suppress a missing WAV/video rebuild (`slices/rebuild/recipe-work.ts`).
- Disk/DB failure before publication: preserve the previous committed revision and its downloads; discard only newly allocated, unreferenced assets. Shared or committed assets are never cleanup candidates (`slices/storage/assets.ts`, `slices/revisions/mutation-prepare.ts`).
- Replacement failure: old completed media remains selected/downloadable, marked outdated where inputs changed. Successful replacement selects new records while retaining old history.
- Whole-project deletion is irreversible. Partial filesystem deletion may already remove some bytes before an OS error; the record remains so deletion can be retried. The operation does not promise filesystem rollback.
- Native file-manager launch failure: return503 with desktop-session guidance. Docker without a verified host location returns503 with managed-launcher guidance; missing/symlinked output paths return404. Retained media stays untouched (`edge/http/folder-location.ts`).

## Unhappy paths

A settings-only .zip larger than the HTTP import limit, a full backup that is damaged, out of order, from a newer Slopify or larger than the free space, an unavailable retained record or an unsafe deletion is rejected without starting provider work. A full backup's files wait under imports/ and are moved into place in the same synchronous step that commits its rows, so a failed import leaves the install unchanged (`packages/app/src/edge/http/storage.ts`, `packages/app/src/slices/storage/backup-import.ts`).

## State transitions

Staged files move into registered immutable project assets when an admission or revision commits. Output records remain retained while a revision's selected manifest changes. Delete removes the project directory before cascading database ownership; a full-backup import adds projects that are not already here with their rows and files verbatim, and never changes an existing project (`packages/app/src/slices/revisions/mutations.ts:47`, `packages/app/src/slices/storage/backup-import.ts`).

## Invariants

- Every project asset is contained under its project directory; asset/record ownership is checked in addition to path containment.
- Save, Restore and downloads never submit providers. An explicit reviewed rebuild is required for missing/outdated work.
- No automatic project/history expiration or intermediate cleanup policy is introduced here.
- Historical and currently selected references both protect assets during startup reconciliation.
- Known active work prevents full-project deletion even if an old revision's visible stage state is no longer running.

## Managed Docker project storage

Scoped source `a472d51`, 2026-09-25. The managed Linux launcher binds only the dedicated host project directory at `/data/projects`; SQLite, credentials, logs, staging and models remain in the private named volume. The default is `~/Slopify/Projects`, or `~/Slopify/<container>/Projects` for a custom container. `--projects-dir`/`SLOPIFY_DOCKER_PROJECTS_DIR` overrides are persisted privately and reused when omitted. Native layout and stored relative asset paths do not change (`packages/app/src/edge/docker-projects/state.ts:133`, `packages/app/src/edge/docker-projects/install.ts:31`).

Migration stops writers, snapshots the private volume, copies all project files and directories to fresh sibling staging, compares full path/size/SHA-256 manifests, and atomically publishes the verified directory. Original files, private recovery snapshots and stopped previous containers are retained. Receipt/journal identities govern retries; missing/replaced folders, foreign volume claims, unsafe paths/permissions and conflicting writers fail closed. A removed original from failed unreceipted bind adoption is refused rather than selecting stale hidden-volume projects. A stale failed copy requires a new empty destination, without deleting recovery records (`packages/app/src/edge/docker-projects/install.ts:31`, `packages/app/src/edge/docker-projects/recover.ts:20`, `packages/app/src/edge/docker-projects/claims.ts:6`).

Rootful execution uses the invoking host UID/GID; supported rootless execution uses verified host mapping. An isolated write probe checks actual ownership before migration. Candidate boot defers normal reconciliation and work until receipt commit and activation; health is bounded and precommit failure restores private state before the original is restarted. Committed recovery validates the exact recorded candidate and mounts before activation. Installation never requests provider regeneration (`packages/app/src/edge/docker-projects/engine.ts:199`, `packages/app/src/edge/docker-projects/activation.ts:15`, `packages/app/src/edge/docker-projects/committed.ts:11`).

This is Slopify-managed storage, not an input or synchronization folder: reconciliation can remove unregistered files. Current and historical downloads keep their owned record IDs; the host-location response does not expose arbitrary filesystem or shell access (`packages/app/src/edge/http/folder-location.ts:13`, `packages/app/src/slices/storage/reconcile.ts:14`).

## Font and model lifetime

System fonts are read from bounded standard OS directories; uploaded `.ttf`/`.otf` files are limited to32MiB, validated and stored by content hash. Each caption export retains its font snapshot, so history remains usable after a system font disappears. Project deletion leaves shared font uploads and the verified English alignment-model cache available to other projects (`slices/fonts/`, `slices/subtitles/prepare.ts`).

## Verification

`storage/delete-history.test.ts`, `storage/reconcile.test.ts`, `revisions/downloads.test.ts`, `download-permissions.test.ts`, `edge/http/revision-files.test.ts`, `revision-delete.test.ts`, and composed `test/revision-restart.test.ts` / `revision-bundle-recovery.test.ts` cover retained ownership, missing files, restart, deletion and real WAV recovery. Native Windows acceptance exercises the composed paths with real FFmpeg.

## Outcomes & side effects

Storage mutations write local files and SQLite ownership records. Downloads and diagnostics are read-only; Open folder asks the host OS to reveal an already-owned output directory. Import only adds: existing projects, library items and settings are never replaced (`packages/app/src/edge/http/diagnostics.ts:10`, `packages/app/src/slices/storage/backup-import.ts`).

## Dimensions not in play

A backup is not a credential backup: provider keys must be entered again after an import. Storage usage does not impose a quota or automatic cleanup schedule, and retained project history has no automatic expiry (`packages/app/src/slices/storage/backup-format.ts`, `packages/app/src/slices/storage/portable.ts`).
