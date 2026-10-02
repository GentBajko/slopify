---
generated_at_commit: d83482c1175e
generated_date: 2026-10-02
capstone_version: 7.0.1
content_hash: 0c4e013f4265
paths_covered:
  - ":(top)packages/app/src/slices/play-drafts/**"
  - ":(top)packages/app/src/slices/storage/staging-refs.ts"
  - ":(top)packages/app/src/slices/storage/reconcile.ts"
  - ":(top)packages/app/src/slices/storage/backup-export.ts"
  - ":(top)packages/app/src/slices/storage/backup-import.ts"
  - ":(top)packages/app/src/slices/project-templates/setup.ts"
  - ":(top)packages/app/src/slices/project-templates/service.ts"
  - ":(top)packages/app/src/slices/settings/tutorial.ts"
  - ":(top)packages/app/src/edge/http/drafts.ts"
  - ":(top)packages/app/src/edge/http/draft-files.ts"
  - ":(top)packages/app/src/edge/http/draft-problem.ts"
  - ":(top)packages/app/src/kernel/db/migrations/0006-play-drafts.sql"
  - ":(top)packages/app/src/kernel/db/migrations/0024-reference-attachments.sql"
  - ":(top)packages/web/src/play/**"
  - ":(top)packages/web/src/subtitles/controls.tsx"
  - ":(top)packages/web/src/tutorial/**"
absorbed_from:
  - features/2026-09-10-play-redesign-drafts@2026-09-13
---

# Play drafts, uploads and explicit admission

## Trigger & preconditions

- The local user edits Play, opens a saved draft from the Drafts popover, applies a template, or a schedule occurrence creates a draft (`packages/web/src/play/use-draft-session.ts:161`, `packages/web/src/play/draft-list.tsx:134`, `packages/app/src/slices/project-templates/service.ts:136`, `packages/app/src/slices/schedules/scheduler.ts:193`).
- HTTP surface under `/drafts` (`packages/app/src/edge/http/app.ts:180`): list `GET /`, create `POST /`, read `GET /:id`, save `PUT /:id`, fork `POST /:id/fork`, discard `DELETE /:id`, review `POST /:id/review`, start `POST /:id/start` (`packages/app/src/edge/http/drafts.ts:56`, `:57`, `:65`, `:69`, `:81`, `:94`, `:113`, `:125`); attachment upload `PUT` and file read `GET /:id/attachments/:attachmentId/file` (`packages/app/src/edge/http/draft-files.ts:29`, `:49`).
- A draft document is `schemaVersion: 1` with `form`, `section` (`content|outputs|style|review`), `variants`, `expectedWords`, `previewText`, `fontUpload`, optional `queue`, `librarySnapshot`, `templateSource` and `channelId` (`packages/app/src/slices/play-drafts/schema.ts:224`). `queue` is the several-videos choice: absent or `true` runs them one after another, `false` starts them all at once (`schema.ts:238-240`). Every number on the form is stored as raw text (`packages/app/src/slices/play-drafts/schema.ts:172`).
- Saving an incomplete setup is allowed; generation requires a separately persisted review and an explicit Start (`packages/app/src/slices/play-drafts/review.ts:78`, `packages/app/src/slices/play-drafts/start.ts:24`).

## Steps

1. **First edit creates the draft.** With no draft ID the first edit drains immediately and `POST /drafts` with a client `crypto.randomUUID()` ID; later edits schedule a save 500 ms after the last edit (`packages/web/src/play/use-draft-session.ts:183`, `:187`, `:91`). Each save freezes the document, generation and base version with a fresh `mutationId` (`packages/web/src/play/draft-save.ts:32`). Saves are serial: one drain loop runs at a time and loops while `edited > acknowledged` (`packages/web/src/play/use-draft-session.ts:81`, `:135`).
2. **Server create/save rules.** Create inserts `version=1`, `state='active'` with `creation_hash`; a repeated create with the same hash while the row is still version 1 and active returns the draft, any other existing row is `conflict` (`packages/app/src/slices/play-drafts/service.ts:157`). Save refuses `starting` (`pending-start`) and `started` (`already-started`) drafts; a replayed `mutationId` returns the current draft when the request hash matches, else `conflict`; otherwise `baseVersion` must equal `version` (`packages/app/src/slices/play-drafts/service.ts:49`, `:187`, `:189`). The update bumps `version`, stores `title` from `form.title`, and clears `review_id`, `review_json` and `review_fingerprint` (`packages/app/src/slices/play-drafts/service.ts:193`).
3. **Attachment references.** `form.provided` holds `audio`, `thumbnail`, `images[]`, `reference`, `shortsMusic` and `ambientBed` as `{attachmentId, name}`; `shortsMusic` and `ambientBed` are stored with kind `audio` (`packages/app/src/slices/play-drafts/repo.ts:62`). A save is `invalid-edit` when an attachment ID repeats or an existing ID belongs to another draft, kind or filename (`packages/app/src/slices/play-drafts/service.ts:55`). `syncAttachments` deletes rows no longer referenced and inserts new ones as `pending` (`packages/app/src/slices/play-drafts/repo.ts:102`); after a successful save the previous staged files are released when nothing references them (`packages/app/src/slices/play-drafts/service.ts:208`).
4. **Upload.** The client adds the reference, flushes the save, then streams bytes (`packages/web/src/play/use-draft-uploads.ts:83`, `:117`, `:153`). The server accepts bytes only for an `active` draft whose attachment row is `pending` with no staged file; allocation binds `staged_file_id` in one guarded `UPDATE` and the row becomes `ready` on completion (`packages/app/src/slices/play-drafts/uploads.ts:28`, `:44`, `:61`). The `reference` kind is staged as an Images upload (`packages/app/src/slices/play-drafts/uploads.ts:40`).
5. **Browser storage.** `localStorage` key `slopify.play-draft` holds only the selected draft ID; no form text or media bytes are kept in the browser (`packages/web/src/play/draft-restore.ts:6`). On mount the remembered ID is opened (`packages/web/src/play/use-draft-session.ts:348`). Opening a draft refetches providers, prompts, entries, settings, voices and fonts (`packages/web/src/play/draft-restore.ts:23`).
6. **Drafts list.** Lists `active` and `starting` drafts newest-edited first with title, "Last edited" time and a `readable` flag (`packages/app/src/slices/play-drafts/repo.ts:44`, `packages/app/src/slices/play-drafts/service.ts:148`, `packages/web/src/play/draft-list.tsx:134`).
7. **Review.** `POST /:id/review` refuses a pending/started draft or a `baseVersion` mismatch (`packages/app/src/slices/play-drafts/review.ts:139`), then resolves inputs (`packages/app/src/slices/play-drafts/review-inputs.ts:48`):
   - `fontUpload` non-null → field error "Wait for the font upload to finish or choose another font." (`review-inputs.ts:62`).
   - `expectedWords` must be an integer 1–100000 (`review-inputs.ts:67`).
   - At most 49 variants (50 videos counting the base) (`review-inputs.ts:75`).
   - The channel's brand kit fills defaults unless `useBrandKit === false`; cast voices are applied (`review-inputs.ts:84`).
   - Each run (base + variants) is admitted with its keyword values; variant errors are prefixed `Video N:` and re-keyed `variants.<i>.` (`review-inputs.ts:127`, `:145`).
   - A subtitle font must still exist; its bytes are SHA-256 hashed into the fingerprint (`packages/app/src/slices/play-drafts/review.ts:31`, `review-inputs.ts:176`).
   - Checkpoints are refused on a stage not generated (Video/export needs Video or Audio on) (`review-inputs.ts:188`).
   - Runtime model availability and thinking support are checked per selected model (`packages/app/src/slices/play-drafts/review.ts:47`).
   - Inputs are resolved before the async font and model checks and once more after them, both times without the font (a Before Video checkpoint covers the caption burn-in, so a font-bound comparison always differed); a changed binding is `stale-review` (`packages/app/src/slices/play-drafts/review.ts:67-75`).
   The review, the captured catalogue, the attachment identities and the resolved font are written to `review_json` for this exact version (`packages/app/src/slices/play-drafts/review.ts:106`, `:118`). A second review of the same version and fingerprint returns the stored review (`packages/app/src/slices/play-drafts/review.ts:100`).
8. **Start.** `POST /:id/start` with `draftId`, `baseVersion`, `reviewId` (`packages/app/src/slices/play-drafts/start.ts:21`):
   - A receipt with that `reviewId` replays its result (`replayed: true`) when draft, version and request hash match; otherwise `conflict` (`packages/app/src/slices/play-drafts/start-repo.ts:66`).
   - The draft moves `active → starting` with `start_id = reviewId` (`packages/app/src/slices/play-drafts/start.ts:61`).
   - `requireStartingIdentity` re-resolves inputs with the stored font and compares every stored field and fingerprint; any drift is `stale-review` (`packages/app/src/slices/play-drafts/start-repo.ts:80`).
   - Readiness uses the catalogue captured at review: provider usable, runtime model present, no changed CLI path, API key present for keyed providers, audio voice among saved voices (`packages/app/src/slices/play-drafts/readiness.ts:59`, `:102`).
   - In one transaction: one run → `startRun`; several with `queue` not `false` → `enqueueBatch` with one queue entry and project per run; several with `queue: false` → `startRun` per run, no queue entries (the draft is read again for the flag; an unreadable draft counts as queued); checkpoints admitted; receipt inserted; draft `started`; all its attachment rows deleted (`packages/app/src/slices/play-drafts/start.ts:127`, `start.ts:148-157`, `packages/app/src/slices/play-drafts/start-repo.ts:140`). A count mismatch throws `StartedRunMismatch`, rolls back, releases the claim and returns `stale-review` (`packages/app/src/slices/play-drafts/start.ts:171`, `:99`).
   - After commit: telemetry `recordStarted`, old staged files released, then `pumpQueue` (batch) or `runner.tick` per project; each post-commit failure only logs `play.start.after-commit` (`packages/app/src/slices/play-drafts/start.ts:114`, `:180`).
9. **Client Start.** Start requires a valid review whose run count equals the page's videos and no pending upload on an active source (`packages/web/src/play/review-state.ts:216`, `:291`). A review whose run count differs from the page re-saves the page and asks for Refresh review (`packages/web/src/play/review-state.ts:189`). With several videos the Start rail shows a Queue switch (on by default, disabled while a Start is pending or uncertain, `start-rail.tsx:68`) instead of "One run", and the hint reads "They run one after another…" or "They all run at once…" (`packages/web/src/play/start-rail.tsx:100-112`, `:155-160`). The button reads `Start run`, `Queue N videos` (queue on), `Start N videos` (queue off), `Starting…` or `Check Start result` (`packages/web/src/play/review-state.ts:279`). A confirmed start clears the draft selection and invalidates `projects`, `staging` and `play-drafts` (`packages/web/src/play/use-draft-session.ts:320`).
10. **Discard.** Confirm dialog "Discard <title>?" with "The draft is removed. This cannot be undone." (`packages/web/src/play/draft-list.tsx:168`). The client waits for a running save, then sends `DELETE` with the displayed version (`packages/web/src/play/use-draft-session.ts:230`). The server refuses `starting` and a version mismatch, deletes the row (attachments cascade) and releases staged files (`packages/app/src/slices/play-drafts/service.ts:277`, `packages/app/src/kernel/db/migrations/0006-play-drafts.sql:20`). Success or `not-found` clears local state only when the same draft is still selected (`packages/web/src/play/use-draft-session.ts:241`).

## Branches

- **Save as a new draft** (fork): new UUID; attachment IDs are remapped; a source attachment that is `ready` shares its staged file, any other becomes `reattach`; replay rules as for create (`packages/app/src/slices/play-drafts/service.ts:214`). Edits made while the fork was in flight are re-applied to the fork with remapped IDs (`packages/web/src/play/use-draft-session.ts:291`). A refused fork discards the fork identity so the next attempt uses a new one (`packages/web/src/play/use-draft-session.ts:288`).
- **Reload saved draft** reopens the server version, discarding unsaved local edits (`packages/web/src/play/draft-list.tsx:92`, `packages/web/src/play/use-draft-session.ts:191`).
- **New draft** flushes pending edits first and aborts if the flush fails (`packages/web/src/play/use-draft-session.ts:220`).
- **Template apply** creates a fresh draft: `section: content`, `fontUpload: null`, `templateSource`, the template's channel, new variant IDs, new attachment IDs with names kept, every attachment `reattach`; an `project_template_instantiations` receipt makes the same draft ID replay; Apply never starts (`packages/app/src/slices/project-templates/setup.ts:58`, `packages/app/src/slices/project-templates/service.ts:136`, `:159`).
- **Untouched fresh form**: provider defaults arriving after load fill the form without saving it (`packages/web/src/play/use-draft-session.ts:337`).
- **Font upload**: `fontUpload: {operationId, name}` is saved before the font is sent; a late result applies only while the same operation is current (`packages/web/src/play/use-draft-uploads.ts:196`, `:210`). The unfinished marker stays visible when subtitles or audio are off, with **Keep current font** clearing it (`packages/web/src/subtitles/controls.tsx:257`, `:274`).
- **Host-managed CLI**: a changed CLI path in Settings → Providers invalidates Start via `cliPathChanged` (`packages/app/src/slices/play-drafts/readiness.ts:110`).

## Unhappy paths

| Case | Behavior | Site |
|---|---|---|
| Save network/server error | Status `Couldn't save`, Retry button; pending identity kept for a conflict, dropped otherwise | `packages/web/src/play/draft-list.tsx:71`, `packages/web/src/play/use-draft-session.ts:107` |
| CAS conflict (other tab) | Status `Changed elsewhere`; **Reload saved draft** / **Save as a new draft**; autosave stops | `packages/web/src/play/draft-list.tsx:88`, `packages/web/src/play/use-draft-session.ts:176` |
| Corrupt or unsupported stored document | Listed with "Unsupported or corrupt draft. Try opening it to recover, or discard it."; read returns `invalid-draft` | `packages/web/src/play/draft-list.tsx:155`, `packages/app/src/slices/play-drafts/service.ts:74` |
| Upload fails | Row set `reattach` "The upload failed. Attach the file again."; UI shows Reattach / Remove | `packages/app/src/slices/play-drafts/uploads.ts:53`, `packages/web/src/play/provided.tsx:125` |
| Staged file missing or wrong size | Read reports `reattach` "This file is missing or did not finish uploading. Attach it again." | `packages/app/src/slices/play-drafts/service.ts:87` |
| Restart with incomplete staged bytes | Boot reconciliation sets `reattach` "Upload is missing or incomplete. Reattach the file." and deletes unreferenced staged files | `packages/app/src/slices/storage/reconcile.ts:79`, `:103` |
| Upload settles after the file was removed, replaced, discarded or another draft opened | Ignored by owner/generation/lifetime fences; in-flight requests aborted | `packages/web/src/play/use-draft-uploads.ts:63`, `:132` |
| Start response lost | `Check Start result`; the retry reuses the same `reviewId`; `pending-start`/`already-started` trigger recovery instead of a new identity | `packages/web/src/play/review-state.ts:240`, `:249`, `:257` |
| Setting changed after review | `stale-review`: "Something changed since you reviewed this video…" | `packages/app/src/edge/http/draft-problem.ts:26` |
| Discard of a draft being started | `pending-start`; client refuses while a Start is pending or uncertain | `packages/app/src/slices/play-drafts/service.ts:287`, `packages/web/src/play/use-draft-session.ts:231` |

HTTP status mapping: `not-found` 404, `invalid-edit`/`readiness` 400, all others 409, each with a plain `detail` (`packages/app/src/edge/http/draft-problem.ts:9`).

## State transitions

- Server draft: `active → starting` (Start claim), `starting → active` (refusal; review cleared when stale), `starting → started` (receipt committed). `started` is terminal: save, fork source, review and upload are refused (`packages/app/src/slices/play-drafts/start.ts:61`, `packages/app/src/slices/play-drafts/start-repo.ts:140`, `:149`).
- Attachment row: `pending → ready` (upload complete), `pending → reattach` (upload failed), `ready → reattach` (reconciliation or template apply); the view reports `copying` while the staged file is still streaming (`packages/app/src/slices/play-drafts/service.ts:92`).
- Client save status: `unsaved → saving → saved`, or `error`/`conflict`; only an acknowledgement advances `acknowledged` (`packages/web/src/play/draft-save.ts:20`, `packages/web/src/play/draft-list.tsx:67`).

## Invariants

- No provider call during editing, autosave or review; provider work begins only after Start commits (`packages/app/src/slices/play-drafts/start.ts:114`).
- A save never overwrites a newer version: every write is `WHERE version=? AND state='active'` (`packages/app/src/slices/play-drafts/service.ts:193`).
- Start creates exactly the reviewed number of projects or nothing (`packages/app/src/slices/play-drafts/start.ts:171`).
- A staged file is deleted only when no attachment row references it and it is not mid-copy, and never inside an open transaction (`packages/app/src/slices/storage/staging-refs.ts:14`).
- One receipt per `reviewId`; `play_start_receipts` is unique on `(draft_id, draft_version)` (`packages/app/src/kernel/db/migrations/0006-play-drafts.sql:28`).

## Outcomes & side effects

- Durable rows: `play_drafts`, `play_draft_attachments`, `play_start_receipts`, staged files (`packages/app/src/kernel/db/migrations/0006-play-drafts.sql:1`).
- Start creates projects (and batch queue entries when queued), checkpoint rows and a receipt, then wakes the runner: `pumpQueue` when anything was queued, else `runner.tick` per project (`packages/app/src/slices/play-drafts/start.ts:145-178`, `:117-120`).
- Backups carry `active` drafts and their attachments; import skips a draft whose ID or attachment/staged file already exists (`packages/app/src/slices/storage/backup-export.ts:384`, `packages/app/src/slices/storage/backup-import.ts:637`, `:873`).
- Tutorial progress is a versioned settings write; step `play-start` leads here and skipping generation continues at `home`; the tutorial never starts a run (`packages/app/src/slices/settings/tutorial.ts:57`, `packages/web/src/tutorial/model.ts:82`, `:118`).

## Dimensions not in play

- D1 Authority: single local user; no accounts or sharing.
- D5 Money: nothing is charged by drafts; cost appears only as review estimates (`packages/app/src/slices/play-drafts/review-inputs.ts:187`).
- D7 Time: drafts never expire; no automatic cleanup of drafts.
- D6 Limits: no storage quota on staged uploads; the only caps are 50 videos per review and 1–100000 expected words.
- D13 Notification: no notification is sent for draft events.
- D14 Effects on others: template edits do not alter drafts already applied from an older revision; a Library rename rewrites the old name in every `active` draft (scenario 15, `packages/app/src/slices/library/rename.ts:84-92`); scheduled runs create their own drafts (`packages/app/src/slices/schedules/scheduler.ts:193`).
