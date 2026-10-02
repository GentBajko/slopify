---
scenario: trash-and-scheduled-backups
screens: [01-projects, 08-settings]
depends_on: [01-pipeline-lifecycle, 13-cancel, 14-storage-and-downloads, 15-prompt-management, 21-app-updater, 22-play-drafts, 24-project-templates, 25-scheduled-jobs]
generated_at_commit: 14480f26c13e
generated_date: 2026-10-02
capstone_version: 7.0.1
content_hash: 47be878897d3
paths_covered:
  - ":(top)packages/app/src/slices/trash/**"
  - ":(top)packages/app/src/slices/backups/**"
  - ":(top)packages/app/src/slices/storage/backup-*.ts"
  - ":(top)packages/app/src/slices/storage/delete-project.ts"
  - ":(top)packages/app/src/slices/storage/portable.ts"
  - ":(top)packages/app/src/slices/batch/index.ts"
  - ":(top)packages/app/src/edge/http/trash.ts"
  - ":(top)packages/app/src/edge/http/backups.ts"
  - ":(top)packages/app/src/edge/http/storage.ts"
  - ":(top)packages/app/src/edge/http/projects.ts"
  - ":(top)packages/app/src/kernel/db/migrations/0039-channel-essentials.sql"
  - ":(top)packages/app/src/main.ts"
  - ":(top)packages/web/src/trash/**"
  - ":(top)packages/web/src/routes/settings-backups.tsx"
  - ":(top)packages/web/src/routes/settings.tsx"
---

# 40 Trash, scheduled backups, Export and Import everything

Three ways the install keeps what the user made: a 30-day trash that every delete of a project, prompt, intro/outro, template or schedule goes through (`packages/app/src/slices/trash/model.ts:7-13`); Export everything / Import a backup, a streamed `.tar` of the whole install (`packages/app/src/slices/storage/backup-format.ts:4-18`); and scheduled backups, which write that same archive into a folder once a day and keep the newest few (`packages/app/src/slices/backups/model.ts:4-9`). HTTP: `/api/trash`, `/api/backups`, `/api/storage/export*`, `/api/storage/import` (`packages/app/src/edge/http/app.ts:177-179`). Disk layout, Keep outputs only, orphan cleanup and moving files are scenario 14.

## Trigger & preconditions

| Trigger | Where | Precondition |
|---|---|---|
| Delete a project | Projects row delete, confirm "Moves the project to the trash for 30 days. Restore it or delete it for good in Settings → Trash." (`packages/web/src/routes/projects.tsx:306-309`) → `DELETE /api/projects/:id` (`packages/app/src/edge/http/projects.ts:136-153`) | Project exists and is not already trashed; not busy (in-flight call or derived state `running`) (`packages/app/src/slices/trash/service.ts:73-87`, `packages/app/src/slices/storage/delete-project.ts:35-42`) |
| Delete a prompt / intro-outro | Library delete → `trashPrompt` / entries equivalent (`packages/app/src/slices/library/repo.ts:68-78`, `:132`) | Row live (`deleted_at IS NULL`) |
| Delete a template | Templates delete (`packages/app/src/slices/project-templates/service.ts:112-135`) | Base version matches; no live schedule names it, else `referenced-by-schedule` (`service.ts:122-127`) |
| Delete a schedule | Schedules delete (`packages/app/src/slices/schedules/service.ts:170-188`) | Status `completed` or `canceled`, else `cancel-required`; version matches (`service.ts:179-181`) |
| List / Restore / Delete now | Settings → Trash (`packages/web/src/trash/trash-settings.tsx:50-160`, `packages/web/src/routes/settings.tsx:151`, `:310`) → `GET /api/trash`, `POST /api/trash/:kind/:id/restore`, `DELETE /api/trash/:kind/:id` (`packages/app/src/edge/http/trash.ts:58-77`) | `kind` ∈ project/prompt/entry/template/schedule; `id` 1–64 chars `[0-9A-Za-z_-]` (`trash.ts:10-17`) |
| Daily purge | Timer in `main.ts`: once at start, then hourly; purges when ≥ 24 h since the last purge of this process (`packages/app/src/main.ts:709-729`, `packages/app/src/slices/trash/service.ts:313-323`) | Updater gate open (`main.ts:717-720`) |
| Export everything | Settings → Backup & storage "Export everything", or command palette (`packages/web/src/routes/settings.tsx:365-393`, `:471-480`, `:487-490`) → `GET /api/storage/export/summary` then `GET /api/storage/export` (`packages/app/src/edge/http/storage.ts:90-138`) | No busy project (below) |
| Import a backup | "Import a backup" file input accepting `.tar`/`.zip` (`packages/web/src/routes/settings.tsx:396-445`, `:491-506`) → `PUT /api/storage/import` (`packages/app/src/edge/http/storage.ts:139-207`) | No other import running in this process (`packages/app/src/slices/storage/backup-import.ts:85`, `:163-168`) |
| Scheduled backup | `backups.tick()` every 60 s (`packages/app/src/main.ts:703-707`) | `enabled`, a slot is due (`packages/app/src/slices/backups/schedule.ts:49-75`), folder acceptable, updater gate open, no busy project |
| Back up now | Settings → Backups button or palette (`packages/web/src/routes/settings-backups.tsx:46`, `:102`) → `POST /api/backups/run` (`packages/app/src/edge/http/backups.ts:31-40`) | Not stopping, none running, folder acceptable, updater gate open, no busy project (`packages/app/src/slices/backups/service.ts:209-242`) |
| Configure backups | Settings → Backups form (`packages/web/src/routes/settings-backups.tsx:160`) → `PUT /api/backups` (`packages/app/src/edge/http/backups.ts:20-30`) | Input passes `backupConfigInputSchema` (strict) and `folderProblem` (`packages/app/src/slices/backups/model.ts:17-34`, `packages/app/src/slices/backups/folder.ts:26-40`) |

Actor: the single local user; the purge and the backup tick run with no actor. `/api/backups` answers 404 when no backup service is wired (`packages/app/src/edge/http/backups.ts:11-14`).

## Steps

### Trash

1. **Storage of the stamp.** Migration 0039 adds `project_trash(project_id PK → projects ON DELETE CASCADE, deleted_at)` and `deleted_at` on `prompts`, `entries`, `project_templates`; the prompt and entry unique-name indexes become partial (`WHERE deleted_at IS NULL`); `schedules` gains `purged_at`, and every schedule deleted earlier is set purged (`packages/app/src/kernel/db/migrations/0039-channel-essentials.sql:1-24`). A schedule's `deleted_at` (a tombstone that keeps its run history) is its trash stamp (`packages/app/src/slices/trash/service.ts:18-23`).
2. **Trashing a project** inserts `project_trash(project_id, now)` in one transaction; nothing on disk changes (`service.ts:73-87`). A trashed project is invisible to every read built on `liveProject()` / `projectById` (lists, lookups, actions) (`packages/app/src/slices/admission/repo.ts:65-79`); the runner treats it as paused (`packages/app/src/main.ts:917-921`); the batch queue skips it (`packages/app/src/slices/batch/index.ts:20-26`).
3. **Trashing a prompt/entry/template** sets `deleted_at`; a schedule delete sets `deleted_at`, clears `next_run_at` and bumps `version` (`packages/app/src/slices/schedules/repo.ts:173-186`).
4. **List.** One `UNION ALL` over the five sources, ordered `deleted_at DESC, kind, id`; schedules only while `purged_at IS NULL`. Each item carries `detail` (prompt kind or entry category), `purgeAt = deleted_at + 30 days` and `daysLeft = max(0, ceil((purgeAt − now) / 1 day))` (`packages/app/src/slices/trash/service.ts:37-67`, `packages/app/src/slices/trash/model.ts:10-27`). The screen shows kind label, deleted date and "N days left" / "1 day left" / "removed for good today" (`packages/web/src/trash/trash-settings.tsx:19-37`, `:107-136`).
5. **Restore** runs in one transaction per kind (`service.ts:96-115`):
   - project: deletes its `project_trash` row (`service.ts:117-126`); the route then ticks the runner for it so unfinished work and a queued batch item resume (`packages/app/src/edge/http/trash.ts:64-66`).
   - prompt / entry: clears `deleted_at`; when a live item of the same kind/category holds the name (case-insensitive), the name becomes `freeName`: "Name (restored)", "Name (restored 2)"…, cut to `nameMax`; a rename bumps `updated_at` and records a History version (`service.ts:128-164`, `:326-333`).
   - template: clears `deleted_at`; a taken name inserts a new revision `head_version + 1` with the free name (max 200) and moves the head (`service.ts:166-211`).
   - schedule: refused `template-gone` when its template row no longer exists, `template-in-trash` when the template is trashed; otherwise `deleted_at = NULL`, `status = 'paused'`, `next_run_at = NULL`, `version + 1` (`service.ts:213-232`). The screen adds "The schedule is paused. Press Resume on Schedules to run it again." (`packages/web/src/trash/trash-settings.tsx:74-75`).
6. **Delete now** (confirm dialog "Delete "…" for good?", "Delete for good" / "Keep it") (`trash-settings.tsx:138-157`):
   - project: must be in `project_trash`; runs `deleteProject` under the per-project control lock: refused while busy, removes the folder and the project's render cache folder (`rmSync` recursive), then the `projects` row, whose children cascade (`packages/app/src/edge/http/trash.ts:69-74`, `packages/app/src/slices/storage/delete-project.ts:44-71`).
   - prompt / entry: deletes the trashed row and its History versions (`service.ts:249-259`).
   - template: deletes the trashed row; revisions cascade (`service.ts:260-267`).
   - schedule: sets `purged_at`; the row and its runs stay as the history Schedules lists under Deleted (`service.ts:268-276`).
7. **Purge.** `purgeExpired` computes `cutoff = now − 30 days` and calls Delete now for every listed item with `deletedAt ≤ cutoff`; a refusal is logged `warn trash.purge` and counted `kept`, the rest continue (`service.ts:286-305`). `createTrashPurge.tick` runs it when no purge ran in this process or ≥ 1 day passed (`service.ts:313-323`). `main.ts` wraps each tick in `updater.beginMutation()` and skips it while an update installs (`packages/app/src/main.ts:717-727`).

### Export everything

8. `GET /export/summary` answers `{ready:true, projects, files, bytes}` or `{ready:false, detail, busy}`; the client asks it first because a download link cannot show a refusal (`packages/app/src/edge/http/storage.ts:88-105`, `packages/web/src/routes/settings.tsx:362-393`).
9. `planBackup`: `busyProjects` = every project with a `running` stage, a `running` revision work row, a `queued` queue row, or an in-flight call; any → `BackupBusyError` (`packages/app/src/slices/storage/backup-export.ts:88-111`). Otherwise one read transaction snapshots the migration version, the library part, usage (`telemetry_events` except `install`) and one part per project (`backup-export.ts:112-127`).
10. **Project part**: rows of every `projectTables` table, parents first — including `project_trash`, including the Studio tables `youtube_videos`, `releases`, `video_stats` and `ab_results`; excluding the queue, `plan_limit_waits`, `plan_limit_waiters`, `prompt_softening`, `narration_retries`, `prepared_videos` and `project_set_aside` (`packages/app/src/slices/storage/backup-format.ts:38-80`, `backup-export.ts:270-303`); files = every plain file under the project folder (no symlinks, only safe relative paths) (`backup-export.ts:305-328`).
11. **Library part**: `exportableSettings` (known portable keys only; local-only keys such as the notification URL, Studio pairing, tutorial/what's-new/patch-notes seen-state and `first-run.done` are dropped, unknown keys are skipped) (`packages/app/src/slices/storage/portable.ts:478-545`); every row of prompts, entries (trashed ones included), voices, document themes, narration aliases, templates and revisions, schedules with runs and topics, library versions, channels, cast, episode memories, channel videos, standalone usage; every `image_blobs` picture as a file; active Play drafts only, their attachments, and their staged uploads when complete on disk (else the attachment is written `reattach`); template instantiations of those drafts; uploaded fonts (`backup-export.ts:330-440`).
12. The manifest records `format "slopify-backup"`, `schemaVersion 2`, app version (≤ 40 chars), database version, a new `backupId`, `createdAt`, per-project bytes, file count and bytes; the exact archive length is computed before the first byte and sent as `content-length`; the file name is `slopify-backup-YYYY-MM-DD.tar` (`backup-export.ts:156-193`, `backup-format.ts:20-21`, `packages/app/src/edge/http/storage.ts:133-137`).
13. Member order: `manifest.json`, `data/library.json`, `data/usage.json`, `data/projects/<id>.json`…, `files/…`, `checksums.json` (`backup-format.ts:4-13`). `streamBackup` reads files 1 MiB at a time with `O_NOFOLLOW`, hashes each with SHA-256 as it streams, and writes the checksum list last (`backup-export.ts:196-245`). The HTTP body pulls one chunk per read, so a slow download reads files no faster than it sends (`storage.ts:115-132`).

### Import a backup

14. `PUT /import` dispatches on content type: `application/x-tar` → `importBackup` over the streamed body; `application/zip` → legacy `importPortable`, whole-in-memory, ≤ 100 MB; anything else 415 (`packages/app/src/edge/http/storage.ts:139-175`).
15. `importBackup` marks the database as importing, removes any leftover `<dataDir>/imports/`, and creates `imports/<id>` mode `0700` (`packages/app/src/slices/storage/backup-import.ts:159-172`).
16. Members are read in order; each JSON part is size-capped (manifest 4 MiB, others 256 MiB) and zod-checked. A manifest with a newer `schemaVersion` or `databaseVersion` than this build is refused 422 "made by a newer Slopify"; a project listed twice is damaged (`backup-import.ts:185-222`, `:262-286`, `backup-format.ts:115-119`). A project part's `tables` object is strict and names only today's project tables; a 3.3 backup's `upload_slots` rows are read first as `releases` rows (short 0, the slot's time and line, by plan) by `fromUploadSlots` (`backup-format.ts`), so it imports as before.
17. Once manifest, library, usage and every project part are in, `prepare` loads them into a scratch database at the backup's schema, migrates it forward, checks it with the app's own readers, decides which projects and drafts come in, assigns every expected file a waiting place under `imports/<id>/` (or none when skipped), and checks free space: refused 409 when `needed + 64 MiB > free` on the data dir (`backup-import.ts:339-427`, `:665-674`).
18. Every further member must be expected, the right size, and unreceived; after the stream every expected file must be present and match `checksums.json`, and the list may name nothing extra (`backup-import.ts:223-243`).
19. `commit` runs in one transaction with `defer_foreign_keys`, moving waiting files into place inside it and moving them back if it throws (`backup-import.ts:680-695`, `:984-994`). Merge rules (`backup-import.ts:66-83`):
   - settings: only keys not set here are added (`backup-import.ts:698-711`).
   - prompts, entries, document themes: same id → skipped; same name (live items only) with same content → skipped; same name, other content → "<name> (imported)", "(imported 2)"…; a trashed item comes in as it is, still trashed (`backup-import.ts:997-1045`, `:1165-1171`). History versions come only with items that were inserted (`:1047-1062`).
   - voices: skipped by id or by `(provider, voice_id)` (`:746-762`); narration aliases: skipped by id or by written form, else appended after this install's (`:764-790`).
   - templates: skipped by id; a live head revision whose name is taken is renamed "(imported)" (`:792-828`).
   - schedules: skipped by id or when the named template revision is absent; an `active` one comes in `paused`; `topics_generating_at` cleared; runs and topics added by id (`:830-870`).
   - drafts: added with their attachments, staged files (moved into staging, `created_at = now`) and instantiations unless they clash (`:872-901`, `:636-655`).
   - fonts: added when not already present (`:903-911`).
   - usage: `standalone_usage` inserted `OR IGNORE`; `telemetry_events` added only when this `backupId` is not in `backup_imports`, each marked delivered (`:913-932`).
   - channels: see `mergeChannels` (`:1064-1159`).
   - projects: skipped with a reason when the id is here, the folder already exists, or any row id collides; otherwise every row goes in and the folder is moved into the projects root (`:621-634`, `:934-956`).
20. A `backup_imports(backup_id, imported_at, summary_json)` row is written (`ON CONFLICT DO NOTHING`) and the summary returned: per-kind added/renamed/skipped, imported and skipped projects, settings added/kept, fonts, usage, files (`backup-import.ts:958-982`, `:109-139`). The screen shows it in `ImportResult` and invalidates every affected query (`packages/web/src/routes/settings.tsx:430-441`, `:615-660`).

### Scheduled backups

21. **Configuration** lives in setting `backups.config`, status in `backups.status`; neither key is portable (`packages/app/src/slices/backups/model.ts:4-9`). Default: off, `03:00`, the server's time zone, keep 5 (1–30), folder `null` = the default Backups folder (`model.ts:11-48`). A stored value that does not parse reads as the default (`packages/app/src/slices/backups/repo.ts:14-19`).
22. **Save** (`service.ts:195-208`): refuses a folder `folderProblem` names — not absolute; inside the projects root but not its Backups folder; inside staging, logs or `<dataDir>/models` (`packages/app/src/slices/backups/folder.ts:26-40`) — as 400 with `field: "folder"` (`packages/app/src/edge/http/backups.ts:20-29`). `enabledAt` = now when turning on, when time or zone changed, or when unset; kept otherwise; null when off.
23. **Decision** (`packages/app/src/slices/backups/schedule.ts:49-75`), in order: off → none; running → none; `latestSlot` = the newest daily slot ≤ now in the configured zone (`schedule.ts:32-41`); no slot, or slot before `enabledAt` → not yet; a success at or after the slot → done; a slot that passed before this boot is a catch-up, skipped when the last success is < 20 h old; nothing within 2 minutes of boot; the same slot's last attempt `failed` waits 1 h, `waiting` 10 min; else due, trigger `catch-up` or `scheduled` (`schedule.ts:6-13`).
24. **Tick** (`service.ts:243-281`): not stopped and none running; decision due; folder acceptable (silently skipped otherwise); `beginMutation()` (none during an update); `planBackup` — busy projects record status `waiting` with up to three names "and N more"; another plan error records `failed` "could not read what to back up"; then `start`.
25. **Write** (`service.ts:89-136`): `ensureFolder` (mkdir `0700`, must be a directory); `removeLeftovers` (only `.slopify-backup-YYYY-MM-DDTHHMMSSZ.tar.partial` files); `checkSpace` (free ≥ archive bytes, skipped when `statfs` fails); `writeAtomically` into `.<name>.partial` opened `O_WRONLY|O_CREAT|O_EXCL|O_NOFOLLOW` mode `0600`, one event-loop turn per chunk, `fsync`, rename to `slopify-backup-YYYY-MM-DDTHHMMSSZ.tar`, `fsync` the folder (`packages/app/src/slices/backups/files.ts:9-98`); then `pruneBackups` deletes the oldest files matching the exact final pattern until `keep` remain (`files.ts:100-126`). Status records attempt time, trigger, slot, result, file, bytes, duration.
26. **Back up now** returns 202 with the view at once and the write runs in the background; the screen polls every 2 s while `running` (`packages/app/src/edge/http/backups.ts:31-40`, `packages/web/src/routes/settings-backups.tsx:67`).
27. **View** (`service.ts:155-194`): config, effective folder, default folder, `hostFolder` (the folder itself natively; in Docker the host path when inside the shared projects or Backups mount, else null) (`folder.ts:42-61`), `running`, `nextRunAt` (next slot when on), `overdue` (on, and decision due, `starting` or `retry-later`), status, and the backup files oldest first by the time in their name (`files.ts:100-118`). The screen renders "Last backup …", "Next: shortly." when overdue, and "Inside Slopify's Docker volume, not on your computer…" when `hostFolder` is null (`settings-backups.tsx:226-250`).

## Branches

- **Kind of item deleted.** Only these five kinds use the trash (`packages/app/src/slices/trash/model.ts:13`). Other deletes (voices, document themes, narration aliases, channels, cast, drafts) do not pass through it: not implemented for them in `slices/trash/`.
- **Restoring a schedule whose template is trashed**: 409 "Restore the template first (it is listed here), then restore the schedule." (`packages/app/src/edge/http/trash.ts:34-35`). **Template removed for good**: 409, the schedule can only be deleted now (`trash.ts:36-37`, `packages/app/src/slices/trash/service.ts:260-262`).
- **Restoring a project** that was queued: the batch queue sees it again in its place (`packages/app/src/slices/batch/index.ts:20-26`); unfinished work continues on the runner tick (`trash.ts:64-66`).
- **Import file type**: `.tar` full backup vs legacy `.zip` (settings/library only) (`packages/app/src/edge/http/storage.ts:139-175`); the client refuses an empty file or a `.zip` over 100 MB before uploading (`packages/web/src/routes/settings.tsx:396-409`). `exportPortable` still exists but no route calls it (`packages/app/src/slices/storage/portable.ts:195`).
- **Backup trigger**: `scheduled`, `catch-up` or `manual`; failure text for automatic ones says "It tries again within the hour, or press Back up now", manual says "Press Back up now to try again" (`packages/app/src/slices/backups/service.ts:352-354`).
- **Folder location**: `null` resolves to `defaultBackupsDir(paths)`, so moving the projects folder moves backups with it (`packages/app/src/slices/backups/folder.ts:12-14`, `packages/app/src/slices/backups/model.ts:31`).

## Unhappy paths

| Case | Behaviour | Source |
|---|---|---|
| Trash a running project | 409 "This project is still running. Use Cancel run on the project page first, then delete it." | `packages/app/src/edge/http/projects.ts:142-152` |
| Trash an unknown or already-trashed project | 404 "This project no longer exists…" | `projects.ts:143-151`, `packages/app/src/slices/trash/service.ts:80` |
| Restore / Delete now an item no longer in the trash (double press, second tab) | 404 "This item is no longer in the trash: it was restored or removed for good. Reload Settings → Trash…" | `packages/app/src/edge/http/trash.ts:28-29` |
| Delete now a project that is busy | 409 running | `trash.ts:30-31`, `packages/app/src/slices/storage/delete-project.ts:48-50` |
| Project folder the OS will not remove | 500 "Close any program using files in the project folder, then press Delete now again." with the OS message; rows stay, item stays in the trash | `trash.ts:32-33`, `delete-project.ts:52-64` |
| Purge meets a refusal | logged `warn trash.purge`, item kept for the next pass | `packages/app/src/slices/trash/service.ts:294-302` |
| Purge throws | logged `error trash.purge`; timer continues | `packages/app/src/main.ts:721-726` |
| Export while busy | summary `ready:false` with names; direct download 409 "Slopify can't export while projects are being made (…)" | `packages/app/src/slices/storage/backup-export.ts:60-67`, `packages/app/src/edge/http/storage.ts:98-114` |
| A file changes size mid-export | stream errors "… changed while the backup was being written."; the browser marks the download failed | `backup-export.ts:198-249` |
| Import concurrent with another import | 409 "Another backup is still being imported…" | `packages/app/src/slices/storage/backup-import.ts:163-168` |
| Import damaged, out of order, truncated, unknown member, wrong size, checksum mismatch | 400 "This backup can't be imported: … Choose a .tar file made with Export everything…" | `backup-import.ts:96-101`, `:223-257` |
| Import from a newer Slopify | 422 naming the version and the update command | `backup-import.ts:273-286` |
| Import without enough space | 409 naming the data dir, needed and free GB | `backup-import.ts:665-674` |
| Import other failure | 500 "The backup wasn't imported and nothing in this install changed…"; the request reader is cancelled | `storage.ts:189-205` |
| Import fails inside commit | the transaction rolls back and moved files are renamed back; a project folder that could not be moved back is left for reconcile | `backup-import.ts:984-994` |
| App stops mid-import | the next import removes `imports/` first | `backup-import.ts:169-171` |
| Backup: not enough space / ENOSPC / EDQUOT / EACCES / EPERM / EROFS / ENOTDIR / EEXIST / file changed / unexpected | status `failed` with `explain()`'s sentence naming the folder and the fix | `packages/app/src/slices/backups/service.ts:328-361` |
| Backup: prune fails | status `succeeded` with a detail that more than `keep` are kept | `service.ts:112-117` |
| Backup: app stops while writing | aborted, partial removed, status "Slopify stopped while writing it … It runs again after Slopify starts." | `service.ts:282-288`, `:336-337`, `packages/app/src/slices/backups/files.ts:79-84`, `packages/app/src/main.ts:765-766` |
| Back up now while stopping / while one is written / during an update / while busy / bad folder | 409 / 409 / 409 / 409 naming projects / 400 | `service.ts:209-242`, `:292-298` |
| Target name already exists | `EEXIST` → failed | `files.ts:47-50` |

**Gaps and edge cases the code leaves as they are:**

- `busyProjects` does not filter `project_trash`: a trashed project that still has a `queued` queue row blocks Export everything and scheduled backups until it is restored or removed (`packages/app/src/slices/storage/backup-export.ts:88-105`, `packages/app/src/slices/trash/service.ts:69-72`).
- A backup carries `project_trash` rows and trashed library rows with their original `deleted_at`; after import they sit in this install's trash and the purge counts 30 days from the original deletion (`packages/app/src/slices/storage/backup-format.ts:79`, `packages/app/src/slices/storage/backup-import.ts:1001-1003`, `packages/app/src/slices/trash/service.ts:289-293`).
- Import and a backup being written are not mutually excluded: `importBackup` guards only against another import (`backup-import.ts:85`, `:163-168`).
- The purge's "once a day" is per process: `last` lives in memory, so every start purges once (`packages/app/src/slices/trash/service.ts:313-323`, `packages/app/src/main.ts:728`).
- `checkSpace` for a scheduled backup is skipped silently when `statfs` fails (`packages/app/src/slices/backups/service.ts:300-307`).

## State transitions

| Entity | Transition | Rule |
|---|---|---|
| Project | live → trashed | `project_trash` row inserted; refused while busy (`packages/app/src/slices/trash/service.ts:73-87`) |
| Project | trashed → live | row deleted (`service.ts:117-126`) |
| Project | trashed → gone | Delete now / purge / Restore samples (scenario 41): folder removed, then rows (`packages/app/src/slices/storage/delete-project.ts:44-71`) |
| Prompt, entry, template | live ↔ trashed → gone | `deleted_at` set / cleared / row deleted (`service.ts:128-211`, `:249-267`) |
| Schedule | `completed`/`canceled` → trashed → `paused` (restore) or purged | `service.ts:213-232`, `:268-276`; restore never returns it to `active` |
| Backup status `lastResult` | null → `waiting` / `succeeded` / `failed`, per slot | `packages/app/src/slices/backups/model.ts:53-66`, `packages/app/src/slices/backups/service.ts:118-151` |
| Backup file | `.partial` → final name → pruned | `packages/app/src/slices/backups/files.ts:41-126` |
| Imported schedule | `active` → `paused` | `packages/app/src/slices/storage/backup-import.ts:843-854` |

Forbidden: trashing a busy project; restoring a schedule straight to `active`; an import replacing or removing anything already in the install.

## Invariants

- Trashing frees no disk space and deletes no file; only Delete now, the purge and Restore samples remove a project folder (`packages/app/src/slices/trash/service.ts:73-87`, `packages/app/src/slices/storage/delete-project.ts:9-12`).
- A project folder is removed before its rows, so rows never outlive into a state where files are orphaned under no project (`delete-project.ts:52-69`).
- A restored item never takes a name a live item holds (`service.ts:140-149`, `:180-189`, `:325-333`).
- A trashed project claims no work, appears in no list and is skipped by the batch queue (`packages/app/src/main.ts:917-921`, `packages/app/src/slices/admission/repo.ts:65-70`, `packages/app/src/slices/batch/index.ts:20-26`).
- Export and scheduled backups never copy a project while any project is busy (`packages/app/src/slices/storage/backup-export.ts:109-111`).
- A backup file with the final name is always complete: the rename happens only after every byte is written and synced (`packages/app/src/slices/backups/files.ts:38-78`).
- Pruning and the leftover sweep touch only names matching the feature's exact patterns — never an Export everything download or a renamed file (`files.ts:6-10`, `:120-139`).
- At most one scheduled backup per daily slot is counted, and a backup and an update never overlap (`packages/app/src/slices/backups/schedule.ts:47-49`, `packages/app/src/slices/backups/service.ts:36-37`, `:255-257`).
- An import only adds: existing projects, library items and settings are never replaced; a failed import leaves the install as it was (`packages/app/src/slices/storage/backup-import.ts:66-83`).
- Provider keys, the telemetry machine id, logs, the model cache, updates and staging leftovers are never in a backup (`packages/app/src/slices/storage/backup-format.ts:15-18`); nor is the projects root's hidden `.render-cache` of last-render clips (`packages/app/src/slices/storage/layout.ts:9-12`).

## Outcomes & side effects

- Trash: rows stamped; toasts "Restored "…"." / "Restored as "…": another item is now called "…"." / "Deleted "…" for good." and the item's own lists refresh (`packages/web/src/trash/trash-settings.tsx:41-90`). No SSE event is emitted by the trash routes (`packages/app/src/edge/http/trash.ts:58-77`). Disk-space totals split trashed bytes (scenario 14).
- Export: a `.tar` in the browser's downloads; nothing in the install changes.
- Import: rows and files added, a `backup_imports` record, the summary on screen; provider keys must be entered again, as the screen states (`packages/web/src/routes/settings.tsx:516-518`).
- Scheduled backup: an archive in the folder, older archives pruned, status updated; logs `backups.run`, `backups.prune`, `backups.plan`, `backups.tick` on errors (`packages/app/src/slices/backups/service.ts:79`, `:115`, `:267`, `packages/app/src/main.ts:704-706`).

## Dimensions not in play

- D1 authority: one local user; no roles or grants.
- D5 money: nothing is charged; no provider call is made by trashing, exporting, importing or backing up.
- D13 notification: no run notice, webhook or browser notification is sent for any of these actions; results show only on the Settings screens.
- D14 effects on others: single install; the only cross-install rule is that imported schedules come in paused and imported usage is marked delivered (`packages/app/src/slices/storage/backup-import.ts:843-854`, `:922-931`).
