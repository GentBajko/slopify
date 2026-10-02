---
scenario: studio-autopilot
screens:
- 01-projects
- 03-project
- 08-settings
- 23-studio-upload
- 24-ab-results
depends_on:
- 27-youtube-description
- 28-shorts
- 32-studio-upload-prep
- 38-home-attention-and-uploads
- 40-trash-and-scheduled-backups
generated_at_commit: e9226a34aa8a
generated_date: 2026-10-02
capstone_version: 7.0.1
content_hash: 950e96af4baf
paths_covered:
  - ":(top)packages/app/src/slices/studio/plan.ts"
  - ":(top)packages/app/src/slices/studio/stats.ts"
  - ":(top)packages/app/src/slices/studio/videos.ts"
  - ":(top)packages/app/src/slices/studio/pack.ts"
  - ":(top)packages/app/src/edge/http/studio.ts"
  - ":(top)packages/app/src/edge/http/projects.ts"
  - ":(top)packages/app/src/kernel/db/migrations/0045-youtube-videos.sql"
  - ":(top)packages/app/src/kernel/db/migrations/0047-studio-autopilot.sql"
  - ":(top)packages/extension/src/background.ts"
  - ":(top)packages/extension/src/content.ts"
  - ":(top)packages/extension/src/comment.ts"
  - ":(top)packages/extension/src/studio-pages.ts"
  - ":(top)packages/extension/src/fill.ts"
  - ":(top)packages/extension/src/popup.ts"
  - ":(top)packages/extension/static/manifest.json"
  - ":(top)packages/web/src/studio/posting-plan.tsx"
  - ":(top)packages/web/src/studio/prepare-upload.tsx"
  - ":(top)packages/web/src/project/on-youtube.tsx"
  - ":(top)packages/web/src/routes/ab-results.tsx"
  - ":(top)packages/web/src/routes/projects.tsx"
---

What Slopify and the Slopify Studio extension do around an upload besides filling its dialog (32-studio-upload-prep.md): a weekly posting plan that dates every upload, the Details-page touches after Studio confirms an upload, the opt-in pinned comment, A/B tests set up on request, and Studio's numbers read back once a day. Slopify decides and stores; the extension acts in Studio with the person's own signed-in session and reports back. Paths starting `slices/` or `edge/` are under `packages/app/src/`; routes are under `/api/studio`.

## Trigger & preconditions

| Behavior | Trigger | Preconditions |
|---|---|---|
| Edit the posting plan | Settings → YouTube Studio → Posting plan, Save posting plan → `PUT /plan` (`packages/web/src/studio/posting-plan.tsx:52-199`, `edge/http/studio.ts:243-249`) | Request from the Slopify page's own origin (`edge/http/studio.ts:168-177`) |
| A project takes a slot | Any read of its pack: `GET /packs/:projectId`, `GET /ext/ready`, `POST /ext/upload`, `POST /ext/upload-all` (`edge/http/studio.ts:281`, `:559`, `:596`, `:606`) | Its long video is not `done` on YouTube and its pack has a rendered video (`planned`, `edge/http/studio.ts:201-206`) |
| Change or clear a slot | Prepare upload → Schedule step's slot picker → `PUT /packs/:projectId/slot` (`packages/web/src/studio/prepare-upload.tsx:341-377`, `edge/http/studio.ts:287-315`) | Same origin; a new slot must be one of the nine offered |
| Details touches | Studio confirmed an upload (`POST /ext/video/done`, `edge/http/studio.ts:710-736`) | The item has a related video, an end-screen video or captions |
| Pinned comment | Same confirmation | Long video with a pinned comment, and setting `studio.autoComment` is `on` at that moment |
| Run waiting tasks | Extension alarm `slopify-ab-tests` every 15 min (first after 1 min), and on browser start (`packages/extension/src/background.ts:408-418`) | Extension paired and the `tabs` API present (`background.ts:155-156`) |
| A/B test | On YouTube → A/B test menu, or the popup's "A/B test…" on an uploaded long video (`packages/web/src/project/on-youtube.tsx:159-189`, `packages/extension/src/popup.ts:110-165`) | The long video is `done` with a known id; the person is signed in to Studio |
| Studio's numbers | The same check, at most once per 24 h (`background.ts:189-208`) | At least one `done` video |

## Steps

### Posting plan (`slices/studio/plan.ts`)

1. **Shape** (`plan.ts:13-26`): `{ timeZone (1–100 chars), rows (≤ 14) }`; a row is `{ name (trimmed, 1–20), long: slot, shorts: slot[] (≤ 10) }`; a slot is `{ day 0–6 (Sun–Sat), time "HH:MM" 00:0–23:60 }`. Stored as JSON in setting `studio.postingPlan` (`:29`, `:73-75`).
2. **Default** (`plan.ts:32-59`, `:61-71`): absent or unparseable reads as rows A (Sun 20:0), B (Tue 20:0), C (Thu 20:0), five shorts each, in the server's time zone (`Intl` resolved zone, else `UTC`).
3. **Editor** (`packages/web/src/studio/posting-plan.tsx:77-190`): a table of rows (day select + time input per cell); Add a row (disabled at 14) names the row by the next letter and copies the last row's slots; each row has Remove; the zone select offers the plan's zone and America/New_York, America/Los_Angeles, Europe/London, UTC; Save is enabled only with unsaved changes. `GET /plan` and `PUT /plan` answer `{ plan, free }`, `free` = the next nine free slots (`edge/http/studio.ts:239-249`).
4. **Coming slots** (`comingSlots`, `slices/studio/plan.ts:168-185`): every row's long-video time on each of the next 8 weeks' days, in the plan's zone, from one hour after now, sorted by instant. Wall-clock times become instants with `zonedInstant` (`:117-124`): an ambiguous time takes the later reading, a skipped one the hour after.
5. **Free slots** (`freeSlots`, `:219-234`): coming slots whose `long_at` instant no project holds in `upload_slots`.
6. **Assignment** (`assignedSlot`, `:200-217`): a project keeps the slot it has; otherwise it takes the first free one, written to `upload_slots (project_id, row_name, long_at, assigned_at)` (`:236-242`; `packages/app/src/kernel/db/migrations/0047-studio-autopilot.sql:4-9`). A kept slot is not re-checked against now or against later plan edits.
7. **Each short's time** (`scheduleOf`, `slices/studio/plan.ts:187-196`; `nextOccurrence`, `:144-153`): short N goes out at the first time its own day and hour come round strictly after the long video's slot, so a plan never needs "next week"; a row name no longer in the plan gives no short times. The pack puts these into each item's `scheduleAt` (32).
8. **Picker** (`PUT /packs/:projectId/slot`, `edge/http/studio.ts:286-315`): `{ slot: { row, longAt } | null }`; `null` keeps an empty row (`unschedule`, `slices/studio/plan.ts:245-247`), which `assignedSlot` reads as "no slot" so the project is not given one again (`slices/studio/plan.ts:200-215`); a slot not among the nine free ones → 409; otherwise `setSlot`. The drawer lists "Not scheduled (set it in Studio yourself)", the current slot and the free ones, each as "<row> · <weekday day month, HH:MM>" in the browser's zone (`packages/web/src/studio/prepare-upload.tsx:90-98`, `:341-377`).
9. **Typing it into Studio** is the upload dialog's Visibility step (32, `packages/extension/src/studio-pages.ts:58-105`); Studio shows and takes the time in the browser's zone (`studio-pages.ts:41-55`).

### Details touches after a confirmed upload (the `finish` task)

1. **Queued** by `/ext/video/done` when the confirmed item has `relatedVideoId`, `endScreenVideoId` or `captions`: `finish_state = 'waiting'` (`edge/http/studio.ts:718-728`; columns in `packages/app/src/kernel/db/migrations/0047-studio-autopilot.sql:10-13`). A short has `relatedVideoId` only if its long video was already `done` when its pack was read (`slices/studio/pack.ts:264`); the long video has `captions` whenever a `subtitles_srt` output exists (`:186`).
2. **Picked up** (`checkTasks`, `packages/extension/src/background.ts:155-187`): `GET /ext/tasks` (`edge/http/studio.ts:629-644`) lists `finish` and `comments` tasks oldest first, each with its pack item; a task whose project or item is gone is left out. A finish task with a related video waits until that video is public by YouTube's oEmbed answer (`background.ts:134-143`, `:171-173`). Each task opens a background tab at `https://studio.youtube.com/video/<id>/edit#slopify-finish&p=<project>&s=<short>`; the same task is not opened again for 30 minutes (`tasksOpened` in `storage.local`, `:129-131`, `:161-169`).
3. **Done on the Details page** (`runFinish`, `packages/extension/src/content.ts:321-340`; `finishDetails`, `packages/extension/src/studio-pages.ts:234-256`): the item comes from `GET /ext/packs/:projectId` with its thumbnails' and captions' bytes (`background.ts:222-239`). In order: Related video set to the long video through Studio's video picker (`studio-pages.ts:135-152`, picker `:109-133`); end screen gets a Video element pointing to `endScreenVideoId`, then the end screen editor's Save (`:154-189`); for the long video only, captions uploaded "With timing" and the Subtitles editor's Done (`:191-232`, `content.ts:338`); then the Details page's Save when Studio enabled it (`studio-pages.ts:243-251`). These Saves go through `pressToSave`, which skips the forbidden-button refusal (`packages/extension/src/fill.ts:588-593`).
4. **Reported** (`POST /ext/task-result`, `edge/http/studio.ts:645-651`): `finish_state` = `done` when every step succeeded, else `failed`, with the steps' messages joined; the worker closes the tab on that report (`background.ts:386-398`).

### Pinned comment (opt-in, the `comment` task)

1. **Setting**: `studio.autoComment` = `on`/`off` via the Posting plan's switch "Post and pin each video's comment once it is public (the extension posts it in your name)" → `PUT /settings/auto-comment` (`packages/web/src/studio/posting-plan.tsx:191-196`, `edge/http/studio.ts:227-237`); `GET /settings` reads it as `on` only when the row says `on` (`:216-226`).
2. **Queued** by `/ext/video/done` for the long video only, when its item has `pinnedComment` and the setting is `on`: `comment_state = 'waiting'` (`edge/http/studio.ts:729-734`).
3. **Picked up** by `checkTasks` once the video is public by oEmbed: a background tab at `https://www.youtube.com/watch?v=<id>#slopify-comment&p=<project>&s=<short>` (`background.ts:179-185`).
4. **Posted** (`packages/extension/src/comment.ts:25-126`): scrolls up to ten times to load comments, opens the comment box, inserts the text, presses the comment's submit button, waits up to 15 s for a thread containing the text's first 40 characters, opens that comment's menu, presses Pin and the confirmation's Pin, then reports `comment` done or failed with a sentence.

### A/B test on request

1. **Asked for** from On YouTube (long video, `done`) or the popup's "A/B test…" with the choices Titles and thumbnails / Titles / Thumbnails; both open `https://studio.youtube.com/video/<id>/edit#slopify-ab=<both|titles|thumbnails>&p=<project>&s=0` in a new tab (`packages/web/src/project/on-youtube.tsx:19-26`, `packages/extension/src/popup.ts:131-165`).
2. **Set up** (`runAb`, `packages/extension/src/content.ts:306-319`): the item comes through the worker; the page waits up to 30 s for the Details editor (`:301-304`); `openAbTest` (`packages/extension/src/fill.ts:439-458`) takes the item's other titles (all titles but the one the upload used) unless the mode is Thumbnails, and every thumbnail (the upload's first) unless the mode is Titles. With no other titles and fewer than two thumbnails it stops with "This video has no other titles to test…" or "This video has only one thumbnail, and A/B Testing needs two or three…" (`:449-457`).
3. **Filling the dialog** (`fillAbTest`, `fill.ts:334-430`): Studio's mode follows what is tested: titles and two or more thumbnails → "Title and thumbnail", titles alone → "Title only", thumbnails alone → "Thumbnail only" (`:344-347`); it presses A/B Testing (`:368`), the mode's chip (`:384`), puts the thumbnails into rows 1–3, writes the video's title into title box 1 when Studio left it empty and the other titles into boxes 2 and 3 (`:387-417`). The dialog is left open; the toast says to check it, press Set test, then Save on the video (`fill.ts:426-430`, `content.ts:314-318`).
4. **Nothing is recorded** when a test is set up: the person presses Set test and Save in Studio. The daily stats sweep reads every long video's A/B result page (step 3 of `#slopify-stats`), so a finished test is found without Slopify knowing it was started (`packages/extension/src/content.ts`, `runAbRead`). The `ab_state` column from migration 0045 is no longer written beyond its reset to `none` (`slices/studio/videos.ts:80`). The alarm keeps the name `slopify-ab-tests` (`background.ts`).

### Studio's numbers and A/B results

1. **Sweep** (`sweepStats`, `packages/extension/src/background.ts:189-208`): when the last sweep is older than 24 h, `GET /ext/known-videos` (every `done` video, newest first, `slices/studio/videos.ts:155-161`) becomes the day's list in `storage.local`; `nextStats` opens one background tab at a time at the video's Analytics Reach tab with `#slopify-stats=1&p=…&s=…` (`background.ts:210-220`).
2. **Reading** (`runStats`, `packages/extension/src/content.ts:342-382`): step 1 reads the Reach tab's key metrics by Studio's own ids (`readMetrics`, `packages/extension/src/studio-pages.ts:273-284`; values like "493", "2.2%", "1.2K", "32:19" parsed by `metricValue`, `:260-271`), keeps them in `sessionStorage` and moves the tab to the Engagement tab (step 2); a short reports from there; a long video moves once more to its Details page (step 3, `runAbRead`, `content.ts:384-407`), where `readAbResult` presses A/B Testing's button only when its label speaks of results and reads two or three rows each with a percentage, then presses Escape (`studio-pages.ts:295-336`).
3. **Report** (`POST /ext/stats`, `edge/http/studio.ts:664-689`; body `:132-142`): the worker maps `VIDEO_THUMBNAIL_IMPRESSIONS` → impressions, `VIDEO_THUMBNAIL_IMPRESSIONS_VTR` → ctr (percent, 0–100), `EXTERNAL_VIEWS` → views, `AVERAGE_WATCH_TIME` → averageViewSeconds, `EXTERNAL_WATCH_TIME` → watchHours (`background.ts:335-359`). `saveStats` upserts one `video_stats` row per `(project, short)` with `read_at` = now; a metric not read is stored null (`slices/studio/stats.ts:42-59`). Two or three A/B variants (`title`, `thumbnail` 1–3, `share` percent, `winner`) upsert one `ab_results` row (`stats.ts:21-29`, `:93-105`). The worker closes the tab and opens the next on that report (`background.ts:394-397`).
4. **Shown**: On YouTube's row "N views · X% CTR of M impressions · m:ss average view · read <date>" (`packages/web/src/project/on-youtube.tsx:198-225`; `GET /stats/:projectId`, `edge/http/studio.ts:385-387`); the Projects list row adds the long video's "N views · X% CTR" (`edge/http/projects.ts:81`, `:93-98`; `packages/web/src/routes/projects.tsx:350-355`); Library → A/B results (`/ab-results`, `packages/web/src/routes/ab-results.tsx:41-111`; `GET /ab-results`, `edge/http/studio.ts:388`, newest read first, joined to the project's title, rows whose variants do not parse left out, `slices/studio/stats.ts:107-131`). The page orders variants by share and labels the first "winner"; Copy as prompt notes puts a summary on the clipboard to paste into a Library prompt by hand (`ab-results.tsx:24-39`, `:56-73`, `:84-101`).

## Branches

- Long video already `done` (uploaded, pasted or backfilled) → `planned` assigns no slot (`edge/http/studio.ts:201`); a backfilled long video gives up its slot (`slices/studio/backfill.ts:34-35`).
- "Not scheduled" in the picker sticks: an empty `upload_slots` row stays, and `planned` gives no new slot to a project that has one (`edge/http/studio.ts:201-206`; `slices/studio/plan.ts:200-215`).
- Finish task for a short whose long video is not public yet → skipped this round, tried again on the next check (`background.ts:171-173`).
- Comment task for a video not public yet (scheduled videos are private until their time) → skipped this round (`background.ts:180`).
- A/B mode `both` with titles but one thumbnail → "Title only"; with thumbnails but no other titles → "Thumbnail only" (`fill.ts:344-347`).
- A/B results button whose label does not mention results → no `abVariants`; only the numbers are sent (`studio-pages.ts:302-304`, `content.ts:397-406`).
- A popup item already on YouTube: the long video with a known id opens the A/B choices; a short is shown "✓ on YouTube" and does nothing (`packages/extension/src/popup.ts:102-123`).

## Unhappy paths

- `PUT /plan` with an invalid body → 400 via `onInvalid`; from another origin → 403 (`edge/http/studio.ts:243-245`).
- Slot taken or past → 409 "That slot is taken or past. Reload Prepare upload and choose one of the slots it lists." (`edge/http/studio.ts:298-307`). Drawer: "Couldn't change the slot: … Choose it again." (`packages/web/src/studio/prepare-upload.tsx:178-189`).
- Plan save failing → toast "The posting plan wasn't saved: …"; auto-comment switch failing → "Not saved: …" (`packages/web/src/studio/posting-plan.tsx:70`, `:75`).
- Two projects can hold slots with the same row name at different instants; a slot is free or taken by its exact `long_at` instant only (`slices/studio/plan.ts:225-233`).
- Captions: `/ext/files` serves a pack item's video, thumbnails and captions file (`edge/http/studio.ts:737-760`); the worker fetches the captions as base64 for the Details page (`background.ts`, `itemOf`), and a failed fetch leaves `captions` unset, so `finishDetails` skips the Subtitles upload.
- A Details step not found (related video field, end screen editor, Video element, picker card, Subtitles editor, Save) → that step's sentence says what to do by hand; the task is `failed` with all messages (`studio-pages.ts:135-232`). On YouTube shows "Details touches failed: <message>" (`packages/web/src/project/on-youtube.tsx:55-56`).
- Comment box not found (comments off), not opened, no submit button, comment not shown within 15 s, menu or Pin missing → `comment` `failed` with that sentence, some reading "Posted, but … pin it by hand." (`packages/extension/src/comment.ts:39-85`); On YouTube shows "Pinning the comment failed: …" (`on-youtube.tsx:59-60`).
- A task tab that never reports stays `waiting` and is opened again after 30 minutes on the next check; `comment.ts` first looks for the comment already posted and then only pins it, and skips pinning one that already shows the pinned badge (`background.ts:163-168`, `comment.ts:41-43`, `:69-71`).
- A failed task is not retried: `/ext/tasks` lists only `waiting` ones (`slices/studio/videos.ts:144-153`).
- Oembed unreachable → the video counts as not public; the task waits (`background.ts:134-143`).
- `/ext/tasks` or `/ext/known-videos` failing → treated as nothing waiting / no videos (`background.ts:157-160`, `:201-203`).
- A stats tab that never sends its last report (no video id in the path, a page that never loads) stops that day's sweep; the next sweep, 24 h after the last one started, begins a fresh list (`content.ts:344-345`, `background.ts:197-208`, `:394-397`).
- A/B Testing button, dialog, chip, picture slots or title boxes not found → the result names what to add by hand and copies the titles; nothing is pressed (`fill.ts:355-406`). Title boxes are found only when Studio shows at least one more box than there are other titles (`fill.ts:395-401`); Studio shows three rows (`packages/extension/src/selectors.ts:115-118`).
- A/B results page clipboard refused → "Couldn't copy the notes. Select them and copy by hand." (`ab-results.tsx:67`).

## State transitions

- `upload_slots` row: absent → assigned (first free slot on a pack read) ↔ another free slot (picker) ↔ empty (picker's Not scheduled; never reassigned) → absent (backfill of the long video); cascaded with the project (`slices/studio/plan.ts:200-251`; `packages/app/src/kernel/db/migrations/0047-studio-autopilot.sql:4-9`).
- `youtube_videos.finish_state` and `comment_state`: `none` → `waiting` (confirmation) → `done` | `failed` (task result). No transition leaves `done` or `failed`; a new video id for the same upload does not reset them (`slices/studio/videos.ts:69-87`, `:130-142`).
- `youtube_videos.ab_state`: stays `none`; only `recordVideo`'s reset writes it (`slices/studio/videos.ts:80`).
- `video_stats` and `ab_results`: absent → present → overwritten by each later reading (`slices/studio/stats.ts:42-59`, `:93-105`).
- `studio.autoComment`: `off` (absent) ↔ `on`. Turning it on does not queue comments for videos already confirmed; turning it off does not cancel comments already `waiting` (`edge/http/studio.ts:729-734`, `:629-644`).

## Invariants

- An A/B test starts only on the person's request, and only the person presses Set test: `openAbTest` is reached only from the `#slopify-ab` page, and `press` refuses "Set test" (`packages/extension/src/content.ts:587-589`, `packages/extension/src/fill.ts:583-586`, `packages/extension/src/selectors.ts:275`).
- The extension never presses Schedule or Publish anywhere. It does press Save on a confirmed video's Details page, the end screen editor's Save and the Subtitles editor's Done, through `pressToSave` (`packages/extension/src/fill.ts:588-593`, `packages/extension/src/studio-pages.ts:181`, `:227`, `:249`); the A/B flow presses no Save.
- Details touches and comments are queued only by Studio's confirmation of an upload (`edge/http/studio.ts:707-736`); a filled but unconfirmed upload gets neither.
- The pinned comment is posted only when `studio.autoComment` was `on` at confirmation, only for the long video, only once its video is public (`edge/http/studio.ts:729-734`, `packages/extension/src/background.ts:179-180`).
- One slot per project and per `long_at` instant in what `freeSlots` offers (`upload_slots.project_id` primary key; `slices/studio/plan.ts:219-234`).
- Slopify never asks YouTube's API: numbers and A/B results are what Studio's pages showed when the extension last looked (`slices/studio/stats.ts:4-6`). The only YouTube endpoint the worker fetches is the public oEmbed (`packages/extension/static/manifest.json:16`).
- A/B results never change a prompt; Copy as prompt notes only fills the clipboard (`packages/web/src/routes/ab-results.tsx:10-13`).

## Outcomes & side effects

- Tables: `upload_slots`, `video_stats`, `ab_results`, and `youtube_videos.finish_*`/`comment_*` (`packages/app/src/kernel/db/migrations/0047-studio-autopilot.sql:1-39`). All cascade with their project and travel in a full backup with it (`slices/storage/backup-format.ts:63-68`).
- Settings: `studio.postingPlan`, `studio.autoComment` ("on"/"off") and `studio.uploadPick.<projectId>` travel with a backup, each checked against its schema (`slices/storage/portable.ts:497-509`).
- Extension `storage.local`: `tasksOpened` (task → last open time), `statsSweep` (`{ at, left }`) (`packages/extension/src/background.ts:129`, `:191`). Tabs it opens in the background: Details pages, watch pages, Analytics pages; each closes itself only after its report.
- On YouTube (each upload's link, state words, numbers), the Projects list's views and CTR, and Library → A/B results show what is stored.

## Dimensions not in play

- D5 Money: none; no provider is called and YouTube's API is not used.
- D1 Authority: one local user; the extension acts with whatever YouTube account the browser is signed in to; Slopify does not check which channel that is.
- D13 Notification: none from Slopify; outcomes show as state words in On YouTube and toasts on Studio pages.
- D15 Audit: only the latest state and message per task and the latest reading per video are kept; no history of readings or attempts.
