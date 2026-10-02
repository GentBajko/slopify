---
generated_at_commit: e9226a34aa8a
generated_date: 2026-10-02
capstone_version: 7.0.1
content_hash: 1f368e5afc66
paths_covered:
  - ":(top)packages/app/src/slices/library/**"
  - ":(top)packages/app/src/edge/http/prompts.ts"
  - ":(top)packages/app/src/edge/http/entries.ts"
  - ":(top)packages/app/src/slices/trash/service.ts"
  - ":(top)packages/app/src/slices/trash/model.ts"
  - ":(top)packages/app/src/kernel/db/migrations/0031-prompt-history-and-description-edits.sql"
  - ":(top)packages/app/src/kernel/db/migrations/0039-channel-essentials.sql"
  - ":(top)packages/web/src/library/**"
  - ":(top)packages/web/src/routes/prompts.tsx"
  - ":(top)packages/web/src/routes/prompt-editor.tsx"
  - ":(top)packages/web/src/routes/entries.tsx"
  - ":(top)packages/web/src/routes/entry-editor.tsx"
  - ":(top)packages/web/src/play/pick-in-play.ts"
  - ":(top)packages/web/src/lib/prompt-kinds.ts"
  - ":(top)packages/web/src/lib/narration-starter.ts"
  - ":(top)packages/web/src/lib/form-drafts.tsx"
  - ":(top)packages/web/src/project/header.tsx"
  - ":(top)packages/web/src/router.tsx"
absorbed_from:
  - features/2026-09-24-narration-preparation@2026-09-24
scenario: prompt-management
mockup_row: S15
screens: [04-prompts, 05-prompt-editor, 06-play, 08-project]
depends_on: [03-placeholder-substitution, 04-run-admission, 24-project-templates, 40-trash-and-scheduled-backups]
---

# 15 Prompt management

Creating, editing, renaming, duplicating, versioning, restoring and deleting Library prompts and intro/outro entries. Covers their "Used by" lists, the Image prompt's photorealistic flag, Use in Play, and how edits reach, or do not reach, projects, templates and schedules.

## Trigger & preconditions

- Trigger: these actions on Library → Prompts (`/prompts?kind=`) and Library → Intros and outros (`/entries?category=`), and in their editors:
  - New, Edit, Save, Rename, Duplicate, Use in Play, History (compare and Restore), Delete.
  - Prompt routes: `packages/app/src/edge/http/prompts.ts:45-119`. Entry routes: `packages/app/src/edge/http/entries.ts:33-77`.
- Preconditions: none; the single local user.
- Entities:
  - Prompts have a kind: `article`, `image`, `thumbnail`, `narration` (labelled "Narration Preparation"), `description` ("YouTube Description"), `shorts`, `review`, or `script` ("Script (speakers)") (`packages/app/src/slices/library/model.ts:12-23`, `packages/web/src/lib/prompt-kinds.ts:7-26`).
  - Intro/outro entries have a category (`intro` | `outro`) and a mode (Text | LLM) (`model.ts:25-26,52-67`).
  - One rule set covers both (`model.ts:1-3`, `packages/app/src/slices/library/save.ts:1-2`).

## Steps

1. **Save** (create or update), in `save.ts:42-91,111-159`:
   - `lint` requires a trimmed name of 1-200 characters (`nameMax`, `model.ts:29`).
   - It requires a non-blank body of at most 100 000 characters (`bodyMax`, `model.ts:33`).
   - It requires no slot parse error: unclosed `{{`, empty keyword, or nested brace. Each error is reported with its line and column (`packages/app/src/slices/library/lint.ts:19-68`). The slot grammar is scenario 03's.
   - The name is stored trimmed. `slots` is recomputed from the body on every save (`save.ts:185-206`).
   - The kind or category may change on edit; the editor offers a Kind switch (`packages/web/src/routes/prompt-editor.tsx:195-205`).
2. **Uniqueness** is enforced by partial unique indexes: `prompts(kind, lower(name)) WHERE deleted_at IS NULL` and `entries(category, lower(name)) WHERE deleted_at IS NULL` (`packages/app/src/kernel/db/migrations/0039-channel-essentials.sql:15-21`). A collision becomes `duplicate-name` → HTTP 409, with the field error "Another prompt already has this name. Choose a different name." (`save.ts:208-223`, `prompts.ts:134-147`). There is no read-then-write check.
3. **History.** Every save writes the row and a `library_versions` row in one transaction (`save.ts:212-223`; table `0031-prompt-history-and-description-edits.sql:6`). Rules for versions (`packages/app/src/slices/library/history.ts:80-99`):
   - A save identical to the latest version (name, body, kind, mode) adds no version.
   - A row with no versions yet (written by a backup or import) first gets its previous text as version 1.
   - `GET /:id/history` lists versions newest first. It synthesises version 1 for an item without versions, without writing (`history.ts:52-64,105-126`).
   - The History drawer shows a word diff of any two versions, as "Older" and "Newer" side by side (`packages/web/src/library/history-drawer.tsx:44,97-132`, `packages/app/src/slices/library/diff.ts:272-330`). Past 4000 changed words it shows a whole-text replace (`diff.ts:283-285`).
4. **Restore** `POST /:id/history/:version/restore` re-saves that version's name, body and kind (plus mode for an entry) through the normal Save. The result is a new version with `restored_from` set, so later versions stay (`save.ts:93-101,161-177`, `history-drawer.tsx:67-70`). Restore obeys lint and uniqueness like any save, and renames references like any save (step 8).
5. **Rename in the row** (prompts, entries and templates): Rename turns the name into a field. Enter or Save name saves it; Escape or Cancel leaves it (`packages/web/src/library/inline-name.tsx:17-19`).
   - It is the same `PUT` as the editor, sending the body unchanged (`packages/web/src/routes/prompts.tsx:57-62`, `packages/web/src/routes/entries.tsx:58-63`).
   - A blank name is refused locally. An unchanged name closes the field without a request (`inline-name.tsx:49-60`).
   - Success shows a toast "Renamed “A” to “B”." with Undo, which renames back through the same call (`inline-name.tsx:72-80`).
   - Every name change, from the row, the editor or a Restore, carries into templates and Play drafts (step 8).
6. **Duplicate** opens the editor on an unsaved copy named "<name> copy" with the same kind (or category and mode) and body (`prompt-editor.tsx:78`, `packages/web/src/routes/entry-editor.tsx:70-74`). A taken name is refused at Save by step 2.
7. **Delete** asks "Delete "<name>"?", explaining "Moves it to the trash for 30 days (Settings → Trash). Projects that used it keep their text." (`prompts.tsx:224-236`, `entries.tsx:222-234`). It sets `deleted_at` (`packages/app/src/slices/library/repo.ts:68-77`).
   - A trashed row is invisible to every Library read and write (`repo.ts:32-35`) and keeps its versions and photorealistic tick (`packages/app/src/slices/library/photorealistic.ts:11-12`).
   - Restore from Settings → Trash puts it back as "Name (restored)", "Name (restored 2)"… when a live row has taken the name (`packages/app/src/slices/trash/service.ts:89-90`).
   - Trash retention and purge are scenario 40 (`packages/app/src/slices/trash/model.ts:11`).
8. **Rename propagation.** When a save changes the name, `renameReferences` runs inside the same transaction, so the rename and the rewritten references land together or not at all (`save.ts:74-82,142-150`, `packages/app/src/slices/library/rename.ts:65-93`):
   - It rewrites the old name to the new one in every live template's head revision, both in its `form` and in the `librarySnapshot` copy, and in every Play draft whose state is `active` (`rename.ts:67-92`). The rewrite is in place: no template version is added.
   - A form slot matches the old name trimmed and case-insensitively within the kind or category (`packages/app/src/slices/library/used-by.ts:116-129`). A `librarySnapshot` row matches by the same name rule or by the item's id (`rename.ts:51-58`).
   - Schedules follow, since they run their template's current version (`rename.ts:4-5`).
   - Project revisions are not rewritten; they keep the name the run used (`rename.ts:4-5`).
   - An unchanged name returns without touching anything (`rename.ts:68`).
9. **Used by** `GET /:id/used-by` lists what names the item, matching the trimmed name case-insensitively within the kind or category (`used-by.ts:131-138,150-236`, `prompts.ts:101-112`, `entries.ts:62-73`, `packages/web/src/library/item-detail.tsx:63-92`):
   - Live project templates, read at their head version.
   - Active and paused schedules, read at their template's head version (`used-by.ts:176-192`).
   - Live projects, with how many of their revisions name it, the total, and whether the current revision does.
   - Legacy projects without revisions, read from their own config.
   - Former names count too: `formerNames` returns the item's earlier names from `library_versions` that no other live item of the same kind or category holds now, so projects that ran it before a rename are still listed (`rename.ts:95-115`).
   - A name set is pre-filtered in SQL with `instr(lower(...))` only when every name is plain printable ASCII without quotes or backslashes (`used-by.ts:155-163`).
   - Fields read per kind (`used-by.ts:74-103`): article → `articlePrompt`, except in a script run; script → `articlePrompt`, only in a script run (Audio is Generate and voices come from the script, `used-by.ts:70-72`); narration → `narrationPrompt`; thumbnail → `thumbnailPrompt`; description → `descriptionPrompt`; shorts → `shorts.prompt`; review → every `reviews.stages.*.prompt`; image → `imagePrompts[].name`, `reference.prompt` and `shorts.imagePrompt`; intro and outro → `intro`/`outro` (a name in a form, `{ name }` in a run config).
10. **Photorealistic flag** (Image prompts only). `PUT /:id/photorealistic` applies at once, separate from Save (`prompts.ts:66-87`, `prompt-editor.tsx:106-116,251-275`):
   - The flag is kept in the `settings` row `library.photorealisticPrompts`, as a sorted JSON id list (`photorealistic.ts:14-58`).
   - It is shown only after the Image prompt is saved ("Save this Image prompt first…").
   - A non-image prompt gets 400: "Only an Image prompt can be marked photorealistic." (`prompts.ts:78-85`).
   - `namesPhotorealisticPrompt` resolves a project's image prompt by its current name. A deleted or renamed prompt reads as not ticked (`photorealistic.ts:60-66`). Studio's AI-use answer is its consumer (scenario 32).
11. **Use in Play** (`packages/web/src/router.tsx:470-491`, `packages/web/src/play/pick-in-play.ts:15-90`):
   - It picks the item in the open Play draft, switches the reading stage to the source that uses it, then opens Play focused on that field.

     | Kind | What changes in the draft |
     |---|---|
     | article | Article is set to Generate. |
     | image | The prompt is added with Number 1 if absent; Images is set to Generate. |
     | thumbnail | Thumbnail is set to `from_prompt`. |
     | description | The YouTube description is turned on. |
     | shorts | Shorts are enabled. |
     | script | Article and Narration are set to Generate, with voices from the script. |
     | review | Goes to every review that is on, or turns on the article review in flag mode. |
     | intro / outro | Sets the matching field. |

   - It is disabled with "Play is starting a run from its draft. Wait for it to start, then try again." while a run is being started from the draft (`router.tsx:480-483`).
   - Row actions appear in this fixed order: Edit, Duplicate, Use in Play, History, Delete (`packages/web/src/library/row-actions.tsx:6-62`).
12. **Starters.** The prompt editor offers a starter for three kinds (`prompt-editor.tsx:222-236,319-331,366-374`, `packages/web/src/lib/narration-starter.ts:1-2`):
   - Narration Preparation: "Use Documentary Starter".
   - YouTube Description and Shorts: "Use Built-in Starter".
   - A starter fills only the unsaved draft. It asks before replacing a non-empty body ("The starter replaces the text in this editor. Nothing is saved until you choose Save.").
13. **Lists.** Rows are sorted by `lower(name)` (`repo.ts:35,79-84`). The prompts list filters by kind tab and a search over name and body (`prompts.tsx:64-74`).
14. **Unsaved editor drafts** are kept in an in-memory map per editor key while the app is open (`packages/web/src/lib/form-drafts.tsx:20-49`, `prompt-editor.tsx:60-63`).

## Branches

- **Name collides within kind or category** → Save refused, name field marked (step 2). Changing the Kind clears a refused-name mark, since names are unique only per kind (`prompt-editor.tsx:195-205`).
- **Prompt used by projects** → deletable anyway. A project holds its own rendered text and template bodies in its revision (scenario 03). Its header shows the run's article prompt name marked "(deleted)" when the Library has no prompt of that name (`packages/web/src/project/header.tsx:159-163`).
- **Prompt named by a template or schedule.** A run from the template uses the Library's current prompt of that name, so edits reach every template and schedule naming it. The copy saved in the template's `librarySnapshot` is used only when the name no longer resolves, as after a delete (a rename rewrites it, step 8) (`packages/app/src/slices/library/snapshot.ts:36-65`, `packages/app/src/slices/project-templates/setup.ts:39-41`).
- **Rename.** Live templates' head revisions and active Play drafts take the new name; schedules follow their template; project revisions keep the old name and are still found by Used by through former names (steps 8-9). Earlier template versions, and drafts not in state `active`, keep the old name (`rename.ts:69-92`).
- **Restore of a version whose name another row now holds** → `duplicate-name` 409 (step 4 goes through step 2).
- **Starter packs** (scenario 41) install prompts under "Name", "Name (2)"…. They reuse an existing row whose body is identical (`packages/app/src/slices/onboarding/install.ts:98-110`).

## Unhappy paths

- **Empty body, over-long text or malformed slots** → 400 "This prompt cannot be saved yet. Fix the highlighted fields and try again." with per-field messages (`prompts.ts:124-132`, `lint.ts:19-46`).
- **Edit, restore, history, used-by or delete of a missing or trashed id** → 404 "This prompt no longer exists; it may have been deleted. Go back to the Library to pick another." (`prompts.ts:148-153`).
- **Inline rename that fails** → the field stays open with the server's sentence, or "The name wasn't saved: … Check that Slopify is running, then press Save name again." (`inline-name.tsx:42-48`).
- **Delete that fails** → callout "The prompt wasn't deleted." with the error (`prompts.tsx:207-211`).
- **Photorealistic toggle fails** → "Couldn't change Draws photorealistic pictures: … Press the switch again." (`prompt-editor.tsx:272-276`).
- **Concurrent writers**: the unique index decides a name race. The row, its version and any rename rewrites commit together or not at all (`save.ts:208-223`).
- **Double Save** of unchanged text writes no extra version (`history.ts:80-81`).

## State transitions

- Template row: absent → live (create, duplicate-save, starter-pack install) → live (edit, rename, restore; each adds a version when changed) → trashed (`deleted_at` set) → live (Trash restore, possibly renamed) | purged (scenario 40).
- Version rows: append-only; `restored_from` marks a Restore.

## Invariants

- Among live rows, names are unique per prompt kind or entry category, case-insensitively (`0039-channel-essentials.sql:19-21`).
- A project never reads a live Library row at run time. It holds its own rendered text and template bodies (scenario 03). Deleting or editing a Library item never changes any project's outputs.
- Every successful save that changes the row has a matching version row (`save.ts:212-223`, `history.ts:85-99`).
- `slots` always describes the stored body (`save.ts:185-186`).
- After a rename commits, no live template head revision or active Play draft names the item's old name in a slot of its kind or category (`rename.ts:67-92`).

## Outcomes & side effects

- Templates and their versions persist in SQLite (scenario 14's data directory). The photorealistic flag lives in `settings` and travels with backups (`photorealistic.ts:10-12`).
- Play pickers and Use in Play reflect the current live set.
- Template and schedule runs pick up edits by name, and renames through the rewrite (Branches).
- A rename updates `project_template_revisions.document_json` at each live template's head version and `play_drafts.document_json` for active drafts (`rename.ts:77-91`).
- Trash entries appear in Settings → Trash (scenario 40).

## Dimensions not in play

- D1 authority: one local actor.
- D5 money: nothing charged.
- D6 limits: no cap on template count or version count.
- D7 time: versions never expire. Trash expiry is scenario 40.
- D10 external failure: no external call.
- D13 notification: toasts only; no channel.
