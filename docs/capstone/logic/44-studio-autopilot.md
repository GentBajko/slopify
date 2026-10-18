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
| Edit the posting plan | Settings → YouTube Studio → Release times: the lead-hours input on blur → `PUT /settings/lead-hours`; Remove the old plan (shown only while a stored plan still has lines) → `PUT /plan` with no lines. Each schedule sets its own release times (Calendar → Schedules → Edit) (`packages/web/src/studio/posting-plan.tsx:35-58`, `:105-142`, `edge/http/studio.ts:302-322`) | Request from the Slopify page itself: the server's own origin, the same host:port the browser addressed through any proxy, or the exact remote https address (`fromSlopifyPage`, `edge/http/studio.ts:188-195`, `edge/http/same-page.ts:64-74`; 53-remote-access-and-request-guard.md) |
| A project gets its release times | `GET /packs/:projectId`, `GET /ext/ready`, `POST /ext/upload`, `POST /ext/upload-all`, `GET /releases`, and after `PUT /releases/:projectId` or `PUT /packs/:projectId/slot` (`edge/http/studio.ts:383`, `:654`, `:699`, `:709`, `:311-315`, `:348`, `:414`) | Its long video is not `done` on YouTube and its pack has a rendered video (`planned`, `edge/http/studio.ts:231-247`) |
| Change or clear a time | Prepare upload → Schedule step's slot picker → `PUT /packs/:projectId/slot` (`packages/web/src/studio/prepare-upload.tsx:341-377`, `edge/http/studio.ts:389-420`); Calendar → Releases: a time's Save or Not scheduled, or a free time's Put it here → `PUT /releases/:projectId` (`packages/web/src/studio/releases-view.tsx:97-104`, `:195-204`, `edge/http/studio.ts:327-351`) | Same origin (`GET /releases` too); a picker slot must be one of the nine offered; a calendar time is any ISO instant |
| Details touches | Studio confirmed an upload (`POST /ext/video/done`, `edge/http/studio.ts:824-850`) | The item has a related video, an end-screen video or captions |
| Pinned comment | Same confirmation | Long video with a pinned comment, and setting `studio.autoComment` is `on` at that moment |
| Run waiting tasks | Extension alarm `slopify-ab-tests` every 15 min (first after 1 min), and on browser start (`packages/extension/src/background.ts:490-516`) | Extension paired and the `tabs` API present (`background.ts:173`) |
| A/B test | On YouTube → A/B test menu, or the popup's "A/B test…" on an uploaded long video (`packages/web/src/project/on-youtube.tsx:159-189`, `packages/extension/src/popup.ts:143-198`) | The long video is `done` with a known id; the person is signed in to Studio |
| Studio's numbers | The same check, at most once per 24 h (`background.ts:210-233`) | At least one `done` video |
| Studio's checks | The same check, at most once per 2 h (`background.ts:192-206`) | `/ext/tasks` says `checks`, and a Studio page has shown the channel id |

## Steps

### Posting plan and release calendar (`slices/studio/plan-model.ts`, `plan.ts`, `releases.ts`, `calendar.ts`)

1. **Shape** (`plan-model.ts:7-31`): `{ timeZone (1–100 chars), rows (≤ 14) }`; a row (a "line") is `{ name (trimmed, 1–20; an inner id, never shown), series (trimmed, ≤ 100, default ""), long: slot, shorts: slot[] (≤ 10) }`; a slot is `{ day 0–6 (Sun–Sat), time "HH:MM" 00:00–23:59 }`. Stored as JSON in setting `studio.postingPlan` (`plan.ts:22`, `:74-81`); only rows without a `schedule` are stored, and `readPlan` (`plan.ts:55-72`) adds one line per day of each live schedule's release times (`schedule`, `runDay`, `timeZone`, `label`) before them.
2. **Default** (`plan.ts:23-26`, `:32-42`): absent or unparseable reads as no lines in the server's time zone (`Intl` resolved zone, else `UTC`, `:28-30`); with no lines no project gets a time.
3. **Series** (`seriesOf`, `plan-model.ts:43-55`): the text after the last "|" of the project's title pattern (else its title), with `{{…}}` placeholders removed and spaces collapsed; no "|" → "". A line whose series is "" takes any project; otherwise only a project of that exact series (`fits`, `releases.ts:105-108`). The pack carries it as `series` (`slices/studio/pack.ts:271`).
4. **Lead time** (`readLeadHours`/`writeLeadHours`, `releases.ts:36-45`; `plan-model.ts:35-38`): setting `studio.leadHours`, an integer 1–168, read as 24 when absent or out of range; written by `PUT /settings/lead-hours` `{ hours }` (`edge/http/studio.ts:309-322`). An item's upload-by time is its release minus the lead hours (`slices/studio/calendar.ts:109`, `edge/http/studio.ts:744-746`).
5. **Editor** (`packages/web/src/studio/posting-plan.tsx:25-154`): the line editor is gone from Settings. Each schedule sets its own release times (Calendar → Schedules → Edit → Release times) and Calendar → Releases shows and moves them. Settings → YouTube Studio → Release times keeps only what holds for every release: the lead-hours number input (1–168, saves on blur when changed, `:126-142`), the pinned-comment switch (`:146-151`) and, while a stored plan still has lines, the callout "An older posting plan still applies" with Remove the old plan, which saves the plan with no lines (`:35-47`, `:105-122`). `GET /plan`, `PUT /plan` and `PUT /settings/lead-hours` answer `{ plan, leadHours, series }`, `series` = every project's non-empty series, distinct and sorted (`edge/http/studio.ts:249-256`, `:302-322`).
6. **Releases** (`packages/app/src/kernel/db/migrations/0048-releases.sql:6-14`): one row per `(project_id, short)`, short 0 the long video; `release_at` ISO, `''` = not scheduled; `line` = the plan line the time came from (null when none was given); `by` = `plan` | `person`; `set_at`. The migration copies each `upload_slots` row to short 0 with `by = 'plan'` (an empty row name becomes a null line) and drops `upload_slots` (`:15-17`).
7. **Free long-video times** (`freeSlots`, `releases.ts:164-185`; `lineSlots`, `:113-127`): each line's long-video day and time as it comes round from now + lead hours to 8 weeks after that, in the plan's zone (`zonedTimes`, `plan.ts:167-181`), sorted by instant; kept when the line fits the project's series and no other project's release falls in the same hour (instant floored to the hour, `takenHours`, `releases.ts:85-91`). Wall-clock times become instants with `zonedInstant` (`plan.ts:125-130`): an ambiguous time takes the later reading, a skipped one the hour after.
8. **Planning** (`planReleases`, `releases.ts:190-256`): a project without a short-0 row takes the first free time for its series (its own releases not counted as taken), written `by = 'plan'`; none free → nothing is written. A short-0 row at `''` stops there. A line no longer in the plan, or one with no short times, gives the shorts nothing. Otherwise short 1…N in order: a short with a row keeps it (its time becomes the point the next one must follow); a short without one takes the earliest of the line's short days and times coming round within 5 weeks after the long video that is later than the previous short (or the long video) and in an hour no release of any project holds; the first short with no such time ends the pass. N is the pack's short count; `planned` calls it only while the long video is not `done` and the pack has a rendered video (`edge/http/studio.ts:231-247`).
9. **Setting one by hand** (`setRelease`, `releases.ts:260-271`): writes the given time (or `''`) with `by = 'person'`; for short 0 it also deletes every short row with `by = 'plan'`, so `planned` places those shorts again after the new time. `PUT /releases/:projectId` `{ short 0–99, at ISO | null, line? }` (`edge/http/studio.ts:325-351`): unknown project → 404; `null` → `''`; the time is not checked against free times or taken hours; then `planned`; answers `{ releases }`.
10. **Schedule in the pack** (`scheduleOf`, `releases.ts:286-299`): none when short 0 is missing or `''`; else `{ row: line or "", longAt, shortsAt }`, a short without a time is `null`. The long video's `scheduleAt` is `longAt`; a short's is its own time when it has one (`slices/studio/pack.ts:212`, `:262`) (32).
11. **Picker** (`PUT /packs/:projectId/slot`, `edge/http/studio.ts:388-420`): `{ slot: { row, longAt } | null }`; unknown project → 404; `null` → short 0 set to `''` by the person; a slot not among the nine free times for the project's series (its own long-video hour counts as taken, `slotChoices`, `:234-235`) → 409; otherwise short 0 set to that time and line by the person; then `planned`. The drawer lists "Not scheduled (set it in Studio yourself)", the current time and the free ones, each as "<weekday day month, HH:MM>" in the browser's zone, without the line (`packages/web/src/studio/prepare-upload.tsx:89-98`, `:341-377`).
12. **Calendar → Releases** (`GET /releases?weeks=1–8`, default 2, `edge/http/studio.ts:324-347`; `releaseCalendar`, `slices/studio/calendar.ts:71-170`): first runs `planned` for every finished project not marked uploaded (`finishedProjects`, `edge/http/studio.ts:259-269`) and every project holding a release time (`edge/http/studio.ts:332-338`); then returns `{ leadHours, timeZone, from, until, entries, candidates }`. Entries: each project's long-video release from 24 h ago to `weeks` ahead with every pack item's release, upload-by, state, checks and video id (`calendar.ts:94-132`); state is `scheduled` (upload `done`), `filled`, `not-ready` (no render), `late` (now past upload-by) or `ready` (`:111-120`). Free times: each line's long-video time from now to `until` whose hour no release holds, with the line's series and no project; these are not limited by the lead time or a series (`:134-148`). Candidates: finished projects without a long-video time, including those set to not scheduled, whose upload pack builds and whose first item (the long video) has its video made; a project without a rendered video is not offered (`:160-168`).
13. **Typing it into Studio** is the upload dialog's Visibility step (32, `packages/extension/src/studio-pages.ts:58-105`); Studio shows and takes the time in the browser's zone (`studio-pages.ts:41-55`).

### Studio's checks (copyright and ad suitability)

1. **Read** on Studio's Content list (`backfill`, `packages/extension/src/content.ts:549-583`): each row's Restrictions cell becomes `checks`: "None" → `ok`, other text cut to 100 characters, an empty cell sends none (`checksOf`, `:555-561`). Rows are sent again whenever an id or a checks value changes. Any Studio page whose path names `/channel/UC…` stores that channel id as `studioChannel` in `storage.local` (`:563-564`).
2. **Stored** by `POST /ext/backfill` (`edge/http/studio.ts:707-715`; body `:156-167`): each row with `checks` updates `youtube_videos.checks` for that video id; a video id Slopify has no row for changes nothing (`setChecks`, `slices/studio/videos.ts:195-200`; column `packages/app/src/kernel/db/migrations/0048-releases.sql:17-19`). The body's `close` flag is accepted and not read by the server.
3. **Asked for** by `GET /ext/tasks` (`edge/http/studio.ts:814-821`): `checks: true` while any `done` video whose checks are not `ok` has a release (same short) later than now.
4. **Opened** by `checkTasks` (`packages/extension/src/background.ts:192-206`): with `checks: true`, a stored `studioChannel`, and the last such tab more than 2 h ago (`checksEveryMs`, `:133`; time kept as `tasksOpened.checks`), a background tab at `https://studio.youtube.com/channel/<id>/videos/upload#slopify-checks`. That page sends its rows with `close: true` and the worker closes the tab on that message (`content.ts:578-582`, `background.ts:422`).
5. **Shown** in Calendar → Releases as each scheduled item's badge (13-schedules; `packages/web/src/studio/releases-view.tsx:36-56`).

### Details touches after a confirmed upload (the `finish` task)

1. **Queued** by `/ext/video/done` when the confirmed item has `relatedVideoId`, `endScreenVideoId` or `captions`: `finish_state = 'waiting'` (`edge/http/studio.ts:832-842`; columns in `packages/app/src/kernel/db/migrations/0047-studio-autopilot.sql:10-13`). A short has `relatedVideoId` only if its long video was already `done` when its pack was read (`slices/studio/pack.ts:256`); the long video has `captions` whenever a `subtitles_srt` output exists (`:180`).
2. **Picked up** (`checkTasks`, `packages/extension/src/background.ts:172-225`): `GET /ext/tasks` (`edge/http/studio.ts:801-826`) lists `finish` and `comments` tasks oldest first, each with its pack item; a task whose project or item is gone is left out. A finish task with a related video waits until that video is public by YouTube's oEmbed answer (`background.ts:151-160`, `:194`, `:202`). Each task opens a background tab at `https://studio.youtube.com/video/<id>/edit#slopify-finish&p=<project>&s=<short>`; the same task is not opened again for 30 minutes (`tasksOpened` in `storage.local`, `:130-132`, `:185-191`).
3. **Done on the Details page** (`runFinish`, `packages/extension/src/content.ts:402-422`; `finishDetails`, `packages/extension/src/studio-pages.ts:470-490`): the item comes from `GET /ext/packs/:projectId` with its thumbnails' and captions' bytes (`background.ts:281-297`). In order: Related video set to the long video through Studio's video picker (`studio-pages.ts:316-334`, picker `:292-315`); end screen gets a Video element pointing to `endScreenVideoId`, then the end screen editor's Save (`:335-371`); for the long video only, captions uploaded "With timing" and the Subtitles editor's Done (`:372-391`, `content.ts:410-420`), skipped when they already went in during the upload (below); then the Details page's Save when Studio enabled it (`studio-pages.ts:478-488`). These Saves go through `pressToSave`, which skips the forbidden-button refusal (`packages/extension/src/fill.ts:588-593`).
   **Captions during the upload** (`uploadCaptions`, `packages/extension/src/studio-pages.ts`; `look`, `packages/extension/src/content.ts`): once the person presses Next to the upload dialog's Video elements step and Studio enables Add subtitles (`ytcp-uploads-video-elements ytcp-button#subtitles-button`; disabled, with its tooltip `#subtitles-button-tooltip` saying why, until the video has processed far enough to play and has a language), a long video's captions go in there: the Subtitles editor's Upload file (`#choose-upload-file` on its first screen, else under ⋮), With timing, the file, then Done (`#publish-button`) once enabled. While it is disabled a toast says why once (`subtitlesBlocked`). On success the extension keeps `captionsAdded:<projectId>` in its storage (cleared when the next upload of that project fills) and `POST /ext/video/done` carries `captionsAdded: true`, so `confirmVideoUpload` queues no `finish` task for captions alone and `runFinish` skips them. On failure a toast says why and the captions wait for the Details page as before. The selectors were read from Studio's own templates and handlers on 2026-10-15, not clicked through on a live upload.
4. **Reported** (`POST /ext/task-result`, `edge/http/studio.ts:828-833`): `finish_state` = `done` when every step succeeded, else `failed`, with the steps' messages joined; the worker closes the tab on that report (`background.ts:473-474`).

### Pinned comment (opt-in, the `comment` task)

1. **Setting**: `studio.autoComment` = `on`/`off` via the Posting plan's switch "Post and pin each video's comment once it is public (the extension posts it in your name)" → `PUT /settings/auto-comment` (`packages/web/src/studio/posting-plan.tsx:60-64`, `:146-151`, `edge/http/studio.ts:291-300`); `GET /settings` reads it as `on` only when the row says `on` (`:278-289`).
2. **Queued** by `/ext/video/done` for the long video only, when its item has `pinnedComment` and the setting is `on`: `comment_state = 'waiting'` (`edge/http/studio.ts:843-848`).
3. **Picked up** by `checkTasks` once the video is public by oEmbed: a background tab at `https://www.youtube.com/watch?v=<id>#slopify-comment&p=<project>&s=<short>` (`background.ts:185-191`).
4. **Posted** (`packages/extension/src/comment.ts:25-126`): scrolls up to ten times to load comments, opens the comment box, inserts the text, presses the comment's submit button, waits up to 15 s for a thread containing the text's first 40 characters, opens that comment's menu, presses Pin and the confirmation's Pin, then reports `comment` done or failed with a sentence.

### A/B test on request

1. **Asked for** from On YouTube (long video, `done`) or the popup's "A/B test…" with the choices Titles and thumbnails / Titles / Thumbnails; both open `https://studio.youtube.com/video/<id>/edit#slopify-ab=<both|titles|thumbnails>&p=<project>&s=0` in a new tab (`packages/web/src/project/on-youtube.tsx:19-26`, `packages/extension/src/popup.ts:164-198`).
2. **Set up** (`runAb`, `packages/extension/src/content.ts:387-399`): the item comes through the worker; the page waits up to 30 s for the Details editor (`:381-384`); `openAbTest` (`packages/extension/src/fill.ts:439-459`) takes the item's other titles (all titles but the one the upload used) unless the mode is Thumbnails, and every thumbnail (the upload's first) unless the mode is Titles. With no other titles and fewer than two thumbnails it stops with "This video has no other titles to test…" or "This video has only one thumbnail, and A/B Testing needs two or three…" (`:449-457`).
3. **Filling the dialog** (`fillAbTest`, `fill.ts:334-430`): Studio's mode follows what is tested: titles and two or more thumbnails → "Title and thumbnail", titles alone → "Title only", thumbnails alone → "Thumbnail only" (`:344-347`); it presses A/B Testing (`:368`), the mode's chip (`:384`), puts the thumbnails into rows 1–3, writes the video's title into title box 1 when Studio left it empty and the other titles into boxes 2 and 3 (`:387-417`). The dialog is left open; the toast says to check it, press Set test, then Save on the video (`fill.ts:426-430`, `content.ts:357-361`).
4. **Nothing is recorded** when a test is set up: the person presses Set test and Save in Studio. The daily A/B sweep reads a finished test's result page (`#slopify-ab-read`), so a finished test is found without Slopify knowing it was started (`packages/extension/src/content.ts:426-439`, `runAbRead`). The sweep's list is the `done` long videos whose `ab_state` is `started` (`edge/http/studio.ts:836-849`); `ab_state` is only reset to `none` when a project's video id changes (`slices/studio/videos.ts:84`) and nothing in the app writes `started` now, so the list is normally empty. The alarm keeps the name `slopify-ab-tests` (`background.ts:491`, `:508`).

### Studio's A/B results

1. **Sweep** (`sweepAbResults`, `packages/extension/src/background.ts:235-248`): when the last sweep is older than 24 h, `GET /ext/known-videos` (the `done` long videos whose `ab_state` is `started`, `edge/http/studio.ts:836-849`) becomes the day's list in `storage.local` (`statsSweep`); `nextAbRead` opens one background tab at a time at the video's Details page with `#slopify-ab-read&p=…&s=…` (`background.ts:256-269`). An empty answer (Slopify unreachable or no such video) stores nothing, so the next 15-minute check asks again instead of waiting a day (`background.ts:240-246`). A tab that has not reported within 4 minutes is closed and the next video opens (`unstickAbRead`, `background.ts:250-278`, run by the `slopify-stats-watch` alarm, `:492-494`).
2. **Reading** (`runAbRead`, `packages/extension/src/content.ts:426-437`): on the Details page `readAbResult` presses A/B Testing's button only when its label speaks of results and reads two or three rows each with a percentage, then presses Escape (`packages/extension/src/studio-pages.ts:494-543`); fewer than two rows reads as no result.
3. **Report** (`POST /ext/stats`, `edge/http/studio.ts:890-906`; body `:150-155`): the worker posts `{ projectId, short, videoId, abVariants? }` (`background.ts:398-410`) and closes the tab and opens the next on that report (`background.ts:476-479`). Two or three A/B variants (`title`, `thumbnail` 1–3, `share` percent, `winner`) upsert one `ab_results` row with `read_at` = now (`slices/studio/stats.ts:7-15`, `:27-39`); a single or absent variant stores nothing.
4. **Shown**: Library → A/B results (`/ab-results`, `packages/web/src/routes/ab-results.tsx:72-129`; `GET /ab-results`, `edge/http/studio.ts:565`, newest read first, joined to the project's title, rows whose variants do not parse left out, `slices/studio/stats.ts:41-65`). The page orders variants by share and labels the first "winner"; Copy as prompt notes puts a summary on the clipboard to paste into a Library prompt by hand (`ab-results.tsx:25-40`, `:42-70`). YouTube views, CTR and impressions are no longer read or shown.

## Branches

- Long video already `done` (uploaded, pasted or backfilled) → `planned` places nothing more, shorts included (`edge/http/studio.ts:232-234`). Backfill leaves release rows as they are (`slices/studio/backfill.ts:17-37`).
- "Not scheduled" (picker or calendar) sticks: the short-0 row at `''` stays, and `planReleases` neither gives a new long-video time nor places shorts (`slices/studio/releases.ts:146-155`). The project is a calendar candidate again (`slices/studio/calendar.ts:132-150`).
- No line takes the project's series (or the plan has no lines) → no free time, nothing written; the picker offers only Not scheduled and the project's current time, if any (`slices/studio/releases.ts:125-132`, `:149-150`).
- The long video's line removed from the plan, or a line without shorts → its shorts get no plan times; times already written stay (`slices/studio/releases.ts:156-157`).
- Moving a long video by hand → plan-placed short times are deleted and placed again after it; short times the person set stay (`slices/studio/releases.ts:195-196`).
- Lead time at or past an item's release → the calendar shows it `late` until it is on YouTube or filled (`slices/studio/calendar.ts:95-104`).
- Finish task for a short whose long video is not public yet → skipped this round, tried again on the next check (`background.ts:177-179`).
- Comment task for a video not public yet (scheduled videos are private until their time) → skipped this round (`background.ts:202`).
- A/B mode `both` with titles but one thumbnail → "Title only"; with thumbnails but no other titles → "Thumbnail only" (`fill.ts:344-347`).
- A/B results button whose label does not mention results → no `abVariants`; the report carries only the video and the server stores nothing (`studio-pages.ts:508-510`, `content.ts:429-436`).
- A popup item already on YouTube: the long video with a known id opens the A/B choices; a short is shown "✓ on YouTube" and does nothing (`packages/extension/src/popup.ts:133-156`).

## Unhappy paths

- `PUT /plan` with an invalid body → 400 via `onInvalid`; from a page at another address → 403 "For your safety, YouTube Studio settings can only be changed from the Slopify page itself. Open Slopify and try again there." (`samePage`, `edge/http/studio.ts:188-195`); the app-wide guard has already refused such a change (53-remote-access-and-request-guard.md Step 12).
- Slot taken or past → 409 "That slot is taken or past. Reload Prepare upload and choose one of the slots it lists." (`edge/http/studio.ts:482-487`). Drawer: "Couldn't change the slot: … Choose it again." (`packages/web/src/studio/prepare-upload.tsx:185-190`).
- Removing the old plan failing → toast "The old posting plan wasn't removed: … Try Remove the old plan again."; lead time failing → "The lead time wasn't saved: …"; auto-comment switch failing → "Not saved: …" (`packages/web/src/studio/posting-plan.tsx:44`, `:58`, `:63`). A lead-hours value outside 1–168 or not whole is not sent (`:132-141`); the route refuses it with 400 (`edge/http/studio.ts:309-322`).
- `PUT /releases/:projectId` for an unknown project → 404; a body that is not `{ short 0–99, at ISO | null, line? }` → 400; `GET /releases` or the PUT from a page at another address → 403 (`edge/http/studio.ts:302-351`). Calendar toasts "The time wasn't changed: …" and "The project wasn't put there: …" (`packages/web/src/studio/releases-view.tsx:103`, `:203`).
- A time set by hand is not checked: two releases can share an hour, a past time is accepted, and a short can be set before its long video (`slices/studio/releases.ts:186-197`); plan placement then treats those hours as taken (`:83-90`).
- The checks tab: no `studioChannel` stored yet (no Studio page with the channel id opened) → no tab is opened; a Restrictions cell Studio renders differently or empty → no `checks` sent, so the video stays unread and the tab is opened again every 2 h while its release is ahead (`packages/extension/src/background.ts:194-199`, `content.ts:555-561`).
- Captions: `/ext/files` serves a pack item's video, thumbnails and captions file (`edge/http/studio.ts:851-874`); the worker fetches the captions as base64 for the Details page (`background.ts`, `itemOf`), and a failed fetch leaves `captions` unset, so `finishDetails` skips the Subtitles upload.
- A Details step not found (related video field, end screen editor, Video element, picker card, Subtitles editor, Save) → that step's sentence says what to do by hand; the task is `failed` with all messages (`studio-pages.ts:135-232`). On YouTube shows "Details touches failed: <message>" (`packages/web/src/project/on-youtube.tsx:55-56`).
- Comment box not found (comments off), not opened, no submit button, comment not shown within 15 s, menu or Pin missing → `comment` `failed` with that sentence, some reading "Posted, but … pin it by hand." (`packages/extension/src/comment.ts:39-85`); On YouTube shows "Pinning the comment failed: …" (`on-youtube.tsx:59-60`).
- A task tab that never reports stays `waiting` and is opened again after 30 minutes on the next check; `comment.ts` first looks for the comment already posted and then only pins it, and skips pinning one that already shows the pinned badge (`background.ts:169-174`, `comment.ts:41-43`, `:69-71`).
- A failed task is not retried: `/ext/tasks` lists only `waiting` ones (`slices/studio/videos.ts:148-157`).
- Oembed unreachable → the video counts as not public; the task waits (`background.ts:135-144`).
- `/ext/tasks` or `/ext/known-videos` failing → treated as nothing waiting, no checks / no videos; a sweep with no videos is not recorded and runs again at the next check (`background.ts:172-182`, `:240-246`).
- A Details tab that never sends its report (no video id in the path, a page that never loads, a video Studio cannot open) is closed after 4 minutes and the sweep moves on to the next video; the next sweep, 24 h after the last one started, begins a fresh list (`content.ts:426-439`, `background.ts:229-248`, `:250-278`).
- A/B Testing button, dialog, chip, picture slots or title boxes not found → the result names what to add by hand and copies the titles; nothing is pressed (`fill.ts:355-406`). Title boxes are found only when Studio shows at least one more box than there are other titles (`fill.ts:395-401`); Studio shows three rows (`packages/extension/src/selectors.ts:115-118`).
- A/B results page clipboard refused → "Couldn't copy the notes. Select them and copy by hand." (`ab-results.tsx:103`).

## State transitions

- `releases` row per `(project, short)`: absent → `by = 'plan'` (placed by `planned`) → `by = 'person'` (picker or calendar: a time or `''`); a person-set long video deletes its plan-placed short rows, which `planned` writes again; person-set rows change only by another hand edit. No code deletes a short-0 row; rows cascade with the project (`slices/studio/releases.ts:137-197`; `packages/app/src/kernel/db/migrations/0048-releases.sql:6-14`).
- `youtube_videos.checks`: null → the Restrictions text or `ok`, overwritten by each later reading of that row (`slices/studio/videos.ts:182-185`).
- Calendar item state is derived on each read, never stored: `not-ready` → `ready` → `late` as time passes; `filled` and `scheduled` follow `upload_state` (`slices/studio/calendar.ts:95-104`).
- `youtube_videos.finish_state` and `comment_state`: `none` → `waiting` (confirmation) → `done` | `failed` (task result). No transition leaves `done` or `failed`; a new video id for the same upload does not reset them (`slices/studio/videos.ts:73-91`, `:134-146`).
- `youtube_videos.ab_state`: stays `none`; only `recordVideo`'s reset writes it (`slices/studio/videos.ts:84`).
- `ab_results`: absent → present → overwritten by each later reading (`slices/studio/stats.ts:27-39`). `video_stats` is no longer written.
- `studio.autoComment`: `off` (absent) ↔ `on`. Turning it on does not queue comments for videos already confirmed; turning it off does not cancel comments already `waiting` (`edge/http/studio.ts:843-848`, `:732-758`).

- A Studio page the extension opens for a task (`#slopify-ab-read`, `#slopify-ab`, `#slopify-finish`, `#slopify-checks`) keeps the task out of the address: `packages/extension/src/early.ts` runs at document_start, moves the hash into the tab's sessionStorage (`slopify.task`) and removes it before Studio's router can rewrite it into a path; `content.ts` `hashParams` reads it from there (extension 1.1.2).

## Invariants

- An A/B test starts only on the person's request, and only the person presses Set test: `openAbTest` is reached only from the `#slopify-ab` page, and `press` refuses "Set test" (`packages/extension/src/content.ts:760-762`, `packages/extension/src/fill.ts:583-586`, `packages/extension/src/selectors.ts:275`).
- The extension never presses Schedule or Publish anywhere. It does press Save on a confirmed video's Details page, the end screen editor's Save and the Subtitles editor's Done, through `pressToSave` (`packages/extension/src/fill.ts:591-593`, `packages/extension/src/studio-pages.ts:181`, `:227`, `:249`); the A/B flow presses no Save.
- Details touches and comments are queued only by Studio's confirmation of an upload (`edge/http/studio.ts:821-850`); a filled but unconfirmed upload gets neither.
- The pinned comment is posted only when `studio.autoComment` was `on` at confirmation, only for the long video, only once its video is public (`edge/http/studio.ts:994-998`, `packages/extension/src/background.ts:201-207`).
- One release per project and short (`PRIMARY KEY (project_id, short)`, `packages/app/src/kernel/db/migrations/0048-releases.sql:13`). The plan never places two releases in the same hour or a long video less than the lead time ahead (`slices/studio/releases.ts:122-131`, `:158-176`); hand-set times are exempt.
- Slopify never asks YouTube's API: A/B results are what Studio's pages showed when the extension last looked (`slices/studio/stats.ts:4-6`). The only YouTube endpoint the worker fetches is the public oEmbed (`packages/extension/static/manifest.json:16`).
- A/B results never change a prompt; Copy as prompt notes only fills the clipboard (`packages/web/src/routes/ab-results.tsx:10-13`).

## Outcomes & side effects

- Tables: `releases` and `youtube_videos.checks` (`packages/app/src/kernel/db/migrations/0048-releases.sql:6-20`, replacing 0047's `upload_slots`), `video_stats`, `ab_results`, and `youtube_videos.finish_*`/`comment_*` (`packages/app/src/kernel/db/migrations/0047-studio-autopilot.sql:10-39`). All cascade with their project and travel in a full backup with it (`slices/storage/backup-format.ts:63-68`).
- Settings: `studio.postingPlan`, `studio.autoComment` ("on"/"off"), `studio.leadHours` and `studio.uploadPick.<projectId>` travel with a backup, each checked against its schema (`slices/storage/portable.ts:499-512`). `studio.leadHours` is not a known setting there, so a full backup leaves it behind (`:524`, `:530-545`).
- Extension `storage.local`: `tasksOpened` (task → last open time, plus `checks`), `statsSweep` (`{ at, left }`), `studioChannel` (`packages/extension/src/background.ts:130`, `:210`, `:229`; `packages/extension/src/content.ts:562`). Tabs it opens in the background: Details pages, watch pages, Analytics pages, the Content list for the checks; each closes only after its report.
- On YouTube (each upload's link and state words) and Library → A/B results show what is stored.

## Dimensions not in play

- D5 Money: none; no provider is called and YouTube's API is not used.
- D1 Authority: one local user; the extension acts with whatever YouTube account the browser is signed in to; Slopify does not check which channel that is.
- D13 Notification: none from Slopify; outcomes show as state words in On YouTube and toasts on Studio pages.
- D15 Audit: only the latest state and message per task and the latest reading per video are kept; no history of readings or attempts.
