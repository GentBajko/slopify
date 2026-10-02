---
scenario: studio-autopilot
screens:
- 01-projects
- 03-project
- 08-settings
- 13-schedules
- 23-studio-upload
- 24-ab-results
depends_on:
- 27-youtube-description
- 28-shorts
- 32-studio-upload-prep
- 38-home-attention-and-uploads
- 40-trash-and-scheduled-backups
generated_at_commit: 8e5bc8b8156d
generated_date: 2026-10-02
capstone_version: 7.0.1
content_hash: 6d5ea59a5cfe
paths_covered:
  - ":(top)packages/app/src/slices/studio/plan.ts"
  - ":(top)packages/app/src/slices/studio/plan-model.ts"
  - ":(top)packages/app/src/slices/studio/releases.ts"
  - ":(top)packages/app/src/slices/studio/calendar.ts"
  - ":(top)packages/app/src/slices/studio/backfill.ts"
  - ":(top)packages/app/src/slices/studio/stats.ts"
  - ":(top)packages/app/src/slices/studio/videos.ts"
  - ":(top)packages/app/src/slices/studio/pack.ts"
  - ":(top)packages/app/src/edge/http/studio.ts"
  - ":(top)packages/app/src/edge/http/projects.ts"
  - ":(top)packages/app/src/kernel/db/migrations/0045-youtube-videos.sql"
  - ":(top)packages/app/src/kernel/db/migrations/0047-studio-autopilot.sql"
  - ":(top)packages/app/src/kernel/db/migrations/0048-releases.sql"
  - ":(top)packages/extension/src/background.ts"
  - ":(top)packages/extension/src/content.ts"
  - ":(top)packages/extension/src/comment.ts"
  - ":(top)packages/extension/src/studio-pages.ts"
  - ":(top)packages/extension/src/fill.ts"
  - ":(top)packages/extension/src/popup.ts"
  - ":(top)packages/extension/static/manifest.json"
  - ":(top)packages/web/src/studio/posting-plan.tsx"
  - ":(top)packages/web/src/studio/prepare-upload.tsx"
  - ":(top)packages/web/src/studio/releases-view.tsx"
  - ":(top)packages/web/src/project/on-youtube.tsx"
  - ":(top)packages/web/src/routes/ab-results.tsx"
  - ":(top)packages/web/src/routes/projects.tsx"
---

What Slopify and the Slopify Studio extension do around an upload besides filling its dialog (32-studio-upload-prep.md): a weekly posting plan and the release calendar that date every video and short, Studio's copyright and ad-suitability checks read back, the Details-page touches after Studio confirms an upload, the opt-in pinned comment, A/B tests set up on request, and Studio's numbers read back once a day. Slopify decides and stores; the extension acts in Studio with the person's own signed-in session and reports back. Paths starting `slices/` or `edge/` are under `packages/app/src/`; routes are under `/api/studio`.

## Trigger & preconditions

| Behavior | Trigger | Preconditions |
|---|---|---|
| Edit the posting plan | Settings → YouTube Studio → Posting plan, Save posting plan → `PUT /plan`; the lead-hours input on blur → `PUT /settings/lead-hours` (`packages/web/src/studio/posting-plan.tsx:53-271`, `edge/http/studio.ts:280-299`) | Request from the Slopify page's own origin (`edge/http/studio.ts:179-188`) |
| A project gets its release times | `GET /packs/:projectId`, `GET /ext/ready`, `POST /ext/upload`, `POST /ext/upload-all`, `GET /releases`, and after `PUT /releases/:projectId` or `PUT /packs/:projectId/slot` (`edge/http/studio.ts:383`, `:654`, `:699`, `:709`, `:311-315`, `:348`, `:414`) | Its long video is not `done` on YouTube and its pack has a rendered video (`planned`, `edge/http/studio.ts:210-226`) |
| Change or clear a time | Prepare upload → Schedule step's slot picker → `PUT /packs/:projectId/slot` (`packages/web/src/studio/prepare-upload.tsx:341-377`, `edge/http/studio.ts:389-420`); Calendar → Releases: a time's Save or Not scheduled, or a free time's Put it here → `PUT /releases/:projectId` (`packages/web/src/studio/releases-view.tsx:97-104`, `:195-204`, `edge/http/studio.ts:327-351`) | Same origin (`GET /releases` too); a picker slot must be one of the nine offered; a calendar time is any ISO instant |
| Details touches | Studio confirmed an upload (`POST /ext/video/done`, `edge/http/studio.ts:824-850`) | The item has a related video, an end-screen video or captions |
| Pinned comment | Same confirmation | Long video with a pinned comment, and setting `studio.autoComment` is `on` at that moment |
| Run waiting tasks | Extension alarm `slopify-ab-tests` every 15 min (first after 1 min), and on browser start (`packages/extension/src/background.ts:437-447`) | Extension paired and the `tabs` API present (`background.ts:156-157`) |
| A/B test | On YouTube → A/B test menu, or the popup's "A/B test…" on an uploaded long video (`packages/web/src/project/on-youtube.tsx:159-189`, `packages/extension/src/popup.ts:143-198`) | The long video is `done` with a known id; the person is signed in to Studio |
| Studio's numbers | The same check, at most once per 24 h (`background.ts:210-233`) | At least one `done` video |
| Studio's checks | The same check, at most once per 2 h (`background.ts:192-206`) | `/ext/tasks` says `checks`, and a Studio page has shown the channel id |

## Steps

### Posting plan and release calendar (`slices/studio/plan-model.ts`, `plan.ts`, `releases.ts`, `calendar.ts`)

1. **Shape** (`plan-model.ts:7-25`): `{ timeZone (1–100 chars), rows (≤ 14) }`; a row (a "line") is `{ name (trimmed, 1–20; an inner id, never shown), series (trimmed, ≤ 100, default ""), long: slot, shorts: slot[] (≤ 10) }`; a slot is `{ day 0–6 (Sun–Sat), time "HH:MM" 00:00–23:59 }`. Stored as JSON in setting `studio.postingPlan` (`plan.ts:20`, `:44-46`).
2. **Default** (`plan.ts:23-26`, `:32-42`): absent or unparseable reads as no lines in the server's time zone (`Intl` resolved zone, else `UTC`, `:28-30`); with no lines no project gets a time.
3. **Series** (`seriesOf`, `plan-model.ts:32-47`): the text after the last "|" of the project's title pattern (else its title), with `{{…}}` placeholders removed and spaces collapsed; no "|" → "". A line whose series is "" takes any project; otherwise only a project of that exact series (`fits`, `releases.ts:92-93`). The pack carries it as `series` (`slices/studio/pack.ts:264`).
4. **Lead time** (`readLeadHours`/`writeLeadHours`, `releases.ts:33-44`; `plan-model.ts:27-30`): setting `studio.leadHours`, an integer 1–168, read as 24 when absent or out of range; written by `PUT /settings/lead-hours` `{ hours }` (`edge/http/studio.ts:286-299`). An item's upload-by time is its release minus the lead hours (`slices/studio/calendar.ts:93`, `edge/http/studio.ts:671-679`).
5. **Editor** (`packages/web/src/studio/posting-plan.tsx:53-271`): empty until made; one block per long video (day select + time input, a series select "Any series" plus every series in use, Remove), its shorts each with a day/time and an X, "+ Short" (copies the last short's time, else the long video's; disabled at 10); "Add a long video" (disabled at 14) names the row with the lowest unused number and copies the last line's series and long-video time, with no shorts (`:94-98`, `:199-221`); the zone select offers the plan's zone and America/New_York, America/Los_Angeles, Europe/London, UTC; Save is enabled only with unsaved changes; the lead-hours number input (1–168) saves on blur when changed (`:240-262`). `GET /plan`, `PUT /plan` and `PUT /settings/lead-hours` answer `{ plan, leadHours, series }`, `series` = every project's non-empty series, distinct and sorted (`edge/http/studio.ts:227-233`, `:279-299`).
6. **Releases** (`packages/app/src/kernel/db/migrations/0048-releases.sql:6-14`): one row per `(project_id, short)`, short 0 the long video; `release_at` ISO, `''` = not scheduled; `line` = the plan line the time came from (null when none was given); `by` = `plan` | `person`; `set_at`. The migration copies each `upload_slots` row to short 0 with `by = 'plan'` (an empty row name becomes a null line) and drops `upload_slots` (`:15-17`).
7. **Free long-video times** (`freeSlots`, `releases.ts:112-135`; `lineSlots`, `:95-110`): each line's long-video day and time as it comes round from now + lead hours to 8 weeks after that, in the plan's zone (`zonedTimes`, `plan.ts:126-141`), sorted by instant; kept when the line fits the project's series and no other project's release falls in the same hour (instant floored to the hour, `takenHours`, `releases.ts:83-90`). Wall-clock times become instants with `zonedInstant` (`plan.ts:88-95`): an ambiguous time takes the later reading, a skipped one the hour after.
8. **Planning** (`planReleases`, `releases.ts:137-182`): a project without a short-0 row takes the first free time for its series (its own releases not counted as taken), written `by = 'plan'`; none free → nothing is written. A short-0 row at `''` stops there. A line no longer in the plan, or one with no short times, gives the shorts nothing. Otherwise short 1…N in order: a short with a row keeps it (its time becomes the point the next one must follow); a short without one takes the earliest of the line's short days and times coming round within 5 weeks after the long video that is later than the previous short (or the long video) and in an hour no release of any project holds; the first short with no such time ends the pass. N is the pack's short count; `planned` calls it only while the long video is not `done` and the pack has a rendered video (`edge/http/studio.ts:210-226`).
9. **Setting one by hand** (`setRelease`, `releases.ts:184-197`): writes the given time (or `''`) with `by = 'person'`; for short 0 it also deletes every short row with `by = 'plan'`, so `planned` places those shorts again after the new time. `PUT /releases/:projectId` `{ short 0–99, at ISO | null, line? }` (`edge/http/studio.ts:325-351`): unknown project → 404; `null` → `''`; the time is not checked against free times or taken hours; then `planned`; answers `{ releases }`.
10. **Schedule in the pack** (`scheduleOf`, `releases.ts:199-211`): none when short 0 is missing or `''`; else `{ row: line or "", longAt, shortsAt }`, a short without a time is `null`. The long video's `scheduleAt` is `longAt`; a short's is its own time when it has one (`slices/studio/pack.ts:205`, `:255`) (32).
11. **Picker** (`PUT /packs/:projectId/slot`, `edge/http/studio.ts:388-420`): `{ slot: { row, longAt } | null }`; unknown project → 404; `null` → short 0 set to `''` by the person; a slot not among the nine free times for the project's series (its own long-video hour counts as taken, `slotChoices`, `:234-235`) → 409; otherwise short 0 set to that time and line by the person; then `planned`. The drawer lists "Not scheduled (set it in Studio yourself)", the current time and the free ones, each as "<weekday day month, HH:MM>" in the browser's zone, without the line (`packages/web/src/studio/prepare-upload.tsx:89-98`, `:341-377`).
12. **Calendar → Releases** (`GET /releases?weeks=1–8`, default 2, `edge/http/studio.ts:300-324`; `releaseCalendar`, `slices/studio/calendar.ts:59-152`): first runs `planned` for every finished project not marked uploaded (`finishedProjects`, `edge/http/studio.ts:236-247`) and every project holding a release time (`edge/http/studio.ts:311-315`); then returns `{ leadHours, timeZone, from, until, entries, candidates }`. Entries: each project's long-video release from 24 h ago to `weeks` ahead with every pack item's release, upload-by, state, checks and video id (`calendar.ts:73-116`); state is `scheduled` (upload `done`), `filled`, `not-ready` (no render), `late` (now past upload-by) or `ready` (`:95-104`). Free times: each line's long-video time from now to `until` whose hour no release holds, with the line's series and no project; these are not limited by the lead time or a series (`:118-130`). Candidates: finished projects without a long-video time, including those set to not scheduled, whose upload pack builds and whose first item (the long video) has its video made; a project without a rendered video is not offered (`:132-150`).
13. **Typing it into Studio** is the upload dialog's Visibility step (32, `packages/extension/src/studio-pages.ts:58-105`); Studio shows and takes the time in the browser's zone (`studio-pages.ts:41-55`).

### Studio's checks (copyright and ad suitability)

1. **Read** on Studio's Content list (`backfill`, `packages/extension/src/content.ts:549-583`): each row's Restrictions cell becomes `checks`: "None" → `ok`, other text cut to 100 characters, an empty cell sends none (`checksOf`, `:555-561`). Rows are sent again whenever an id or a checks value changes. Any Studio page whose path names `/channel/UC…` stores that channel id as `studioChannel` in `storage.local` (`:563-564`).
2. **Stored** by `POST /ext/backfill` (`edge/http/studio.ts:639-647`; body `:147-158`): each row with `checks` updates `youtube_videos.checks` for that video id; a video id Slopify has no row for changes nothing (`setChecks`, `slices/studio/videos.ts:182-185`; column `packages/app/src/kernel/db/migrations/0048-releases.sql:18-20`). The body's `close` flag is accepted and not read by the server.
3. **Asked for** by `GET /ext/tasks` (`edge/http/studio.ts:743-756`): `checks: true` while any `done` video whose checks are not `ok` has a release (same short) later than now.
4. **Opened** by `checkTasks` (`packages/extension/src/background.ts:192-206`): with `checks: true`, a stored `studioChannel`, and the last such tab more than 2 h ago (`checksEveryMs`, `:133`; time kept as `tasksOpened.checks`), a background tab at `https://studio.youtube.com/channel/<id>/videos/upload#slopify-checks`. That page sends its rows with `close: true` and the worker closes the tab on that message (`content.ts:578-582`, `background.ts:422`).
5. **Shown** in Calendar → Releases as each scheduled item's badge (13-schedules; `packages/web/src/studio/releases-view.tsx:36-56`).

### Details touches after a confirmed upload (the `finish` task)

1. **Queued** by `/ext/video/done` when the confirmed item has `relatedVideoId`, `endScreenVideoId` or `captions`: `finish_state = 'waiting'` (`edge/http/studio.ts:832-842`; columns in `packages/app/src/kernel/db/migrations/0047-studio-autopilot.sql:10-13`). A short has `relatedVideoId` only if its long video was already `done` when its pack was read (`slices/studio/pack.ts:256`); the long video has `captions` whenever a `subtitles_srt` output exists (`:180`).
2. **Picked up** (`checkTasks`, `packages/extension/src/background.ts:156-208`): `GET /ext/tasks` (`edge/http/studio.ts:732-758`) lists `finish` and `comments` tasks oldest first, each with its pack item; a task whose project or item is gone is left out. A finish task with a related video waits until that video is public by YouTube's oEmbed answer (`background.ts:135-144`, `:177-179`). Each task opens a background tab at `https://studio.youtube.com/video/<id>/edit#slopify-finish&p=<project>&s=<short>`; the same task is not opened again for 30 minutes (`tasksOpened` in `storage.local`, `:129-131`, `:167-175`).
3. **Done on the Details page** (`runFinish`, `packages/extension/src/content.ts:364-383`; `finishDetails`, `packages/extension/src/studio-pages.ts:234-256`): the item comes from `GET /ext/packs/:projectId` with its thumbnails' and captions' bytes (`background.ts:247-264`). In order: Related video set to the long video through Studio's video picker (`studio-pages.ts:135-152`, picker `:109-133`); end screen gets a Video element pointing to `endScreenVideoId`, then the end screen editor's Save (`:154-189`); for the long video only, captions uploaded "With timing" and the Subtitles editor's Done (`:191-232`, `content.ts:381`); then the Details page's Save when Studio enabled it (`studio-pages.ts:243-251`). These Saves go through `pressToSave`, which skips the forbidden-button refusal (`packages/extension/src/fill.ts:588-593`).
4. **Reported** (`POST /ext/task-result`, `edge/http/studio.ts:759-765`): `finish_state` = `done` when every step succeeded, else `failed`, with the steps' messages joined; the worker closes the tab on that report (`background.ts:414-427`).

### Pinned comment (opt-in, the `comment` task)

1. **Setting**: `studio.autoComment` = `on`/`off` via the Posting plan's switch "Post and pin each video's comment once it is public (the extension posts it in your name)" → `PUT /settings/auto-comment` (`packages/web/src/studio/posting-plan.tsx:263-268`, `edge/http/studio.ts:267-277`); `GET /settings` reads it as `on` only when the row says `on` (`:256-266`).
2. **Queued** by `/ext/video/done` for the long video only, when its item has `pinnedComment` and the setting is `on`: `comment_state = 'waiting'` (`edge/http/studio.ts:843-848`).
3. **Picked up** by `checkTasks` once the video is public by oEmbed: a background tab at `https://www.youtube.com/watch?v=<id>#slopify-comment&p=<project>&s=<short>` (`background.ts:185-191`).
4. **Posted** (`packages/extension/src/comment.ts:25-126`): scrolls up to ten times to load comments, opens the comment box, inserts the text, presses the comment's submit button, waits up to 15 s for a thread containing the text's first 40 characters, opens that comment's menu, presses Pin and the confirmation's Pin, then reports `comment` done or failed with a sentence.

### A/B test on request

1. **Asked for** from On YouTube (long video, `done`) or the popup's "A/B test…" with the choices Titles and thumbnails / Titles / Thumbnails; both open `https://studio.youtube.com/video/<id>/edit#slopify-ab=<both|titles|thumbnails>&p=<project>&s=0` in a new tab (`packages/web/src/project/on-youtube.tsx:19-26`, `packages/extension/src/popup.ts:164-198`).
2. **Set up** (`runAb`, `packages/extension/src/content.ts:349-362`): the item comes through the worker; the page waits up to 30 s for the Details editor (`:344-347`); `openAbTest` (`packages/extension/src/fill.ts:439-458`) takes the item's other titles (all titles but the one the upload used) unless the mode is Thumbnails, and every thumbnail (the upload's first) unless the mode is Titles. With no other titles and fewer than two thumbnails it stops with "This video has no other titles to test…" or "This video has only one thumbnail, and A/B Testing needs two or three…" (`:449-457`).
3. **Filling the dialog** (`fillAbTest`, `fill.ts:334-430`): Studio's mode follows what is tested: titles and two or more thumbnails → "Title and thumbnail", titles alone → "Title only", thumbnails alone → "Thumbnail only" (`:344-347`); it presses A/B Testing (`:368`), the mode's chip (`:384`), puts the thumbnails into rows 1–3, writes the video's title into title box 1 when Studio left it empty and the other titles into boxes 2 and 3 (`:387-417`). The dialog is left open; the toast says to check it, press Set test, then Save on the video (`fill.ts:426-430`, `content.ts:357-361`).
4. **Nothing is recorded** when a test is set up: the person presses Set test and Save in Studio. The daily stats sweep reads every long video's A/B result page (step 3 of `#slopify-stats`), so a finished test is found without Slopify knowing it was started (`packages/extension/src/content.ts`, `runAbRead`). The `ab_state` column from migration 0045 is no longer written beyond its reset to `none` (`slices/studio/videos.ts:84`). The alarm keeps the name `slopify-ab-tests` (`background.ts`).

### Studio's numbers and A/B results

1. **Sweep** (`sweepStats`, `packages/extension/src/background.ts:210-233`): when the last sweep is older than 24 h, `GET /ext/known-videos` (every `done` video, newest first, `slices/studio/videos.ts:159-165`) becomes the day's list in `storage.local`; `nextStats` opens one background tab at a time at the video's Analytics Reach tab with `#slopify-stats=1&p=…&s=…` (`background.ts:235-245`). An empty answer (Slopify unreachable or no `done` video yet) stores nothing, so the next 15-minute check asks again instead of waiting a day (`background.ts:225-227`). The popup's "Read Studio numbers now" sends `stats-now`, which runs the sweep with `force` (whatever the 24 h) and answers the number of videos it will read (`background.ts:390-392`, `packages/extension/src/popup.ts:13-27`).
2. **Reading** (`runStats`, `packages/extension/src/content.ts:385-425`): step 1 reads the Reach tab's key metrics by Studio's own ids (`readMetrics`, `packages/extension/src/studio-pages.ts:273-284`; values like "493", "2.2%", "1.2K", "32:19" parsed by `metricValue`, `:260-271`), keeps them in `sessionStorage` and moves the tab to the Engagement tab (step 2); a short reports from there; a long video moves once more to its Details page (step 3, `runAbRead`, `content.ts:427-450`), where `readAbResult` presses A/B Testing's button only when its label speaks of results and reads two or three rows each with a percentage, then presses Escape (`studio-pages.ts:295-336`).
3. **Report** (`POST /ext/stats`, `edge/http/studio.ts:778-803`; body `:136-146`): the worker maps `VIDEO_THUMBNAIL_IMPRESSIONS` → impressions, `VIDEO_THUMBNAIL_IMPRESSIONS_VTR` → ctr (percent, 0–100), `EXTERNAL_VIEWS` → views, `AVERAGE_WATCH_TIME` → averageViewSeconds, `EXTERNAL_WATCH_TIME` → watchHours (`background.ts:360-384`). `saveStats` upserts one `video_stats` row per `(project, short)` with `read_at` = now; a metric not read is stored null (`slices/studio/stats.ts:42-59`). Two or three A/B variants (`title`, `thumbnail` 1–3, `share` percent, `winner`) upsert one `ab_results` row (`stats.ts:21-29`, `:93-105`). The worker closes the tab and opens the next on that report (`background.ts:423-426`).
4. **Shown**: On YouTube's row "N views · X% CTR of M impressions · m:ss average view · read <date>" (`packages/web/src/project/on-youtube.tsx:198-225`; `GET /stats/:projectId`, `edge/http/studio.ts:490-492`); the Projects list row adds the long video's "N views · X% CTR" (`edge/http/projects.ts:81`, `:93-98`; `packages/web/src/routes/projects.tsx:350-355`); Library → A/B results (`/ab-results`, `packages/web/src/routes/ab-results.tsx:41-111`; `GET /ab-results`, `edge/http/studio.ts:493`, newest read first, joined to the project's title, rows whose variants do not parse left out, `slices/studio/stats.ts:107-131`). The page orders variants by share and labels the first "winner"; Copy as prompt notes puts a summary on the clipboard to paste into a Library prompt by hand (`ab-results.tsx:24-39`, `:56-73`, `:84-101`).

## Branches

- Long video already `done` (uploaded, pasted or backfilled) → `planned` places nothing more, shorts included (`edge/http/studio.ts:213`). Backfill leaves release rows as they are (`slices/studio/backfill.ts:17-37`).
- "Not scheduled" (picker or calendar) sticks: the short-0 row at `''` stays, and `planReleases` neither gives a new long-video time nor places shorts (`slices/studio/releases.ts:146-155`). The project is a calendar candidate again (`slices/studio/calendar.ts:132-150`).
- No line takes the project's series (or the plan has no lines) → no free time, nothing written; the picker offers only Not scheduled and the project's current time, if any (`slices/studio/releases.ts:125-132`, `:149-150`).
- The long video's line removed from the plan, or a line without shorts → its shorts get no plan times; times already written stay (`slices/studio/releases.ts:156-157`).
- Moving a long video by hand → plan-placed short times are deleted and placed again after it; short times the person set stay (`slices/studio/releases.ts:195-196`).
- Lead time at or past an item's release → the calendar shows it `late` until it is on YouTube or filled (`slices/studio/calendar.ts:95-104`).
- Finish task for a short whose long video is not public yet → skipped this round, tried again on the next check (`background.ts:177-179`).
- Comment task for a video not public yet (scheduled videos are private until their time) → skipped this round (`background.ts:186`).
- A/B mode `both` with titles but one thumbnail → "Title only"; with thumbnails but no other titles → "Thumbnail only" (`fill.ts:344-347`).
- A/B results button whose label does not mention results → no `abVariants`; only the numbers are sent (`studio-pages.ts:302-304`, `content.ts:440-449`).
- A popup item already on YouTube: the long video with a known id opens the A/B choices; a short is shown "✓ on YouTube" and does nothing (`packages/extension/src/popup.ts:133-156`).

## Unhappy paths

- `PUT /plan` with an invalid body → 400 via `onInvalid`; from another origin → 403 (`edge/http/studio.ts:280-282`).
- Slot taken or past → 409 "That slot is taken or past. Reload Prepare upload and choose one of the slots it lists." (`edge/http/studio.ts:402-411`). Drawer: "Couldn't change the slot: … Choose it again." (`packages/web/src/studio/prepare-upload.tsx:178-189`).
- Plan save failing → toast "The posting plan wasn't saved: …"; lead time failing → "The lead time wasn't saved: …"; auto-comment switch failing → "Not saved: …" (`packages/web/src/studio/posting-plan.tsx:71`, `:83`, `:88`). A lead-hours value outside 1–168 or not whole is not sent (`:250-259`); the route refuses it with 400 (`edge/http/studio.ts:286-292`).
- `PUT /releases/:projectId` for an unknown project → 404; a body that is not `{ short 0–99, at ISO | null, line? }` → 400; `GET /releases` or the PUT from another origin → 403 (`edge/http/studio.ts:302-351`). Calendar toasts "The time wasn't changed: …" and "The project wasn't put there: …" (`packages/web/src/studio/releases-view.tsx:103`, `:203`).
- A time set by hand is not checked: two releases can share an hour, a past time is accepted, and a short can be set before its long video (`slices/studio/releases.ts:186-197`); plan placement then treats those hours as taken (`:83-90`).
- The checks tab: no `studioChannel` stored yet (no Studio page with the channel id opened) → no tab is opened; a Restrictions cell Studio renders differently or empty → no `checks` sent, so the video stays unread and the tab is opened again every 2 h while its release is ahead (`packages/extension/src/background.ts:194-199`, `content.ts:555-561`).
- Captions: `/ext/files` serves a pack item's video, thumbnails and captions file (`edge/http/studio.ts:851-874`); the worker fetches the captions as base64 for the Details page (`background.ts`, `itemOf`), and a failed fetch leaves `captions` unset, so `finishDetails` skips the Subtitles upload.
- A Details step not found (related video field, end screen editor, Video element, picker card, Subtitles editor, Save) → that step's sentence says what to do by hand; the task is `failed` with all messages (`studio-pages.ts:135-232`). On YouTube shows "Details touches failed: <message>" (`packages/web/src/project/on-youtube.tsx:55-56`).
- Comment box not found (comments off), not opened, no submit button, comment not shown within 15 s, menu or Pin missing → `comment` `failed` with that sentence, some reading "Posted, but … pin it by hand." (`packages/extension/src/comment.ts:39-85`); On YouTube shows "Pinning the comment failed: …" (`on-youtube.tsx:59-60`).
- A task tab that never reports stays `waiting` and is opened again after 30 minutes on the next check; `comment.ts` first looks for the comment already posted and then only pins it, and skips pinning one that already shows the pinned badge (`background.ts:169-174`, `comment.ts:41-43`, `:69-71`).
- A failed task is not retried: `/ext/tasks` lists only `waiting` ones (`slices/studio/videos.ts:148-157`).
- Oembed unreachable → the video counts as not public; the task waits (`background.ts:135-144`).
- `/ext/tasks` or `/ext/known-videos` failing → treated as nothing waiting, no checks / no videos; a sweep with no videos is not recorded and runs again at the next check (`background.ts:158-166`, `:222-227`).
- A stats tab that never sends its last report (no video id in the path, a page that never loads) stops that day's sweep; the next sweep, 24 h after the last one started, begins a fresh list (`content.ts:387-388`, `background.ts:218-233`, `:423-426`).
- A/B Testing button, dialog, chip, picture slots or title boxes not found → the result names what to add by hand and copies the titles; nothing is pressed (`fill.ts:355-406`). Title boxes are found only when Studio shows at least one more box than there are other titles (`fill.ts:395-401`); Studio shows three rows (`packages/extension/src/selectors.ts:115-118`).
- A/B results page clipboard refused → "Couldn't copy the notes. Select them and copy by hand." (`ab-results.tsx:67`).

## State transitions

- `releases` row per `(project, short)`: absent → `by = 'plan'` (placed by `planned`) → `by = 'person'` (picker or calendar: a time or `''`); a person-set long video deletes its plan-placed short rows, which `planned` writes again; person-set rows change only by another hand edit. No code deletes a short-0 row; rows cascade with the project (`slices/studio/releases.ts:137-197`; `packages/app/src/kernel/db/migrations/0048-releases.sql:6-14`).
- `youtube_videos.checks`: null → the Restrictions text or `ok`, overwritten by each later reading of that row (`slices/studio/videos.ts:182-185`).
- Calendar item state is derived on each read, never stored: `not-ready` → `ready` → `late` as time passes; `filled` and `scheduled` follow `upload_state` (`slices/studio/calendar.ts:95-104`).
- `youtube_videos.finish_state` and `comment_state`: `none` → `waiting` (confirmation) → `done` | `failed` (task result). No transition leaves `done` or `failed`; a new video id for the same upload does not reset them (`slices/studio/videos.ts:73-91`, `:134-146`).
- `youtube_videos.ab_state`: stays `none`; only `recordVideo`'s reset writes it (`slices/studio/videos.ts:84`).
- `video_stats` and `ab_results`: absent → present → overwritten by each later reading (`slices/studio/stats.ts:42-59`, `:93-105`).
- `studio.autoComment`: `off` (absent) ↔ `on`. Turning it on does not queue comments for videos already confirmed; turning it off does not cancel comments already `waiting` (`edge/http/studio.ts:843-848`, `:732-758`).

- A Studio page the extension opens for a task (`#slopify-stats`, `#slopify-ab`, `#slopify-finish`, `#slopify-checks`) keeps the task out of the address: `packages/extension/src/early.ts` runs at document_start, moves the hash into the tab's sessionStorage (`slopify.task`) and removes it before Studio's router can rewrite it into a path; `content.ts` `hashParams` reads it from there (extension 1.1.2).

## Invariants

- An A/B test starts only on the person's request, and only the person presses Set test: `openAbTest` is reached only from the `#slopify-ab` page, and `press` refuses "Set test" (`packages/extension/src/content.ts:648-650`, `packages/extension/src/fill.ts:583-586`, `packages/extension/src/selectors.ts:275`).
- The extension never presses Schedule or Publish anywhere. It does press Save on a confirmed video's Details page, the end screen editor's Save and the Subtitles editor's Done, through `pressToSave` (`packages/extension/src/fill.ts:588-593`, `packages/extension/src/studio-pages.ts:181`, `:227`, `:249`); the A/B flow presses no Save.
- Details touches and comments are queued only by Studio's confirmation of an upload (`edge/http/studio.ts:821-850`); a filled but unconfirmed upload gets neither.
- The pinned comment is posted only when `studio.autoComment` was `on` at confirmation, only for the long video, only once its video is public (`edge/http/studio.ts:843-848`, `packages/extension/src/background.ts:185-186`).
- One release per project and short (`PRIMARY KEY (project_id, short)`, `packages/app/src/kernel/db/migrations/0048-releases.sql:13`). The plan never places two releases in the same hour or a long video less than the lead time ahead (`slices/studio/releases.ts:122-131`, `:158-176`); hand-set times are exempt.
- Slopify never asks YouTube's API: numbers and A/B results are what Studio's pages showed when the extension last looked (`slices/studio/stats.ts:4-6`). The only YouTube endpoint the worker fetches is the public oEmbed (`packages/extension/static/manifest.json:16`).
- A/B results never change a prompt; Copy as prompt notes only fills the clipboard (`packages/web/src/routes/ab-results.tsx:10-13`).

## Outcomes & side effects

- Tables: `releases` and `youtube_videos.checks` (`packages/app/src/kernel/db/migrations/0048-releases.sql:6-20`, replacing 0047's `upload_slots`), `video_stats`, `ab_results`, and `youtube_videos.finish_*`/`comment_*` (`packages/app/src/kernel/db/migrations/0047-studio-autopilot.sql:10-39`). All cascade with their project and travel in a full backup with it (`slices/storage/backup-format.ts:63-68`).
- Settings: `studio.postingPlan`, `studio.autoComment` ("on"/"off"), `studio.leadHours` and `studio.uploadPick.<projectId>` travel with a backup, each checked against its schema (`slices/storage/portable.ts:499-512`). `studio.leadHours` is not a known setting there, so a full backup leaves it behind (`:524`, `:530-545`).
- Extension `storage.local`: `tasksOpened` (task → last open time, plus `checks`), `statsSweep` (`{ at, left }`), `studioChannel` (`packages/extension/src/background.ts:129`, `:200-201`, `:212`; `packages/extension/src/content.ts:564`). Tabs it opens in the background: Details pages, watch pages, Analytics pages, the Content list for the checks; each closes only after its report.
- On YouTube (each upload's link, state words, numbers), the Projects list's views and CTR, and Library → A/B results show what is stored.

## Dimensions not in play

- D5 Money: none; no provider is called and YouTube's API is not used.
- D1 Authority: one local user; the extension acts with whatever YouTube account the browser is signed in to; Slopify does not check which channel that is.
- D13 Notification: none from Slopify; outcomes show as state words in On YouTube and toasts on Studio pages.
- D15 Audit: only the latest state and message per task and the latest reading per video are kept; no history of readings or attempts.
