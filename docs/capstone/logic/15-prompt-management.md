---
generated_at_commit: 54f5cb4c1dab
generated_date: 2026-09-30
capstone_version: 7.0.1
content_hash: 269b0ded8ff8
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
  - Prompt routes: `packages/app/src/edge/http/prompts.ts:44-112`. Entry routes: `packages/app/src/edge/http/entries.ts:36-67`.
- Preconditions: none; the single local user.
- Entities:
  - Prompts have a kind: `article`, `image`, `thumbnail`, `narration` (labelled "Narration Preparation"), `description` ("YouTube Description"), `shorts`, `review`, or `script` ("Script (speakers)") (`packages/app/src/slices/library/model.ts:12-23`, `packages/web/src/lib/prompt-kinds.ts:7-26`).
  - Intro/outro entries have a category (`intro` | `outro`) and a mode (Text | LLM) (`model.ts:25-26,52-67`).
  - One rule set covers both (`model.ts:1-3`, `packages/app/src/slices/library/save.ts:1-2`).

## Steps

1. **Save** (create or update), in `save.ts:41-83,103-144`:
   - `lint` requires a trimmed name of 1-200 characters (`nameMax`, `model.ts:29`).
   - It requires a non-blank body of at most 100 000 characters (`bodyMax`, `model.ts:33`).
   - It requires no slot parse error: unclosed `{{`, empty keyword, or nested brace. Each error is reported with its line and column (`packages/app/src/slices/library/lint.ts:19-68`). The slot grammar is scenario 03's.
   - The name is stored trimmed. `slots` is recomputed from the body on every save (`save.ts:170-191`).
   - The kind or category may change on edit; the editor offers a Kind switch (`packages/web/src/routes/prompt-editor.tsx:195-205`).
2. **Uniqueness** is enforced by partial unique indexes: `prompts(kind, lower(name)) WHERE deleted_at IS NULL` and `entries(category, lower(name)) WHERE deleted_at IS NULL` (`packages/app/src/kernel/db/migrations/0039-channel-essentials.sql:15-21`). A collision becomes `duplicate-name` → HTTP 409, with the field error "Another prompt already has this name. Choose a different name." (`save.ts:193-208`, `prompts.ts:127-140`). There is no read-then-write check.
3. **History.** Every save writes the row and a `library_versions` row in one transaction (`save.ts:197-208`; table `0031-prompt-history-and-description-edits.sql:6`). Rules for versions (`packages/app/src/slices/library/history.ts:80-99`):
   - A save identical to the latest version (name, body, kind, mode) adds no version.
   - A row with no versions yet (written by a backup or import) first gets its previous text as version 1.
   - `GET /:id/history` lists versions newest first. It synthesises version 1 for an item without versions, without writing (`history.ts:52-64,105-126`).
   - The History drawer shows a word diff of any two versions, as "Older" and "Newer" side by side (`packages/web/src/library/history-drawer.tsx:44,97-132`, `packages/app/src/slices/library/diff.ts:272-330`). Past 4000 changed words it shows a whole-text replace (`diff.ts:283-285`).
4. **Restore** `POST /:id/history/:version/restore` re-saves that version's name, body and kind (plus mode for an entry) through the normal Save. The result is a new version with `restored_from` set, so later versions stay (`save.ts:85-93,146-162`, `history-drawer.tsx:67-70`). Restore obeys lint and uniqueness like any save.
5. **Rename in the row** (prompts, entries and templates): Rename turns the name into a field. Enter or Save name saves it; Escape or Cancel leaves it (`packages/web/src/library/inline-name.tsx:17-19`).
   - It is the same `PUT` as the editor, sending the body unchanged (`packages/web/src/routes/prompts.tsx:57-62`, `packages/web/src/routes/entries.tsx:58-63`).
   - A blank name is refused locally. An unchanged name closes the field without a request (`inline-name.tsx:49-60`).
   - Success shows a toast "Renamed “A” to “B”." with Undo, which renames back through the same call (`inline-name.tsx:72-80`).
6. **Duplicate** opens the editor on an unsaved copy named "<name> copy" with the same kind (or category and mode) and body (`prompt-editor.tsx:78`, `packages/web/src/routes/entry-editor.tsx:70-74`). A taken name is refused at Save by step 2.
7. **Delete** asks "Delete "<name>"?", explaining "Moves it to the trash for 30 days (Settings → Trash). Projects that used it keep their text." (`prompts.tsx:224-236`, `entries.tsx:222-234`). It sets `deleted_at` (`packages/app/src/slices/library/repo.ts:68-77`).
   - A trashed row is invisible to every Library read and write (`repo.ts:32-35`) and keeps its versions and photorealistic tick (`packages/app/src/slices/library/photorealistic.ts:11-12`).
   - Restore from Settings → Trash puts it back as "Name (restored)", "Name (restored 2)"… when a live row has taken the name (`packages/app/src/slices/trash/service.ts:89-90`).
   - Trash retention and purge are scenario 40 (`packages/app/src/slices/trash/model.ts:11`).
8. **Used by** `GET /:id/used-by` lists what names the item, matching the trimmed name case-insensitively within the kind or category (`packages/app/src/slices/library/used-by.ts:165-168,177-254`, `packages/web/src/library/item-detail.tsx:63-92`):
   - Live project templates, read at their head version.
   - Active and paused schedules, read at the template version each schedule was saved with.
   - Live projects, with how many of their revisions name it, the total, and whether the current revision does.
   - Legacy projects without revisions, read from their own config.
   - Fields read per kind (`used-by.ts:137-163`): article → `articlePrompt`; narration → `narrationPrompt`; thumbnail → `thumbnailPrompt`; description → `descriptionPrompt`; shorts → `shorts.prompt`; intro and outro → `intro`/`outro`.
   - Every other kind (`image`, and also `script` and `review`) reads `imagePrompts[].name`, `reference.prompt` and `shorts.imagePrompt`.
9. **Photorealistic flag** (Image prompts only). `PUT /:id/photorealistic` applies at once, separate from Save (`prompts.ts:65-86`, `prompt-editor.tsx:106-116,251-275`):
   - The flag is kept in the `settings` row `library.photorealisticPrompts`, as a sorted JSON id list (`photorealistic.ts:14-58`).
   - It is shown only after the Image prompt is saved ("Save this Image prompt first…").
   - A non-image prompt gets 400: "Only an Image prompt can be marked photorealistic." (`prompts.ts:77-84`).
   - `namesPhotorealisticPrompt` resolves a project's image prompt by its current name. A deleted or renamed prompt reads as not ticked (`photorealistic.ts:60-66`). Studio's AI-use answer is its consumer (scenario 32).
10. **Use in Play** (`packages/web/src/router.tsx:463-484`, `packages/web/src/play/pick-in-play.ts:15-90`):
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

   - It is disabled with "Play is starting a run from its draft. Wait for it to start, then try again." while a run is being started from the draft (`router.tsx:473-476`).
   - Row actions appear in this fixed order: Edit, Duplicate, Use in Play, History, Delete (`packages/web/src/library/row-actions.tsx:6-62`).
11. **Starters.** The prompt editor offers a starter for three kinds (`prompt-editor.tsx:222-236,319-331,366-374`, `packages/web/src/lib/narration-starter.ts:1-2`):
   - Narration Preparation: "Use Documentary Starter".
   - YouTube Description and Shorts: "Use Built-in Starter".
   - A starter fills only the unsaved draft. It asks before replacing a non-empty body ("The starter replaces the text in this editor. Nothing is saved until you choose Save.").
12. **Lists.** Rows are sorted by `lower(name)` (`repo.ts:35,79-84`). The prompts list filters by kind tab and a search over name and body (`prompts.tsx:64-74`).
13. **Unsaved editor drafts** are kept in an in-memory map per editor key while the app is open (`packages/web/src/lib/form-drafts.tsx:20-49`, `prompt-editor.tsx:60-63`).

## Branches

- **Name collides within kind or category** → Save refused, name field marked (step 2). Changing the Kind clears a refused-name mark, since names are unique only per kind (`prompt-editor.tsx:195-205`).
- **Prompt used by projects** → deletable anyway. A project holds its own rendered text and template bodies in its revision (scenario 03). Its header shows the run's article prompt name marked "(deleted)" when the Library has no prompt of that name (`packages/web/src/project/header.tsx:156-160`).
- **Prompt named by a template or schedule.** A run from the template uses the Library's current prompt of that name, so edits reach every template and schedule naming it. The copy saved in the template's `librarySnapshot` is used only when the name no longer resolves (deleted or renamed) (`packages/app/src/slices/library/snapshot.ts:36-65`, `packages/app/src/slices/project-templates/setup.ts:39-41`).
- **Rename.** Nothing that names the item by name is updated: templates, schedules, Play drafts, project revisions (`used-by.ts:1-5`; no rename propagation in `slices/library`). A template then falls back to its snapshot. A Play draft shows the old name as an unavailable choice for explicit replacement or Off (`packages/web/src/play/missing-options.test.tsx:12-35` exercises it).
- **Restore of a version whose name another row now holds** → `duplicate-name` 409 (step 4 goes through step 2).
- **Starter packs** (scenario 41) install prompts under "Name", "Name (2)"…. They reuse an existing row whose body is identical (`packages/app/src/slices/onboarding/install.ts:98-110`).

## Unhappy paths

- **Empty body, over-long text or malformed slots** → 400 "This prompt cannot be saved yet. Fix the highlighted fields and try again." with per-field messages (`prompts.ts:117-125`, `lint.ts:19-46`).
- **Edit, restore, history, used-by or delete of a missing or trashed id** → 404 "This prompt no longer exists; it may have been deleted. Go back to the Library to pick another." (`prompts.ts:141-146`).
- **Inline rename that fails** → the field stays open with the server's sentence, or "The name wasn't saved: … Check that Slopify is running, then press Save name again." (`inline-name.tsx:42-48`).
- **Delete that fails** → callout "The prompt wasn't deleted." with the error (`prompts.tsx:207-211`).
- **Photorealistic toggle fails** → "Couldn't change Draws photorealistic pictures: … Press the switch again." (`prompt-editor.tsx:272-276`).
- **Concurrent writers**: the unique index decides a name race. The row and its version commit together or not at all (`save.ts:193-208`).
- **Double Save** of unchanged text writes no extra version (`history.ts:80-81`).

## State transitions

- Template row: absent → live (create, duplicate-save, starter-pack install) → live (edit, rename, restore; each adds a version when changed) → trashed (`deleted_at` set) → live (Trash restore, possibly renamed) | purged (scenario 40).
- Version rows: append-only; `restored_from` marks a Restore.

## Invariants

- Among live rows, names are unique per prompt kind or entry category, case-insensitively (`0039-channel-essentials.sql:19-21`).
- A project never reads a live Library row at run time. It holds its own rendered text and template bodies (scenario 03). Deleting or editing a Library item never changes any project's outputs.
- Every successful save that changes the row has a matching version row (`save.ts:197-208`, `history.ts:85-99`).
- `slots` always describes the stored body (`save.ts:170-171`).

## Outcomes & side effects

- Templates and their versions persist in SQLite (scenario 14's data directory). The photorealistic flag lives in `settings` and travels with backups (`photorealistic.ts:10-12`).
- Play pickers and Use in Play reflect the current live set.
- Template and schedule runs pick up edits by name (Branches).
- Trash entries appear in Settings → Trash (scenario 40).

## Dimensions not in play

- D1 authority: one local actor.
- D5 money: nothing charged.
- D6 limits: no cap on template count or version count.
- D7 time: versions never expire. Trash expiry is scenario 40.
- D10 external failure: no external call.
- D13 notification: toasts only; no channel.
