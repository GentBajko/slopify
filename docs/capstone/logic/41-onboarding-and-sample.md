---
scenario: onboarding-and-sample
screens: [01-projects, 03-project, 08-settings, 11-first-run-tutorial]
depends_on: [02-provider-credentials, 04-run-admission, 12-reruns-and-edits, 15-prompt-management, 22-play-drafts, 24-project-templates, 28-shorts, 40-trash-and-scheduled-backups]
generated_at_commit: 54f5cb4c1dab
generated_date: 2026-09-30
capstone_version: 7.0.1
content_hash: b75d13f117aa
paths_covered:
  - ":(top)packages/app/src/slices/onboarding/**"
  - ":(top)packages/app/src/sample-build/**"
  - ":(top)packages/app/src/edge/http/onboarding.ts"
  - ":(top)packages/app/src/edge/http/app.ts"
  - ":(top)packages/app/src/main.ts"
  - ":(top)packages/web/src/onboarding/**"
  - ":(top)packages/web/src/routes/welcome.tsx"
  - ":(top)packages/web/src/routes/home.tsx"
  - ":(top)packages/web/src/project/next-action.ts"
  - ":(top)packages/web/src/project/next-action-view.tsx"
---

# 41 Onboarding: first run, starter packs, first short and the bundled samples

The first five minutes of an install: the `/welcome` screen and whether it shows, starter packs installed into the Library, "Make a 60-second short" from a topic with providers picked for the user, the finished short's "Make the full video on this topic", and three bundled read-only sample projects with Make my own copy and Restore samples (`packages/app/src/edge/http/onboarding.ts:48-49`, `packages/app/src/slices/onboarding/sample.ts:14-20`). HTTP prefix `/api/onboarding` (`packages/app/src/edge/http/app.ts:222`). The separate provider-defaults welcome under `/api/providers/first-run` (setting `first-run.done`) is scenario 02.

## Trigger & preconditions

| Trigger | Where | Precondition |
|---|---|---|
| First-run state | `GET /api/onboarding` (no-store) read by Home, Projects, `/welcome`, the packs drawer and the autostart reminder (`packages/app/src/edge/http/onboarding.ts:79-82`, `packages/web/src/onboarding/api.ts:11-25`) | none; reading writes nothing (`packages/app/src/slices/onboarding/first-run.ts:10-13`) |
| Open `/welcome` | Home navigates there once per page load when `show` is true (`packages/web/src/routes/home.tsx:57-65`) | `show` |
| Skip / Done | `/welcome` header button → `POST /api/onboarding/dismiss` then Home (`packages/web/src/routes/welcome.tsx:108-114`, `:159-166`) | none |
| Add pack | `/welcome` step 2 and the starter packs drawer → `POST /api/onboarding/packs/:id` (`packages/web/src/onboarding/packs-drawer.tsx`, `packages/app/src/edge/http/onboarding.ts:87-97`) | id 1–40 chars and a known pack |
| Make a 60-second short | `/welcome` step 3 form → `POST /api/onboarding/short` (`packages/web/src/routes/welcome.tsx:119-139`, `packages/app/src/edge/http/onboarding.ts:98-186`) | `topic` 1–200 chars trimmed, optional `packId` ≤ 40, `requestId` UUID, strict (`packages/app/src/slices/onboarding/model.ts:66-72`) |
| Make the full video on this topic | Project rail on a `done` project with `mode: "short"` (`packages/web/src/project/next-action.ts:353-363`) → `POST /api/onboarding/full-video` (`packages/web/src/project/next-action-view.tsx:124-137`, `packages/app/src/edge/http/onboarding.ts:187-211`) | `{projectId ≤ 64, draftId UUID}` strict (`model.ts:75-79`) |
| Seed samples | Boot, before the server answers, when `seedSample` is set (the CLI always sets it) and no Docker activation is pending (`packages/app/src/main.ts:578-585`, `packages/app/src/edge/cli.ts:91`) | per sample: no `onboarding.sample*` record yet (`packages/app/src/slices/onboarding/sample.ts:73-95`) |
| Make my own copy | Sample project rail and palette "Make my own copy" (`packages/web/src/project/next-action.ts:155-162`, `packages/web/src/routes/project.tsx:300-310`) → `POST /api/onboarding/sample/copy` (`packages/app/src/edge/http/onboarding.ts:226-254`) | body `{projectId?: ≤ 60}` strict; the project is a recorded, live sample; the catalogue is loaded |
| Restore samples | Settings → Backup & storage → Sample projects (`packages/web/src/onboarding/sample-settings.tsx:18-65`) → `POST /api/onboarding/sample/restore` (`packages/app/src/edge/http/onboarding.ts:216-225`) | every bundled archive present (`sample.ts:108-115`) |
| Any write to a sample | `POST/PUT/PATCH/DELETE /api/projects/:id/*` (`packages/app/src/edge/http/app.ts:275-293`) | read-only guard, below |

Actor: the single local user; seeding runs with no actor.

## Steps

### First-run state

1. **Remembered state** lives in settings keys `onboarding.dismissed`, `onboarding.sample` (and `onboarding.sample.audiobook`, `.podcast`), `onboarding.packs`, `onboarding.short-requests` (`packages/app/src/slices/onboarding/state.ts:6-14`, `:56-59`). None is a portable setting, so a backup never carries them (`packages/app/src/slices/storage/portable.ts:475-535`).
2. **`firstRunView`** (`packages/app/src/slices/onboarding/first-run.ts:14-44`): `real` = a row in `projects` whose id is none of the three sample ids; `show = !real && !dismissed`; `settle = real && !dismissed`. It also returns who would narrate (`firstVoice`: the first keyed, usable TTS provider's name, else the local speech engine's availability, engine name and issue) (`first-run.ts:46-63`), the three CLIs with installed/ready/version/issue and `draws` true for Codex (`first-run.ts:65-82`), the sample ids, and each starter pack with `installed` = its recorded template still exists (`first-run.ts:29-42`).
3. **Settle.** Home posts dismiss once per page load when `settle` is true, so a real project made before the screen was done keeps it away even after every project is deleted (`packages/web/src/routes/home.tsx:66-75`). `dismissFirstRun` writes the timestamp only when unset (`state.ts:52-54`).
4. `/welcome` has three tabs: "1 · What you have", "2 · Pick a style", "3 · Make your first short" (`packages/web/src/routes/welcome.tsx:58-62`).

### Starter packs

5. Packs: `sleep-lore`, `true-crime`, `history`, `science`, each with a suggested OpenAI TTS voice, a style (research on/off, expected words, images per video, image seconds, zoom, motion, captions, video edit) and prompts for article, 60-second short script, scene image, thumbnail, description and shorts; plus the hidden `starter` set (short script and vertical scene only, voice `alloy`) used when no pack is picked (`packages/app/src/slices/onboarding/packs.ts:90-558`). `packById` resolves both (`packs.ts:558-560`).
6. **`installPack`** in one transaction (`packages/app/src/slices/onboarding/install.ts:29-96`):
   - a prompt the pack recorded earlier that still exists is kept as it is, edits included;
   - otherwise `placePrompt` tries the pack's name, then "Name (2)", "(3)"…: a live prompt of that kind with that name and the exact body is reused; any other with that name moves on to the next suffix; a free name inserts the prompt with its detected slots (`install.ts:98-122`);
   - `placeVoice` reuses the recorded voice or any saved voice with the same provider and voice id, else inserts the pack's voice (`install.ts:124-146`);
   - with `template: true` (the default) and no live recorded template, `createTemplate` makes "<Pack> starter" (then "(2)"…) from `packTemplate` (`install.ts:63-77`, `:148-154`). `packTemplate` is a 16:9 Play document with the pack's prompts ticked, its voice, burn-in captions, shorts on when the pack has a shorts prompt (2 clips, 45–90 s), document Off, and text and image providers left empty (`packages/app/src/slices/onboarding/template.ts:5-80`);
   - the pack record `{installedAt, prompts, voice, template?}` is written; the answer says whether anything was added (`install.ts:78-94`).

### Make a 60-second short

7. A `requestId` already recorded for a live project answers `{projectId, replayed: true}` (`packages/app/src/edge/http/onboarding.ts:100-102`, `packages/app/src/slices/onboarding/state.ts:31-35`, `:84-86`). The client keeps one id per press across retries (`packages/web/src/routes/welcome.tsx:106-107`, `:119-130`).
8. The pack is `packId` or the starter set; the model lister must be wired, else 503 (`onboarding.ts:103-118`).
9. **`planShortProviders`** (`packages/app/src/slices/onboarding/quick-short.ts:78-165`):
   - text: the first usable of `claude-code`, `codex`, `gemini`, `openrouter` whose model list is non-empty; the model is the preferred one (`claude-code` → `/sonnet/i`) else the first (`quick-short.ts:38-46`, `:91-105`);
   - images: the first usable of `codex-image`, `openai-image`, `google-image`, `fal`, `replicate` with a model (`quick-short.ts:107-121`);
   - voice: a saved voice of a usable keyed provider, else the pack's suggested provider when usable (voice id = saved or suggested; model preferred `gpt-4o-mini-tts` for OpenAI), else the system voice when usable and a speech engine was found (a saved system voice id first) (`quick-short.ts:123-148`);
   - each missing need adds a gap sentence naming the fix (`quick-short.ts:100-105`, `:116-121`, `:149-160`).
10. Gaps → 409 with every gap sentence and `extensions.gaps` (`onboarding.ts:119-132`).
11. `installPack(pack, {template: false})` adds the pack's prompts and voice only (`onboarding.ts:133-140`). A system voice not yet saved is added as "<name> (computer voice)" with its primary language (`onboarding.ts:141-163`).
12. **`shortDraft`** (`quick-short.ts:167-219`): `mode "short"`, 9:16, title = topic with collapsed spaces and a capital first letter, cut to `titleMax`; sources research Off, article/audio/images/video Generate, thumbnail and document Off; article prompt = the pack's short script; one image prompt × 4 images at 15 s; silence gap and edge silence 0.5 s; sentence pause default; subtitles Off with the pack's caption size/position; loudness from Settings when set. `createProject` admits it like any run (scenario 04; the short itself is scenario 28).
13. On success the request id → project is recorded (the newest 20 kept) and the first run is dismissed; answer 201 (`onboarding.ts:182-185`, `state.ts:88-97`).

### Make the full video on this topic

14. **`fullVideoDraft`** (`packages/app/src/slices/onboarding/full-video.ts:36-82`): the live project must exist (`not-found`) and be `mode: "short"` (`not-short`). Topic = `values.topic` or the title. The pack is the one whose recorded short-script prompt still has the name the project used, else the starter set (`full-video.ts:25-34`).
15. `packDocument` installs the pack with its template (not for the starter set) and opens the template like Templates → Apply to Play; the starter set uses `packTemplate` with no saved template (`full-video.ts:84-99`).
16. The draft takes the short's title and topic, and the short's text, image and voice providers wherever the template left the provider empty (text/images) or always (voice) (`full-video.ts:48-80`). `createDraft` with the browser's `draftId` returns the same draft on a repeated press when content and version match, else `conflict` (`packages/app/src/slices/play-drafts/service.ts:157-176`). The client opens the draft in Play; nothing starts until Play is pressed (`packages/web/src/project/next-action-view.tsx:124-135`, `packages/web/src/project/next-action.ts:360-362`).

### Bundled samples

17. **Archives**: `assets/sample/sample-project.tar` ("The Library of Alexandria": video, shorts, article, PDF, description, captions, images), `sample-audiobook.tar`, `sample-podcast.tar`, each a full Export everything archive (`packages/app/src/slices/onboarding/sample.ts:14-30`, `packages/app/src/slices/onboarding/model.ts:6-9`). They are built offline by `sample-build/` through the real pipeline with local stand-in providers (`sample-writer` text, pre-made or procedural pictures and narration) (`packages/app/src/sample-build/generate.ts:30-55`). Shallow: `sample-build/` internals not inventoried beyond that header.
18. **Seed** (`sample.ts:76-101`): for each of `library`, `audiobook`, `podcast` with no record: a missing archive logs `warn sample.seed` and is skipped; otherwise `importSample` runs `importBackup` on the archive (scenario 40's merge rules apply to everything in it), takes the imported project (or a skipped one that is live here) and writes `{projectId, seededAt}` (`sample.ts:145-163`). A throw is logged `warn sample.seed` by `main.ts` and costs only the samples (`packages/app/src/main.ts:578-585`).
19. **Sample ids**: a sample's id is reported only while its recorded project is live (`projectTitle` excludes the trash) (`sample.ts:47-65`, `packages/app/src/slices/storage/repo.ts:100-108`). `isSampleProject` checks the record only, trashed or not (`sample.ts:67-69`). Projects shows a Sample badge on those ids (`packages/web/src/routes/projects.tsx:118-122`).
20. **Read-only guard** (`packages/app/src/edge/http/app.ts:275-293`, `:324-326`): on `/api/projects/:id/*`, any method other than GET/HEAD/OPTIONS on a sample project answers 409 `sample-read-only` "This is the sample project, which is read-only so trying things on it never spends anything. Press Make my own copy…", except `…/revisions/prepare`, `…/rebuild/preview`, `…/open-folder` and `DELETE /api/projects/:id` itself (which moves it to the trash, scenario 40). The web disables Save as template on it and shows the rail "This is the sample project, finished and free to explore." (`packages/web/src/routes/project.tsx:452`, `packages/web/src/project/next-action.ts:155-162`).
21. **Make my own copy** (`sample.ts:165-185`, `packages/app/src/slices/onboarding/copy.ts:32-94`): the id defaults to the Library of Alexandria; title "<title> (my copy)". Every row of every `projectTables` table is read; every `id`, `publication_id` and `admission_id` value ≥ 16 chars gets a new id; every string column of every row is rewritten through one regex of old → new ids; files are copied with remapped paths; rows are inserted in one transaction with deferred foreign keys; `projects.created_at/updated_at = now` (`copy.ts:37-88`).
22. **Rebind** (`copy.ts:96-146`): up to 40 passes, the copy's execution plan is recomputed and every changed input identity and request fingerprint is replaced in `revision_outputs`/`revision_pieces` fingerprints and descriptors and `project_revisions.content`, until nothing changes; then the revision's `fingerprints` are rewritten. The copy therefore has nothing to rebuild. The route emits `project.updated` globally and answers 201 (`packages/app/src/edge/http/onboarding.ts:245-253`).
23. **Restore samples** (`sample.ts:103-143`): for each sample, the recorded project — live or in the trash — is removed for good with `deleteProject` (folder, then rows), then the archive is imported again and the record rewritten. Copies are not touched. The screen has no confirmation step; it reports "The samples are back in Projects." (`packages/web/src/onboarding/sample-settings.tsx:54-63`).

## Branches

- **Voice for the first short**: keyed saved voice → pack's suggested keyed voice → computer voice → gap (`packages/app/src/slices/onboarding/quick-short.ts:123-160`). Gap wording differs when a keyed voice provider is ready but has no saved voice (`quick-short.ts:156-158`).
- **Pack given or not**: `packId` → that pack; none → `starter` (`packages/app/src/edge/http/onboarding.ts:103`).
- **Full video pack**: a real pack installs its template (Add pack can add it later too); the starter set has no template (`packages/app/src/slices/onboarding/full-video.ts:86-92`).
- **Pack "installed"** counts only with its template: the first short installs prompts and voice without it, so Add pack still offers the template later or again after deletion (`packages/app/src/slices/onboarding/first-run.ts:29-42`).
- **Copy target**: body `projectId` or the Library of Alexandria (`onboarding.ts:227-237`).

## Unhappy paths

| Case | Behaviour | Source |
|---|---|---|
| Unknown pack (Add pack or short) | 404 "Slopify doesn't have that starter pack. Reload the page and pick one of the packs listed." | `packages/app/src/edge/http/onboarding.ts:89-95`, `:104-110`, `:134-140` |
| Model lister unavailable | 503 "Slopify can't list the models on this machine right now. Restart Slopify and try again." | `onboarding.ts:111-118` |
| No text / image / voice ready | 409 with each gap sentence | `onboarding.ts:126-132`, `packages/app/src/slices/onboarding/quick-short.ts:100-160` |
| A provider's model list throws | treated as no model for that provider; the next is tried | `quick-short.ts:60-76` |
| Double press / retried request | same project, `replayed: true` | `onboarding.ts:100-102` |
| `createProject` refuses | its status with the detail and field messages | `onboarding.ts:174-181` |
| Pack template refused internally | throws "Slopify hit an internal error (the … pack's template was refused …)" | `packages/app/src/slices/onboarding/install.ts:71-74` |
| Full video: short gone or pack gone | 404 "This short or its starter pack is no longer here…" | `onboarding.ts:190-196` |
| Full video on a long video | 409 "This project is already a long video…" | `onboarding.ts:197-203` |
| Full video draft conflict / invalid | 409 with `reason` | `onboarding.ts:204-210` |
| Copy: bad body | 400 "Slopify couldn't tell which sample to copy…" | `onboarding.ts:228-235` |
| Copy: no catalogue, no sample, trashed sample | 404 "…Restore samples, then press Make my own copy." | `onboarding.ts:236-244`, `packages/app/src/slices/onboarding/sample.ts:176-183` |
| Copy: id not a sample | 404 "Only a sample project can be copied this way…" | `sample.ts:169-175` |
| Copy: rebind never settles | throws an internal-error sentence; the copied folder is removed and the transaction rolls back | `packages/app/src/slices/onboarding/copy.ts:89-92`, `:143-145` |
| Restore: an archive missing | 500 "…Update Slopify… and try Restore samples again." | `sample.ts:108-115` |
| Restore: sample busy / files locked | 409 / 500 naming the fix; samples before it in the loop are already replaced | `sample.ts:130-138` |
| Seed / restore import yields no project | throws "Slopify couldn't add a sample project (…)" | `sample.ts:153-156` |
| Write to a sample | 409 `sample-read-only` | `packages/app/src/edge/http/app.ts:286-293` |

**Gaps and edge cases the code leaves as they are:**

- `firstRunView`'s `real` query reads `projects` without the trash filter, while a trashed sample reports as `null` in `samples`: with any project in the trash — including a trashed sample — `real` is true (`packages/app/src/slices/onboarding/first-run.ts:15-19`, `packages/app/src/slices/onboarding/sample.ts:47-52`).
- Make my own copy has no idempotency key: each press makes another copy (`packages/app/src/edge/http/onboarding.ts:226-254`).
- A sample exported in a backup and imported elsewhere carries no `onboarding.sample` record, so it is an ordinary editable project there; on an install whose own sample has the same id it is skipped as "already in this install" (`packages/app/src/slices/onboarding/state.ts:6-9`, `packages/app/src/slices/storage/backup-import.ts:621-623`).
- Restore samples replaces one sample at a time; a refusal midway leaves the earlier ones replaced (`sample.ts:116-141`).

## State transitions

| Entity | Transition | Rule |
|---|---|---|
| First run | not dismissed → dismissed (never back) | Skip/Done, first short, or settle (`packages/app/src/slices/onboarding/state.ts:52-54`, `packages/app/src/edge/http/onboarding.ts:83-86`, `:183-184`) |
| Sample record | absent → `{projectId, seededAt}` | seed or restore (`packages/app/src/slices/onboarding/sample.ts:157-161`) |
| Sample project | live → trashed | user Delete (allowed by the guard); it stays deleted until Restore samples (`sample.ts:73-75`, `packages/app/src/edge/http/app.ts:280-285`) |
| Sample project | any → removed → re-imported | Restore samples (`sample.ts:116-141`) |
| Pack record | absent → recorded; template id added later | `packages/app/src/slices/onboarding/install.ts:78-84` |

Forbidden: any mutation of a sample project other than trashing it; seeding a sample twice without Restore.

## Invariants

- Nothing on a sample project reaches a paid provider: every write route but trash, prepare, preview and open-folder is refused (`packages/app/src/edge/http/app.ts:275-293`).
- A copy of a sample shares no id, path or fingerprint with it and has nothing to rebuild after the copy (`packages/app/src/slices/onboarding/copy.ts:14-22`, `:96-128`).
- A starter pack never overwrites or renames a user's prompt, voice or template (`packages/app/src/slices/onboarding/install.ts:29-34`).
- One `requestId` makes at most one short project (`packages/app/src/edge/http/onboarding.ts:100-102`, `:182`).
- Once dismissed, the first-run screen never shows again on this install (`packages/app/src/slices/onboarding/first-run.ts:20-24`).
- Restore samples never touches a user's copies (`packages/app/src/slices/onboarding/sample.ts:103-104`).

## Outcomes & side effects

- Library rows (prompts, a voice, a template) and a pack record per installed pack.
- A short-mode project admitted and running; Home and voices refresh (`packages/web/src/routes/welcome.tsx:131-135`).
- A Play draft for the full video; nothing runs until Play.
- Sample projects in Projects with a Sample badge; `backup_imports` rows from each seed/restore import (scenario 40).
- Copy: a new ordinary project and a global `project.updated` event (`packages/app/src/edge/http/onboarding.ts:252`).

## Dimensions not in play

- D1 authority: one local user; no roles.
- D5 money: onboarding itself charges nothing; the first short's provider calls are charged under scenarios 04 and 28; samples and copies make no call.
- D7 time: no expiry; only the short-request map is bounded (20 entries) (`packages/app/src/slices/onboarding/state.ts:34-35`).
- D13 notification: no run notice or webhook is specific to onboarding; the short notifies like any run.
- D14 effects on others: single install; backups exclude the onboarding keys (`packages/app/src/slices/storage/portable.ts:475-535`).
