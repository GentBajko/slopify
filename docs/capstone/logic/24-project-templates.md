---
absorbed_from: features/2026-09-10-project-templates@2026-09-13
generated_at_commit: 54f5cb4c1dab
generated_date: 2026-09-30
capstone_version: 7.0.1
content_hash: 662b764c117c
paths_covered:
  - ":(top)packages/app/src/slices/project-templates/**"
  - ":(top)packages/app/src/edge/http/project-templates.ts"
  - ":(top)packages/app/src/kernel/db/migrations/0008-project-templates.sql"
  - ":(top)packages/app/src/slices/voices/model.ts"
  - ":(top)packages/app/src/slices/voices/audio-files.ts"
  - ":(top)packages/web/src/templates/**"
  - ":(top)packages/web/src/routes/templates.tsx"
  - ":(top)packages/web/src/project/save-template.tsx"
  - ":(top)packages/web/src/project/header.tsx"
  - ":(top)packages/web/src/play/save-template-dialog.tsx"
---

# Project templates

Templates are named, versioned snapshots of a Play setup (`PlayDraftDocument`), stored in
`project_templates` (head row: `head_version`, `creation_hash`, `mutation_id`/`mutation_hash`,
`channel_id`, `deleted_at`) and `project_template_revisions` (one row per version: `name`,
`document_json`) (`packages/app/src/kernel/db/migrations/0008-project-templates.sql:1-16`). A
template keeps stage sources, providers and models, prompt and intro/outro bodies, keyword
values that are settings, format, language, speakers, shorts, reviews, video-edit, loudness,
pauses, image scaling, chunking, subtitles and checkpoint stages. It never keeps a topic
typed for one video, queued variants, a font upload, credentials, run state, outputs or media
bytes.

The same slice also makes "Make the next chapter": an audiobook written as a book, one project
per chapter (`packages/app/src/slices/project-templates/next-chapter.ts:13-17`).

## Trigger & preconditions

| Trigger | Where | Endpoint (mounted at `/api/project-templates`, `packages/app/src/edge/http/app.ts:182`) |
|---|---|---|
| Save template (from a Play draft) | Play's Save as template dialog (`packages/web/src/play/save-template-dialog.tsx:62-95`); Library → Templates "Save a setup" (`packages/web/src/routes/templates.tsx:111-135`) | `POST /` (`packages/app/src/edge/http/project-templates.ts:100`) |
| Save as template (from a project) | project page dialog (`packages/web/src/project/save-template.tsx:43-60`) | `POST /from-project/:projectId` (`project-templates.ts:63-78`) |
| Make the next chapter | project header button, shown only on an audiobook whose status is `done` or `partial` (`packages/web/src/project/header.tsx:79-87,115-120`) | `POST /next-chapter/:projectId` (`project-templates.ts:80-99`) |
| Edit, rename, restore an older version | Library → Templates row actions and History drawer (`packages/web/src/templates/api.ts:93-136`, `packages/web/src/templates/row-parts.tsx:21-40,64-100`) | `PUT /:id` (`project-templates.ts:121-132`) |
| Duplicate | Library → Templates, saved as "`<name>` copy" (`routes/templates.tsx:177-196`) | `POST /` |
| Delete (to trash) | Library → Templates (`routes/templates.tsx:197-210`) | `DELETE /:id` (`project-templates.ts:133-144`) |
| Use in Play (apply) | Library → Templates (`routes/templates.tsx:136-175`) | `POST /:id/instantiate` (`project-templates.ts:145-160`) |
| List / read a version | Library → Templates, Play template picker, History | `GET /`, `GET /:id?version=` (`project-templates.ts:62,104-120`) |

Preconditions:

- Every write carries a client-generated UUID (`id` for create/instantiate/next-chapter,
  `mutationId` for update) and, for update/delete, `baseVersion` (`packages/app/src/slices/project-templates/schema.ts:10-34`).
- Names are trimmed, 1-120 characters on create (`templateNameMax`, `schema.ts:6,13`) and 1-200
  on update so a template named before the cap keeps its name (`schema.ts:8,21`). The project
  dialog's field allows 200 characters (`packages/web/src/project/save-template.tsx:96`); the
  server refuses 121-200 there as invalid input (`packages/app/src/slices/project-templates/from-project.ts:27`).
- From a project: the caller names the project's current revision id (`from-project.ts:52-54`).
- Next chapter: the project's current revision has `voices.format === "audiobook"` (`next-chapter.ts:68-75`).
- The routes return 404 when the app was started without draft services (`project-templates.ts:56-59`).
- The bundled-sample read-only guard covers `/api/projects/:id/*` only
  (`packages/app/src/edge/http/app.ts:277-293`); template routes are outside it, so Save as
  template and Make the next chapter work on a sample project.

## Steps

### Save from a Play draft

1. The Play dialog flushes the draft session first; a failed flush stops the save
   (`save-template-dialog.tsx:68-73`).
2. The client strips one-off values with `templateDocument` and sets `channelId` to the draft's
   channel, else its source template's channel (`save-template-dialog.tsx:76-84`). Library →
   Templates "Save a setup" reads the chosen draft and lets the user pick a channel
   (`routes/templates.tsx:111-125`).
3. `createTemplate` (`packages/app/src/slices/project-templates/service.ts:39-74`) in one
   transaction: an existing row with this id returns version 1 when the request hash matches,
   else `conflict` (`service.ts:47-52`); `templateSetup` runs; head row inserted with
   `head_version=1` and `channel_id = resolveChannelId(document.channelId)` (`service.ts:66-70`);
   revision 1 inserted (`repo.ts:47-57`).
4. `templateSetup` (`packages/app/src/slices/project-templates/setup.ts:8-56`):
   - Resolves each chosen prompt: article (or `script` when speakers write the script and
     audio is generated), narration, description, each image prompt, thumbnail, shorts,
     shorts image, each review stage's prompt unless the stage is `off`, and the establishing
     image prompt (`setup.ts:14-36`). Empty names are skipped (`setup.ts:38`).
   - Each body comes from `snapshotPrompt`/`snapshotEntry`: the live Library row by name
     first, the draft's own `librarySnapshot` row second (`packages/app/src/slices/library/snapshot.ts:40-65`).
     Neither found returns `missing-prompt` (`setup.ts:40,47`). Duplicate kind+name pairs are
     stored once (`setup.ts:41`).
   - Intro and outro entries resolve the same way (`setup.ts:44-49`).
   - `templateDocument` empties every keyword the title names (the topic, e.g. `{{Topic}}` in
     "History: {{Topic}}") and drops `variants`; every other keyword keeps its value
     (`packages/app/src/slices/project-templates/one-off.ts:4-33`).
   - `templateSource` and `channelId` are removed from the stored document, `fontUpload` set to
     `null`, and `librarySnapshot` replaced by the resolved bodies (`setup.ts:51-55`). The
     channel lives on the head row, so moving a template between channels
     (`packages/app/src/slices/channels/service.ts:140-156`) makes no new version (`service.ts:64-65`).

### Save from a project

1. `createTemplateFromProject` (`from-project.ts:35-79`) hashes the request with
   `operation: "template-from-project"`; a replay with the same hash returns version 1, a
   different one `conflict` (`from-project.ts:42-49`).
2. Unknown project → `not-found`; revision id not current → `conflict` (`from-project.ts:50-56`).
3. A project whose images are `generate` but has any image definition with `source: "provide"`
   returns `invalid-input` (`from-project.ts:57-63`).
4. `documentFromProject` (`from-project.ts:81-297`) rebuilds a Play document from the revision:
   - Prompt bodies come from the revision's `promptTemplates`, else `config.rendered`
     (`from-project.ts:88-100`), stamped with the revision's `createdAt`.
   - Image prompts: a project generating images without `imageScale` gets one prompt per
     planned image, named "Project image N", number 1, using the original template body when the
     rendered prompt is unchanged, else the edited prompt (`from-project.ts:110-126`). Otherwise
     the configured image prompts and counts are kept, plus `imageScale` (`from-project.ts:127-130,264`).
   - Shorts image and establishing image prompts are added unless an image prompt of that name
     already exists (`from-project.ts:133-144`).
   - Provided research/article text is kept when that stage's source is `provide` (the article
     is the revision's current `articleMarkdown`) (`from-project.ts:161-165`). Provided audio,
     thumbnail, establishing image, images, shorts music and an uploaded ambient bed become named
     placeholder attachments ("Audio from project", "Image N", "Music from project", …) with new
     ids (`from-project.ts:159-184`).
   - A project without a document theme that generates a document gets
     `documentThemeOf(undefined)` explicitly (`from-project.ts:192-198`).
   - Checkpoints: the stage of each gate on that revision (`from-project.ts:199-201`).
   - Language, shorts, video edit, reviews, ambient bed, loudness (stored as `enabled: true`
     with the project's targets), sentence/paragraph pauses, `imageScenes`, `thumbnailCount: 3`,
     `youtubeDescription` are copied only when the project has them (`from-project.ts:214-265`).
   - Voices are copied without `book` (`from-project.ts:239-241,299-302`).
   - Subtitle `language` is always `"en"`; chunking defaults are `whole`/500 words/3000
     characters; subtitle defaults `off`/`default`/48/`bottom` (`from-project.ts:269-282`).
   - `expectedWords` is the project's `imageScale.words`, else 1500 (`from-project.ts:293`).
5. The document plus `channelId = projectChannelId(project)` goes through `createTemplate`
   (so through `templateSetup` and `templateDocument`), then the head row's `creation_hash` is
   overwritten with the from-project hash (`from-project.ts:64-77`).

### Update, rename, restore

`updateTemplate` (`service.ts:75-111`): a repeated `mutationId` with the same hash returns the
current head; with another hash, `conflict` (`service.ts:89-92`). `baseVersion` other than the
head → `conflict` (`service.ts:93`). `templateSetup` runs again, revision `baseVersion + 1` is
inserted, and the head moves with `WHERE head_version=baseVersion` (`service.ts:94-108`).
Rename re-saves the head document under the new name as a new version
(`packages/web/src/templates/api.ts:116-136`). History reads every version 1..head and Restore
saves an older version's document as a new head version (`row-parts.tsx:64-100`).

### Apply (Use in Play)

1. The web refuses while a run is still starting in Play or while the open Play draft is unsaved
   (`routes/templates.tsx:137-141,221-226`). The draft id is reused per `templateId:version`
   until the draft opens (`routes/templates.tsx:146-151,167-174`).
2. `instantiateTemplate` (`service.ts:136-169`): an existing instantiation receipt for the draft
   id returns that draft when template and version match, else `conflict` (`service.ts:141-151`).
   Missing template/version → `not-found`.
3. `freshTemplateDraft` (`setup.ts:58-95`) sets `section: "content"`, `fontUpload: null`,
   `templateSource: {id, version}`, `channelId` from the template's head row, a new id for every
   variant, and new attachment ids (names kept) for provided audio, thumbnail, images,
   establishing image, shorts music and ambient bed.
4. `createDraft` creates the Play draft; every attachment row of the draft is set to
   `reattach`; the receipt is written to `project_template_instantiations` (`service.ts:154-164`).

### Make the next chapter

1. The web generates one draft id per press series and reuses it until Play opens the draft
   (`packages/web/src/routes/project.tsx:838-878`).
2. `makeNextChapter` (`next-chapter.ts:40-110`), one transaction:
   - A draft with this id already exists → return it (`next-chapter.ts:50-54`).
   - Project or its current revision missing → `not-found` (`next-chapter.ts:55-67`).
   - Not an audiobook → `not-an-audiobook` (`next-chapter.ts:68-75`).
   - `nextBook`: the project's own book with `chapter + 1`, capped at `bookChapterMax` (9999);
     a project without a book becomes a book titled after the project title (trimmed, cut to
     `bookTitleMax` 200, else "Untitled book") at chapter 2 (`next-chapter.ts:34-38`,
     `packages/app/src/slices/voices/model.ts:66-67`).
   - The draft document is `documentFromProject(revision)` with the project's channel, title
     `bookLabel(book)` ("`<title>` · Chapter N", `voices/model.ts:74-76`), `voices` =
     the project's speakers/voices with the new `book`, and provided `research` and `article`
     emptied (`next-chapter.ts:77-96`).
   - All draft attachments are set to `reattach` (`next-chapter.ts:105`).
3. Play opens the draft; the chapter's text is written or pasted there and started like any
   draft.

The draft does not pass through `templateSetup`: keyword values (topic included) are kept,
no template row, no instantiation receipt and no `templateSource` are written
(`next-chapter.ts:77-105`).

## Branches

| Decision | Rule | Pointer |
|---|---|---|
| Article prompt kind | `script` when `voices.source === "script"` and audio is generated, else `article` | `setup.ts:16-19`; `from-project.ts:101` |
| Library body | live row by name wins; snapshot row is the fallback | `library/snapshot.ts:40-65` |
| Template language | a language picked on Play (English included) is stored; a project made in English has no `language` (English is never stored on a run, `packages/app/src/slices/play-drafts/convert.ts:255-256`), so its template has none | `from-project.ts:218` |
| Language at Review/Start | a draft without `language` takes its channel's `brand.language`, with the brand kit on or off; the channel is the draft's, else its `templateSource` template's, else the default | `packages/app/src/slices/channels/runs.ts:19-31,43-49`; `packages/app/src/slices/play-drafts/review-inputs.ts:84-89`. Channel language settings: `30-channels-and-cast.md` |
| Book on a template | removed; only Make the next chapter sets it | `from-project.ts:239-241` |
| Book on the listening files | when `voices.book` is set, the MP3 and M4B carry the book title as album and the chapter as track | `packages/app/src/slices/voices/audio-files.ts:45-57`; `packages/app/src/slices/rebuild/runtime-voices.ts:88`. Making the MP3/M4B (`voices.audioFiles`): `34-speakers-and-voices.md` |
| Book validation at Review | empty book title or chapter outside 1-9999 → field errors `voices.book.title` / `voices.book.chapter` | `voices/model.ts:240-254` |
| Button visibility | Make the next chapter only on audiobook projects with status `done` or `partial` | `header.tsx:115-120` |
| Delete | refused while a non-trashed schedule names the template | `service.ts:122-127` |
| Loudness | copied as `enabled: true` when the project has targets; absent leaves Settings' default | `from-project.ts:245-255` |

## Unhappy paths

HTTP mapping for template routes: `not-found` 404; `conflict` and `referenced-by-schedule` 409;
`invalid-input` and `missing-prompt` 400; bodies are problem details with `extensions.reason`
(`project-templates.ts:29-51`).

| Case | Result | Pointer |
|---|---|---|
| Invalid body/params | `onInvalid` problem, 400 | `project-templates.ts:65-70` |
| Create replay, same body | returns version 1 | `service.ts:49-52` |
| Create with a used id, different body | 409 | `service.ts:52` |
| Update stale `baseVersion` | 409 "This template or its project changed…" | `service.ts:93`; `project-templates.ts:47` |
| A chosen prompt/entry deleted and absent from the snapshot | 400 `missing-prompt` | `setup.ts:40,47`; `project-templates.ts:43` |
| From project, revision no longer current | 409 | `from-project.ts:53-54` |
| From project with provided images in a generated set | 400 | `from-project.ts:57-63` |
| Delete while a schedule uses it | 409 "…cancel and delete them first…" | `service.ts:122-127`; `project-templates.ts:41` |
| Apply, same draft id for another template/version | 409 | `service.ts:147-148` |
| Apply, draft create fails | 409 | `service.ts:158` |
| Apply while Play is starting a run or holds an unsaved draft | client refusal, no request | `routes/templates.tsx:137-141` |
| Apply, draft made but Play did not open it | "Press Use in Play again", same draft id reused | `routes/templates.tsx:167-174` |
| Next chapter, bad id / missing project | 404 with message | `next-chapter.ts:42-47,61-67` |
| Next chapter on a non-audiobook | 400 `not-an-audiobook` | `next-chapter.ts:69-75`; `project-templates.ts:90-91` |
| Next chapter draft create fails | 409 "Press Make the next chapter again…" | `next-chapter.ts:97-103` |
| Next chapter made but Play's open draft unsaved | client message; draft id kept for the retry | `routes/project.tsx:864-869` |
| Next chapter pressed twice | second press returns the first draft | `next-chapter.ts:50-54` |
| Concurrent writes | each service call runs in `transact`; update's head move is conditional on `head_version` | `service.ts:45,81,106` |

Name uniqueness: not enforced on create or update (`service.ts:39-111`); a trash restore
renames a clashing template with `freeName` and saves that as a new version
(`packages/app/src/slices/trash/service.ts:166-202`, see `40-trash-and-scheduled-backups.md`).

## State transitions

- Template head: version N → N+1 on update, rename or restore; revisions are never modified
  (`service.ts:94-108`, `repo.ts:47-57`).
- Template: active → trashed (`deleted_at` set) on delete (`service.ts:128-132`); trashed rows are
  invisible to every read (`repo.ts:6-7`). Restore and 30-day purge belong to
  `40-trash-and-scheduled-backups.md`.
- Channel: head `channel_id` changes only through `moveTemplate` (`channels/service.ts:140-156`);
  no version change.
- Applied draft: created active, unreviewed, attachments `reattach`, receipt row written
  (`service.ts:154-164`).
- Next-chapter draft: created with attachments `reattach`, book chapter = previous + 1
  (`next-chapter.ts:76-105`).
- Forbidden: update on a non-head version; deleting a template a live schedule names.

## Invariants

1. Template mutations and Make the next chapter never admit a project, start a runner or call a
   provider (`service.ts`, `next-chapter.ts`: only `play_drafts`, `play_draft_attachments`,
   `project_templates*` writes).
2. A stored template document has no `templateSource`, no `channelId`, no `fontUpload`, no
   variants and empty topic keywords (`setup.ts:51-55`, `one-off.ts:27-33`).
3. A template never carries a `voices.book` (`from-project.ts:241`).
4. Every applied or next-chapter draft owns new attachment ids, and each attachment starts in
   `reattach` (`setup.ts:64-67`, `service.ts:159`, `next-chapter.ts:105`).
5. Checkpoint stages may be copied; approvals and released state are not (`from-project.ts:199-201`).
6. A from-project template reads only the named current revision (`from-project.ts:52-56`).
7. One draft id maps to at most one template instantiation (`project_template_instantiations.draft_id`
   primary key, `0008-project-templates.sql:17-21`).

## Outcomes & side effects

- Save/update/rename/restore/duplicate: rows in `project_templates` and
  `project_template_revisions` (`service.ts:66-71,103-108`).
- Delete: `deleted_at` set; a toast says it can be restored in Settings → Trash within 30 days
  (`routes/templates.tsx:206-208`). Channel deletion is refused while a live template names the
  channel (`channels/service.ts:125-132`).
- Apply: one `play_drafts` row, its attachments set to `reattach`, one instantiation receipt.
- Next chapter: one `play_drafts` row with title "`<book>` · Chapter N"; the project page
  subtitle shows the book label for projects in a book (`header.tsx:161-163`).
- Other writers of templates: schedules run a template version (`25-scheduled-jobs.md`); the
  retired-model switch saves templates through `updateTemplate`
  (`packages/app/src/slices/model-upkeep/switch.ts:168`, `19-catalogue-thinking.md`); starter packs
  install templates (`41-onboarding-and-sample.md`); backups export and import both tables
  (`packages/app/src/slices/storage/backup-export.ts:351`, `packages/app/src/slices/storage/backup-import.ts:793-815`).

## Dimensions not in play

- Money: no provider call or cost in any template or next-chapter operation.
- Sharing / multi-user: templates are local to one installation; no permissions model.
- Scheduling: templates carry no schedule of their own; schedules reference them (`25-scheduled-jobs.md`).
- Credentials and media bytes: never stored in a template document.
- Book entity: no `books` table; a book is `voices.book` on each chapter project's revision
  (`voices/model.ts:62-72,89-90`), and no list or ordering of a book's chapters exists outside
  the chapter numbers themselves.
