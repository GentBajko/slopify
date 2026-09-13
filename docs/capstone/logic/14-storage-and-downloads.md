---
absorbed_from:
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
generated_date: '2026-09-12'
generated_at_commit: 29b88494eb40
---

# 14 Storage and downloads

Project revisions retain immutable media in the local data directory. Saving or restoring configuration shares unchanged assets; only successful new work adds replacements. There is no automatic revision purge.

## Trigger & preconditions

App startup reconciles disk records. Save, provider settlement and local rendering prepare assets for transactional publication. Current outputs and History expose downloads. Delete requires no running stage or in-flight work for the project (`slices/storage/delete-project.ts`).

## Steps

1. Resolve the data directory from launch settings, default `~/.slopify`; create SQLite, `projects/`, `staging/`, logs, fonts, local alignment models and managed-update storage. Acquire its single-instance lock (`kernel/paths.ts`, `main.ts`).
2. Allocate a unique immutable project asset path, write/copy/probe its bytes, then register it with the revision manifest transaction. Keep original filenames and media metadata in descriptors. Revisions share registered assets instead of copying unchanged bytes (`slices/storage/assets.ts`, `prepare.ts`, `slices/revisions/mutations.ts`).
3. A revision output record identifies a role/slot, originating work, asset and fingerprint. Current selection can change while previous records remain retained. Narration pieces also have immutable revision records; accepted partial article results are retained as unselected outdated history without satisfying a complete article (`slices/revisions/manifest-repo.ts`, `slices/rebuild/runtime-publication.ts`).
4. Serve a specific retained record through `/files/:projectId/revisions/:revisionId/:recordId`. Resolve project, revision and record ownership before looking up bytes; build its download name from that revision's title and stored descriptor, so newer title edits do not rename old downloads. `/files/:projectId/revisions/:revisionId/images.zip` follows that revision's selected image order and includes its selected thumbnail (`slices/revisions/downloads.ts`, `edge/http/revision-files.ts`).
5. Open folder uses the same retained-record ownership lookup and opens its containing directory on the machine hosting Slopify. It accepts an identified record, not an arbitrary filesystem path; cross-origin requests are refused (`edge/http/revision-files.ts`).
6. On startup retain all legacy output paths, registered project assets and completed legacy piece paths. Remove unregistered orphan files and unattached staging data. Registry retention includes historical revisions, not merely the latest selection (`slices/storage/reconcile.ts`).
7. Delete removes the project folder first; only after successful removal delete the project row and cascade its revisions, manifests, assets, grants, previews and admissions. A file-manager/OS lock leaves the project listed with a recoverable deletion error (`slices/storage/delete-project.ts`, kernel migrations 0004/0005).

## Branches and unhappy paths

- Missing externally deleted bytes: retain their history/metadata but mark them unavailable. A direct download returns a structured404; image ZIP skips unavailable entries and refuses an empty archive. Explicit affected rebuild can recreate missing work; it does not silently start on download or restore.
- A multi-file export is reusable only if all retained bundle members are available and ready. Surviving render metadata alone cannot suppress a missing WAV/video rebuild (`slices/rebuild/recipe-work.ts`).
- Disk/DB failure before publication: preserve the previous committed revision and its downloads; discard only newly allocated, unreferenced assets. Shared or committed assets are never cleanup candidates (`slices/storage/assets.ts`, `slices/revisions/mutation-prepare.ts`).
- Replacement failure: old completed media remains selected/downloadable, marked outdated where inputs changed. Successful replacement selects new records while retaining old history.
- Whole-project deletion is irreversible. Partial filesystem deletion may already remove some bytes before an OS error; the record remains so deletion can be retried. The operation does not promise filesystem rollback.
- File-manager launch failure: return503 with desktop-session guidance; retained media stays untouched.

## Invariants

- Every project asset is contained under its project directory; asset/record ownership is checked in addition to path containment.
- Save, Restore and downloads never submit providers. An explicit reviewed rebuild is required for missing/outdated work.
- No automatic project/history expiration or intermediate cleanup policy is introduced here.
- Historical and currently selected references both protect assets during startup reconciliation.
- Known active work prevents full-project deletion even if an old revision's visible stage state is no longer running.

## Font and model lifetime

System fonts are read from bounded standard OS directories; uploaded `.ttf`/`.otf` files are limited to32MiB, validated and stored by content hash. Each caption export retains its font snapshot, so history remains usable after a system font disappears. Project deletion leaves shared font uploads and the verified English alignment-model cache available to other projects (`slices/fonts/`, `slices/subtitles/prepare.ts`).

## Verification

`storage/delete-history.test.ts`, `storage/reconcile.test.ts`, `revisions/downloads.test.ts`, `download-permissions.test.ts`, `edge/http/revision-files.test.ts`, `revision-delete.test.ts`, and composed `test/revision-restart.test.ts` / `revision-bundle-recovery.test.ts` cover retained ownership, missing files, restart, deletion and real WAV recovery. Native Windows acceptance exercises the composed paths with real FFmpeg.
