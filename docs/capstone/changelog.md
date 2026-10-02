---
generated_date: 2026-09-02
capstone_version: 5.2.0
---

# Changelog

## 2026-10-02 - map: all
key: map/all@8e5bc8b8156d

- 41 chapters, scenarios and screens regenerated or restamped (covered paths changed): square format (formats, thumbnailAspect, migration 0049, per-provider square sizes, 1080x1080 frames), release candidates need a made video, the stats sweep retry and Read Studio numbers now, the extension's task kept out of Studio's address (1.1.2).
- Left stale on purpose: 05-dependencies and 06-testing (another session's site/walkthrough changes), logic/10 (interview-derived; its "16:9 or 9:16" predates square), and screens/logic last changed before this range.

## 2026-10-02 - note: studio-task-hash

- Studio pages the extension opens keep their task out of the address: `early.ts` (document_start) moves a `#slopify-…` hash into the tab's sessionStorage (`slopify.task`) and removes it before Studio's router rewrites it into a path ("Oops, something went wrong"); `content.ts` `hashParams` reads it from there (extension 1.1.2).

## 2026-10-02 - note: stats-sweep-retry

- The extension's stats sweep records itself only when it has videos to read (else the next 15-minute check retries), and the popup's "Read Studio numbers now" runs it at once (`stats-now`; extension 1.1.1).

## 2026-10-02 - note: square-format

- Square projects (3.5.0, migration 0049 rebuilds `projects` to widen the format CHECK): `formats` gains "1:1" (`kernel/pipeline.ts`), the catalog lists "1:1" for every image and clip model, fal asks `square_hd`/"1:1" and OpenAI 1024x1024; video, captions, figure cards and the style preview frame 1080x1080 (360x360 preview); `thumbnailAspect` keeps a square project's thumbnail 16:9; shorts stay 9:16. The web format picker offers Square; the player has `square`.

## 2026-10-02 - note: release-candidates-video

- Calendar → Releases candidates are only finished projects whose upload pack has its video (`slices/studio/calendar.ts`).

## 2026-10-02 - map: all
key: map/all@14480f26c13e

- 01-architecture.md, 02-models.md, 04-data-flow.md, 08-glossary.md: regenerated (covered paths changed); release calendar (`releases` replaces `upload_slots`), lead hours, series, checks.
- 07-operations.md: package 3.4.0, extension 1.1.0.
- logic/14, logic/40: backups carry `releases`; a 3.3 backup's `upload_slots` imports as releases.
- logic/32, logic/44, logic/README: release calendar, Upload all one at a time, Studio checks.
- uiux/screens/08-settings, 13-schedules (Releases tab), 23-studio-upload: regenerated (covered paths changed).
- Found while proving and mapping, fixed before release: shorts of a project that held a 3.3 slot got no times; the lead time and a 3.3 backup's slots didn't survive a backup.

## 2026-10-02 - note: run-sounds-fresh-player

- Run sounds play each chime on a new `AudioContext` closed after it plays (`packages/web/src/notifications/sounds.ts`), so a player stuck after an output change or sleep can no longer silence every later chime.

## 2026-10-02 - note: release-calendar

- Release calendar (3.4.0, migration 0048): `releases` (one row per long video, short 0, and per short; `''` = not scheduled; `by` plan|person) replaces `upload_slots` (`slices/studio/releases.ts`). Posting-plan lines gain `series` (`plan-model.ts`, `seriesOf` from the title pattern after "|"); the default plan is empty; shorts never share an hour with another release; `studio.leadHours` (default 24) sets each item's upload-by. Calendar → Releases (`studio/releases-view.tsx`, `GET /api/studio/releases`, `PUT /api/studio/releases/:projectId`, `slices/studio/calendar.ts`). `youtube_videos.checks` from the Content list's Restrictions; `/ext/tasks` `checks` makes the worker read the list every two hours. Upload all waits for each file to finish uploading before opening the next (extension 1.1.0); the popup sorts by upload-by.

## 2026-10-02 - map: all
key: map/all@e9226a34aa8a

- 01-architecture.md, 01-architecture-research/recovery/narration/docker.md: regenerated (covered paths changed); Studio extension ↔ app section rewritten (16 `/ext/*` routes, worker messages, alarm, comment script); narration/docker brace globs expanded to one glob per file.
- 02-models.md, 02-models-research/narration.md: regenerated (covered paths changed); Studio entities (PostingPlan, YoutubeVideo, VideoStats, AbResult…) and the 0043–0047 tables added.
- 03-conventions.md, 04-data-flow.md, 04-data-flow-research.md, 05-dependencies.md, 06-testing.md, 07-operations.md, 08-glossary.md: regenerated (covered paths changed); Chrome Web Store job and secrets (names only), 13 glossary terms.
- logic/01, 03, 04, 05, 07, 08, 09, 11, 12, 13, 14, 15, 17, 18, 20, 22–28, 32, 34, 35, 37, 38, 40, 41, 42, 43, README: regenerated (covered paths changed); kept subject on rename, Queue switch, Prepare ahead, Keep as is, render cache.
- logic/44-studio-autopilot.md: created (logic coverage gap): posting plan and slots, finish and comment tasks, A/B on request, stats sweep, A/B results.
- uiux/screens/01–04, 06–09, 13–15, 20, 23: regenerated (covered paths changed); Video section holds Shorts and YouTube; Posting plan; popup.
- uiux/screens/24-ab-results.md: created (design coverage gap).
- Index refreshed: rows for logic/44 and uiux/screens/24.
- Skipped as current: 02-models-docker, logic/02, 06, 10, 16, 19, 21, 29–31, 33, 36, 39, uiux/screens/05, 10–12, 16–19, 21, 22.
- Left alone (interview-derived, never regenerated): mockup/*, uiux/README.md, uiux/01–03; they read stale by globs.
- Found while mapping and fixed before release: captions not served to the extension, "Not scheduled" not sticking, Studio settings missing from backups, a comment that could be posted twice, the dead A/B queue state.

## 2026-10-02 - note: upload-pick

- Prepare upload picks the upload's title and thumbnail (`studio/pick.ts`, kept in settings as `studio.uploadPick.<projectId>`): the pack's video item carries the picked ones as `title` and `thumbnails[0]`, the others after them, and `pickable` with the project's own order; `PUT /api/studio/packs/:projectId/pick` saves it.

## 2026-10-02 - note: studio-autopilot

- Studio autopilot (3.3.0, migration 0047): a weekly posting plan (`studio/plan.ts`, setting `studio.postingPlan`) assigns each prepared project the next free row (`upload_slots`) and each short the first occurrence of its slot after its video; pack items carry `scheduleAt`, `captions`, `endScreenVideoId`, `relatedVideoId` and `pinnedComment`. A confirmed upload queues finish and opt-in comment tasks on `youtube_videos` (`/ext/tasks`, `/ext/task-result`); the extension reads Studio numbers and A/B results daily (`video_stats`, `ab_results`, `/ext/stats`). A/B tests start only on request (`#slopify-ab` hash, never Set test); Library → A/B results copies prompt notes. The project rail folds Shorts and YouTube into Video. The extension (1.0.0) ships to the Chrome Web Store from the release workflow (`scripts/publish-chrome.mjs`).

## 2026-10-02 - note: rename-runs-nothing

- A rename runs nothing: the YouTube description, the PDF, the audio files' tags, a short-mode render and the intro/outro writer (`segmentMessages`) read `subjectOf(config)` too, so no step's fingerprint changes with the title.

## 2026-10-02 - note: rename-keeps-subject

- Renaming a project no longer redoes its pictures: the first rename keeps the old title as `subjectTitle` (`revisions/subject.ts`), and the steps that use the title only as context (image and thumbnail scenes, appearance, cast, the shorts' pick and pictures, an LLM-written thumbnail prompt) use `subjectOf(config)`. The YouTube text, the PDF and the audio files' tags follow the new title.

## 2026-10-02 - note: extension-popup

- The extension's toolbar popup (0.4.0, `popup.html`) lists finished projects not marked uploaded (`GET /api/studio/ext/ready`), each with its video and shorts and whether they are on YouTube; a click puts that upload first in the fill queue (`POST /api/studio/ext/upload`, `fillNow`) and opens Studio's upload page. An upload is on YouTube only once Studio confirms it (`upload_state`, migration 0046: `filled` from the Details, `done` from `POST /api/studio/ext/video/done` when Studio's "Video scheduled/published/saved" window shows); its A/B test is queued then.

## 2026-10-02 - note: backfill-links

- The extension sends Studio's Content list rows (title, video id) to `POST /api/studio/ext/backfill`, which records the uploads whose title matches exactly and whose video isn't known yet (`studio/backfill.ts`). Once the long video's link is known, the shorts' "Watch the full video" line uses it when the project sets none (the pack and the Shorts part).

## 2026-10-02 - note: ab-tests-after-publishing

- A/B tests wait for their videos to be public: `youtube_videos` (migration 0045) keeps the YouTube video each upload became (read by the extension from Studio's upload dialog, or pasted under the project's YouTube → On YouTube) and its A/B test state. The extension (0.3.0) fills an upload with thumbnail 1 only (`abTestLater`), records the video, and every 15 minutes starts each waiting test whose video oEmbed answers as public, on its Details page in a background tab (`startAbTest`, the one path that presses Set test). A/B Testing also tests the other titles (Title and thumbnail / Title only). Write again is on the pinned comment's and other titles' heads too.

## 2026-10-01 - note: thumbnail-regenerate-copy

- Regenerating a thumbnail asks with its own sentence: the video and shorts are not touched (no video recipe depends on a thumbnail; only the PDF cover follows the first one). It used the image dialog's "re-renders video when enabled".

## 2026-10-01 - note: short-still-softened

- A short's still is drawn from its softened prompt after Soften and retry: `runtime-shorts.ts` asks `softenIfAsked` like the image stage, and clears the request once drawn. 3.2.2 offered the button but drew the original prompt again.

## 2026-10-01 - note: short-still-refusal

- The Codex image adapter reports a run that drew nothing because the image tool's safety system blocked it as a refusal (with Codex's reason), and Soften and retry covers refused short stills (`shorts:N:image:M`) in the Video stage (`softenableKeys`, `fixes/rules.ts`).

## 2026-10-01 - note: running-now-activity

- Home's Running now card shows a running step's named activity with its percentage ("Rendering the video (45%)"), as the project page does, instead of a step count that stands still through the long render.

## 2026-10-01 - note: kept-as-is-upload

- A project kept as is with its video made offers Prepare upload in its next-action panel, like a finished run.

## 2026-10-01 - note: kept-as-is-project-page

- The project page reads Keep as is too: `GET /api/projects/:id` carries `setAside`, the header says "Kept as is" and the next-action panel stops asking to continue the run.

## 2026-10-01 - note: keep-as-is

- Home's Needs you has **Keep as is** on a run waiting on held work: it leaves Needs you without running anything, until the project's next edit (`project_set_aside`, migration 0044, set on the head revision; the listing's `setAside`). Projects shows it as "Kept as is", and Ready to upload counts it as finished. Left out of backups on purpose.

## 2026-10-01 - note: extension-adds-video

- The Slopify Studio extension (0.2.0) puts the waiting item's video into Studio's upload dialog on its Select files step, through a hidden extension page (`video-frame.html`) that fetches it with the pairing token and hands the File to the Studio page in one postMessage. `/api/studio/ext/files` now serves a pack's video as well as its thumbnails, and nothing else.

## 2026-10-01 - note: ab-titles-keep-pattern

- A project whose title was filled from a pattern with keywords keeps the pattern (`titlePattern`), from Play and from schedules (a scheduled draft now keeps its title's keywords; `scheduledTitle` is the filled title). YouTube's two other A/B titles then change only what the keywords hold, and an answer that changes the fixed wording is asked again (`youtube/titles.ts`). A title without keywords, or renamed away from its pattern, keeps free other titles.

## 2026-09-30 - note: shorts-appearance

- The shorts' image prompt (Shorts → Image prompt) takes `{{Appearance}}`: each short gets the subject's researched look and those of the figures its clip names, so shorts draw figures like the video does. A `{{Scene}}` line there is left out, since each short's images already show what is said.

## 2026-09-30 - note: review-video-checkpoint-font

- Play → Review no longer refuses a setup with burned-in captions and a Before Video checkpoint ("Something changed since you reviewed this video"): the font the render uses made the two checks it compares differ every time.

## 2026-09-30 - note: prepare-scheduled

- Calendar → a queued run → **Prepare**: the schedule's video is made ahead of its day (everything but the video, held at a Before Video checkpoint), and on the day the schedule continues the project of the same title instead of making another. Table `prepared_videos` (migration 0043) records which hold is the preparation's own.

## 2026-09-30 - note: narration-retry-waits

- A narration chunk the captions caught garbled is recorded again even when another step of the project is still running (its PDF, say): the retry waits for that step instead of giving up and leaving the video failed.

## 2026-09-30 - groom: 2026-09-30-slopify-mcp
key: groom/2026-09-30-slopify-mcp@Q20

- `features/2026-09-30-slopify-mcp/spec.md`: new spec — built-in MCP server for operating the pipeline, Library and setup, reviewing and fixing failures.
- Decision: in-process Streamable HTTP `/mcp` on the Hono server; tools call slices directly.
- Rejected: stdio subcommand proxying `/api`; shipping both transports.
- Decision: always on, no token, Origin check only; rejected Settings toggle + bearer token.
- Decision: tool parity with the web UI including permanent deletes; excluded API keys, backups, updater, host-CLI/Docker setup.
- Decision: new External agent reviewer; waits, auto-passes after a fixed 2 h with a notification; rejected indefinite wait and CLI fallback.
- Decision: agent may fix failures with recovery actions, project edits and output edits; rejected narrower scopes.
- Decision: spending follows the UI's estimate and acknowledgement; rejected per-action cap and daily budget.
- Decision: MCP actions marked "by agent"; Settings → Agents (MCP) section.
- Pushback recorded: user first chose one bundled spec over a four-way split; accepted with a spike gate, later voided when posting was dropped.
- Dropped: scheduled YouTube posting through an agent's browser (project upload times, schedule publish rule, Studio Schedule) — removed from scope entirely.
- Left open: the "Failed / Try the video again" card during an automatic narration-chunk re-record (outside this feature).

## 2026-09-30 - note: faster-render

- Rendering a video is several times faster: the picture clips are made several at a time (up to eight, by the computer's cores and memory), a long video's burned-in captions are drawn in parts side by side, the sound is levelled and encoded while the picture renders, and the clips of a project's last render are kept, so rendering again after an edit makes only the clips that changed. The kept clips live in a hidden `.render-cache` folder under Projects (at most 30 GB for all projects, less when the disk runs short) and go with their project.

## 2026-09-30 - note: chunk-direction

- A narration chunk's text override can carry its own delivery note (`direction`), added to the narration prep prompt for that chunk only, so one chunk can be re-tagged without re-tagging the whole narration.

## 2026-09-30 - note: batch-queue-switch

- Play → Start box: with more than one video, a **Queue** switch (on by default). On, they run one after another as before; off, they all start at once as separate runs, and the Play key reads **Start N videos**.

## 2026-09-30 - map: all
key: map/all@bee3234acb33

- logic/15-prompt-management.md: regenerated (covered paths changed); new step 8 rename propagation (`renameReferences` rewrites live template head revisions and active Play drafts in the save's transaction); Used by gains former names, head-version schedules, Script/Review field rules; later steps renumbered 10-14; pointers into `save.ts`, `prompts.ts`, `entries.ts` moved.
- 01-architecture.md: regenerated (covered paths changed); library slice row names rename propagation; `createPrompt`, `promptRoutes`, `entryRoutes` line pointers moved.
- 03-conventions.md: regenerated (covered paths changed); app non-test source count 642 → 643 (`slices/library/rename.ts`).
- 04-data-flow.md: regenerated (covered paths changed); Templates state row records the in-place rename rewrite of head revisions and active `play_drafts`.
- 07-operations.md: regenerated (covered paths changed); package version 3.0.13 → 3.0.14.
- 01-architecture-docker.md, 02-models.md, 05-dependencies.md, 06-testing.md, 08-glossary.md, logic/20-boot-cli-recovery.md, logic/README.md: restamped; covered paths changed (version bump, used-by/rename code, used-by tests) with no drift in their content.
- mockup/ and uiux/ interview-derived files: left stale, out of this refresh's scope.
- 00-index.md: re-verified, unchanged.

## 2026-09-30 - thumbnail-scenes-own-step
- The thumbnails' scenes are written by a step of their own in the Thumbnail stage (`thumbnail:scenes`), not in the images' scenes call, so changing a project's thumbnail settings no longer marks every image outdated.
- History → Restore this revision no longer stops with "unknown kind of step" on projects with Scenes from the article, `{{Appearance}}`, shorts, a YouTube description, levelled narration or animated images: the restore takes each step's stage from its plan.

## 2026-09-30 - run-sounds
- Run sounds (Settings → Notifications, on by default): a chime when a run starts and a different one when it finishes, fails or waits, while a Slopify tab is open; with browser notifications on, a start also shows "Started: title". The run clock counts work an edit carried over (a retried video no longer freezes it), and Cost so far shows the run's working time once it stops.

## 2026-09-30 - project-page-rows
- The project page's header is one row (back link, title, meta line with the run clock, buttons), and each stage's head puts its summary beside the title; the run clock no longer takes a row of its own.
- The article shows its narrated body's word and character count beside its title.
- Live plays the finished narration (the player with its waveform, levelled when Level the volume is on), plays the parts so far while it is spoken, and says its length in hours and minutes.

## 2026-09-30 - map: all
key: map/all@54f5cb4c1dab

- 01-architecture.md: regenerated (covered paths changed, version gap 5.2.0 → 7.0.1); adds extension package, 45-slice table, single-connection event mux.
- 01-architecture-research.md: regenerated; required headings added (schema drift); live research path is the rebuild recipes.
- 01-architecture-recovery.md: regenerated; one-click recovery (`recoverProject`) now exists.
- 01-architecture-narration.md: regenerated; widened to aliases, multi-voice, loudness, TTS registry.
- 01-architecture-docker.md: regenerated; `edge/docker-projects` replaced by compose-based `edge/docker-install`.
- 02-models.md: regenerated; 433 entities, 64 app tables of DDL; Host CLI protocol table gains Field/Type/Required (schema drift).
- 02-models-research.md: regenerated; required headings added (schema drift).
- 02-models-narration.md: regenerated; aliases, shared pronunciations, voice models.
- 02-models-docker.md: regenerated; install/update v2 records, legacy receipt/journal kept as adoption schemas only.
- 03-conventions.md: regenerated; web kit rules, naming, error-message conventions.
- 04-data-flow.md: regenerated; 21 flows traced.
- 04-data-flow-research.md: regenerated; required headings added (schema drift).
- 05-dependencies.md: regenerated; new services recorded; unshipped adapter picks kept under "Picked but not yet installed".
- 06-testing.md: regenerated; five Vitest projects, sharded CI.
- 07-operations.md: regenerated; compose install, autostart, backups, release flow.
- 08-glossary.md: regenerated; ~80 terms.
- logic/01, 04, 05, 08, 12, 13, 14, 18, 19, 20, 21, 22, 23, 25: refreshed in place (covered paths changed); decisions kept, code behavior corrected where it moved.
- logic/26, 27, 28, 29: refreshed; stamps added (stamp unreachable).
- logic/02, 03, 07, 09, 11, 15, 17, 24: refreshed (logic coverage: scope grew); stamps and paths_covered added.
- logic/30–43: created (logic coverage gap): channels-and-cast, channel-memory, studio-upload-prep, automatic-reviews, speakers-and-voices, audio-levelling-and-ambient, style-preview, run-cost-and-eta, home-attention-and-uploads, notifications-and-live-events, trash-and-scheduled-backups, onboarding-and-sample, in-app-help, autostart.
- logic/README.md: regenerated as the 01–43 index.
- uiux/screens/01–14: regenerated (covered paths changed); 13-schedules now describes the /calendar surface.
- uiux/screens/15–23: created (design coverage gap): home, welcome, channels, document-themes, narration-aliases, help-tutorials, command-palette, announcements, studio-upload.
- Corrections recorded: Narration Preparation is not a toggle; Review reads live Library rows before the saved snapshot; schedules read the template as it is at dispatch; updates wait for running work; delete moves to Trash.
- Left untouched (interview-derived, not map-owned): mockup/*, uiux/01-direction.md, 02-system.md, 03-experience.md, uiux/README.md; logic/06, 10, 16 (no paths_covered).
- Settings sections folded into uiux/screens/08-settings.md instead of a separate chapter.
- interfaces: still absent (vendor APIs and in-monorepo packages only); quarry not installed, no edge confirmation.
- Index refreshed; module map re-derived.

## 2026-09-30 - live-updates
- Pages update live again, without refreshing. Each page opens one live connection instead of one per project it shows: over HTTP/1.1 a browser allows six per address, and the streams used them up until the page's own requests waited forever. The global stream carries every project's events, and the browser hands each view its own (`web/src/event-mux.ts`), replaying what the AI models are writing to a view opened mid-call.
- Work carried over to the current revision (a video rendering on after a thumbnail redo) sends its events again, told under the current revision; they were dropped as old.
- The projects list, home and calendar refresh on steps starting and finishing, not only on project changes. The video render reports its progress to a tenth of a percent. A 20-second heartbeat keeps idle streams open, and pages showing a running project look again every 15 seconds in case an event was missed.

## 2026-09-29 - updates-never-during-jobs
- An update never installs while a job is going. Besides a running step, a job is now a step waiting to try again, a project between two steps with its next work free to start, a batch with videos still queued, a narration chunk about to be recorded again, and a schedule writing topics or due within 10 minutes. A waiting update installs by itself once idle holds for two looks in a row, so the gap between two steps never installs it. Updates still start only when you press Update.

## 2026-09-29 - thumbnail-scenes
- Thumbnails take `{{Scene}}` like image prompts: with Images → Scenes from the article on, the same AI call writes each thumbnail a scene (the article's most striking moment, a different one per thumbnail when there are three). Before, `{{Scene}}` in a thumbnail prompt reached the image model as literal text. A thumbnail prompt without it is unchanged.

## 2026-09-29 - scenes-from-the-article
- Images → Scenes from the article (a switch in Play and Edit project, off by default): one call to the project's AI model reads the article and writes every image its own scene, in slideshow order from the article's opening to its ending, so images of one prompt stop being the same picture drawn again. The scene goes where a prompt has `{{Scene}}` (never a field to fill in) or after its first paragraph; switched off, a `{{Scene}}` line is left out. Proven on a copy of a real project: 8 Early modern print images of Tiamat drawn from 8 different moments of the article, where the same prompts had made near-identical pictures.

## 2026-09-29 - render-edit-fingerprint
- An edit made while a video renders (a thumbnail redo, say) no longer fails the finished video with "Output fingerprint differs from its authorized recipe": the captions it carries are checked against the current revision too.

## 2026-09-29 - project-page-fits
- The project page fits the window: on screens 1181 px and wider the page no longer scrolls; the header stays and the section list, the open section and the status rail each scroll on their own. The article reads straight down its section (no box inside the page) with its search kept in view; YouTube's parts fold one at a time; shorts sit three across; the status rail's run, free space and cost are one line each; the "video is ready" card is no longer repeated inside the YouTube section; Live shows the finished article's state and the images in order; waveforms draw one bar per 4 px and narrow players drop the volume slider.

## 2026-09-29 - narration-retries
- A narration chunk the voice garbled or skipped is recorded again by itself. When captions find the audio no longer matches the text, Slopify regenerates that chunk (as Edit project → Narration → Regenerate would), rebuilds the joined narration, captions and video, and carries on; each chunk gets two tries before the run stops and asks you to reword the sentence. Proven on a copy of a real 2-hour project: a damaged stretch at 20:01 was caught, chunk 2 was recorded again 11 seconds later, and captions matched on the new recording.

## 2026-09-29 - autostart-per-data-folder
- Start Slopify when I log in belongs to one data folder. A second Slopify on the same account (another `--data-dir`, a test copy) now sees the switch off, can't remove the first one's login entry by turning its own switch off, and refuses to take the entry over with a plain message. Before, turning the switch off in any Slopify deleted the one entry every install shares.

## 2026-09-29 - article-off
- Article can be Off, for a project of images or a thumbnail made from prompts (no placeholder text needed). Research goes off with it, and Play refuses what reads the article (generated narration, captions, the YouTube description, shorts, the PDF, an AI-written thumbnail prompt, Scenes from the article), each with the switch to change.

## 2026-09-29 - appearance-lookup
- `{{Appearance}}` in an image, thumbnail or establishing prompt: once the article exists, one web-searching call to the project's AI model looks up how the subject and every named character look (the most iconic depiction), and each picture gets the looks of the figures its scene names (a thumbnail always the subject's). No switch; prompts without it are unchanged.

## 2026-09-28 - video-progress-work-clock
### Plain video progress, a work clock, and the extension's icon

- A running Video stage names its step and that step's own progress ("Rendering the video (82%)", "Drawing the shorts' pictures (12 of 38)") instead of a step count that grew once the shorts were picked ("10.159999999999998 of 50").
- The project page shows how long Slopify worked on the run: "Working for 9 min 30 s" while it runs, holding still while it waits, and "22 min 15 s of work" in the cost line once it ends. Only working time counts, never waits; steps side by side count once. The Cost section's times use the same measure; the old "end to end" figure added up overlapping stages.
- Home shows whole numbers in a running project's progress.
- The browser extension shows Slopify's icon.
- CI: everyday pushes run lint, typecheck, build and tests (about 4 minutes); Windows and Docker run on the release push.

## 2026-09-28 - sync-freezes-voices-layout
### Subtitles that stay in sync, no more freezes, even voices, and a tidier Play

- Subtitle timing no longer stops a video where the voice says something its own way. Years from 1000 on are read as a narrator says them ("eleven fifty seven", "eleven o four"), and a short stretch the voice says differently (a name, an abbreviation) is placed between the words around it, so the captions stay in sync. When timing does stop, the message says to listen first, and to regenerate the chunk only if words are missing.
- Slopify no longer freezes for seconds at a time during a long run: the article is no longer read again from scratch several times a step.
- Audiobooks and podcasts: every speaker's line is levelled to within 1 LU of the narrator in the audio export, the MP3 and M4B and the video, so no voice jumps out. With several speakers the single voice at the top is hidden, or labelled "Intro and outro voice" when there is an intro or outro. The text model shows in Narration when it is only needed to work out who speaks each line, and says what it is used for. The speaker split downloads as "Script by speaker".
- Making a whole stage again is a button on the stage's section ("Export the audio again", "Render the PDF again"), not a menu item behind "…".
- Play's settings sit in one grid: labels above, equal columns, every dropdown and number box the same size, image prompts in aligned columns.
- The audio player shows the narration's waveform.
- The Narration stage says when it is playing a levelled narration that an edit made outdated, and plays the new one beside it; a paused run says what it still has to make.
- The PDF's Sources page reads as text with only the web addresses as links, every one of them clickable.
- Pauses between sentences weigh numbers as they are said, skip a name's initial and never lengthen the breath between two words.
- Edit project → Prompts says when the Library's intro or outro a project copied has changed, as it already did for prompts, and offers Use the Library version or Keep this project's version.

## 2026-09-28 - schedules-latest-template
### Schedules follow their template

- A schedule runs, previews and checks its topics against its template's newest version. It kept the version it was saved with, and saving it again kept that version while the form showed the current name, so template edits never reached its runs and the Calendar named the old template.

## 2026-09-28 - regenerate-at-once
### Regenerate makes the picture at once

- **Regenerate** on an image or thumbnail, and **Regenerate all** on the Images stage, ask once with the cost and then make the new pictures straight away, without Save changes or a separate remake.
- The video keeps the old pictures, marked outdated, until you remake it, so you can regenerate several and render the video once.
- If the settings have unsaved changes of their own, the pictures are marked there instead, to go with them when you save.

## 2026-09-28 - regenerate-all-and-ampersand-subtitles
### Regenerate all, a clearer Regenerate, and subtitles with a lone "&"

- A standalone "&" said as "and" through a pronunciation alias no longer stops the video. Subtitle timing failed on it with "Local subtitles currently require an English transcript with spoken words."
- The Images stage has **Regenerate all**, beside Download all. It opens the settings with every slideshow image marked to be made again, ready to save.
- In the settings, **Regenerate image N** now shows that it worked: the image says it is made again after you press Save changes, and the button becomes **Keep image N** to take the mark off.
- Deleting every image and saving says what to do: press Discard changes to get them back, then Regenerate all, or set Images and Video to Off on Inputs. The list above the settings no longer starts each message with an internal field name.

## 2026-09-28 - pinned-comment
### A pinned comment with the YouTube description

- The YouTube description step also writes a comment to pin under the video: a thank-you, a question viewers can answer from their own experience, a pointer to the chapters and an ask for the next topic. It shows under Tags in the project's YouTube section with Copy, is editable like the other parts (edits survive a rewrite), fills `{{Link}}` placeholders, downloads as `pinned-comment.txt` and has a Copy pinned comment command.
- **Write again** beside Description writes the description, tags and pinned comment anew at once, after asking; it no longer takes Edit project → Prompts and a remake.
- Nothing becomes outdated: a description written before shows no pinned comment until it is written again.
- The same call writes two more titles for YouTube's title A/B test (Test & compare). They show as **Other titles** in the YouTube section (editable, one per line, Copy), download as `titles.txt`, and Prepare upload's Title step lists them with **Copy others**.
- Prepare upload has **Select all** above its steps.
- Several playlists per channel: Settings → YouTube Studio → **Playlists** is a list, each **On by default** or not. Prepare upload's Playlist step ticks which ones a project goes into, and the Studio extension ticks each in Studio. A playlist saved before reads as one list entry, on by default; an older extension still ticks the first.

## 2026-09-28 - new-project
### New project

- The sidebar's **New video** is **New project**, as are the buttons on Home and Projects, the `C` command and Play's page crumb: Slopify makes audiobooks, podcasts and PDFs as well as videos.

## 2026-09-28 - literata-pdf
### Literata for PDF themes

- PDF themes can use **Literata**, bundled in regular, bold, italic and bold italic: a text face made for long reading on screens, which draws symbols such as ▶ that Cinzel lacks.

## 2026-09-27 - when-something-goes-wrong
### Retries, fix-it buttons, waiting updates and Keep outputs only

- Rate limits, timeouts and dropped calls (a lost connection, a provider server error, a CLI killed mid-run) no longer fail a step: it waits about 2, 4, 8 and 16 minutes, never less than the provider's Retry-After, and runs again by itself. The wait survives a restart. Refusals, rejected keys and unsupported requests fail at once; a rejected key is no longer tried four times.
- A failed step only stops the steps that need it: a failed thumbnail no longer holds the video back, and a run whose video was made ends "done with problems" instead of failed.
- Failed steps show the button that fixes them: Sign in to Codex (with the command and Re-check), Open Settings → Providers → the provider, Free space, Switch model, Edit prompt, and Soften and retry, which has the project's AI model reword a refused image prompt and draws it again.
- Updating while a project runs waits instead of refusing: "Update to X.Y.Z will install when 'Title' finishes", then installs by itself. The Docker launcher waits the same way before it replaces the container.
- Settings → Storage splits each project's size into outputs and working files, and a finished project can Keep outputs only, freeing the space its images and narration parts took. Outputs and uploaded files are never removed.

## 2026-09-27 - voices-integration
### Multiple voices: portraits, cast voices on every start, speakers of edited captions

- The podcast and interview speaker panel shows a cast member's picture in their tile when they have one (scaled and cropped square under the lit outline); speakers without one keep their initials. Projects without pictures keep their caption and render fingerprints.
- Cast speakers take the cast's current voice, pace and pronunciations on every start path: Play, a Play batch, a schedule, and drafts sent to `POST /api/projects` and `POST /api/projects/batch` (the two API routes did not before).
- Captions edited by hand keep each cue's speaker through edits of its text and timing; new cues take the speaker of the narration under them.
- A test runs the real bundled ffmpeg over sine-tone turns: the turn join with pace and gaps, the MP3 and M4B with chapters, and a portrait laid into its panel tile.

## 2026-09-27 - voices-gemini-hosts-books
### Gemini voices, channel hosts and books

- Google Gemini is a voice provider: its 30 prebuilt voices, picked from a list in Settings → Voices, on the key saved for Google images unless it has its own. Consecutive turns of two Gemini speakers go in one two-speaker request; a third voice starts a new one.
- A cast member can be one of the channel's hosts (Channels → Cast → edit → One of the channel's hosts). A new podcast or interview on Play starts with the hosts who have a voice.
- Speakers added from the cast get an id made from the member's whole id, so two members whose ids start alike no longer share one. Speakers already saved keep theirs.
- An audiobook can be a chapter of a book (Speakers → A chapter of a book). Its MP3 and M4B carry the book as album and the chapter as track, and Projects shows "Book · Chapter N".
- Make the next chapter, on a finished audiobook's project page, opens a Play draft with the same speakers, voices, channel and settings and the next chapter number.

## 2026-09-27 - tours-walkthrough-channel-page
### What's new, the tutorial, the site's walkthrough and the channel page

- The What's new in 3.0 tour gains steps for episode memory and existing videos, long videos (more images per hour and ambient sound) and the trash bin.
- The interactive tutorial now also shows a project's Cost and Prepare upload, then Home, Channels and the Calendar. Skip generating on the Review step goes on to those screens instead of ending the tutorial.
- The walkthrough video on slopify.stream is recorded again with every step: Play, several voices, Run cost, Prepare upload and the calendar. The recording seeds the samples, a template and a schedule itself, and a test fails when the published captions no longer match the steps.
- The "How I run a channel with it" page no longer says topics are picked by hand while schedules suggest them: the schedule suggests topics and they are approved on the Calendar.
- The unused donation-link placeholder is gone from the site, the README and Settings → About; Patreon and Buy Me a Coffee stay.

## 2026-09-27 - templates-live-prompts-title-keywords
### Templates use the current prompts; titles fill keywords

- A run from a template, a schedule or a batch uses the Library's current prompt (and intro/outro) of the name the template saved; the template's own copy is only the fallback for one since deleted or renamed. Editing a prompt now reaches every template and schedule that names it.
- The project title can name keywords like a prompt, e.g. "History: {{Topic}}". Play asks for them and fills them when the run starts, as schedules already did, so one pattern works for Play, templates and schedules.
- New schedule: "Each topic fills" now offers the keyword the template's title names, even when the template was saved without a value for it.

## 2026-09-27 - a first short with no keys at all; the first run is a guided setup

- New **System voice** speech provider: narrates with the computer's own speech (macOS `say`,
  Windows System.Speech, or Piper, SVOX Pico, eSpeak NG or eSpeak on Linux), found at runtime,
  free, no key. Settings → Providers shows what was found or the fix; Settings → Voices lists its
  voices. The Docker image now includes espeak-ng.
- "Make a 60-second short" uses the system voice when no voice key is saved, and refuses only
  when neither exists, saying to install espeak-ng or add a key.
- The first-run screen is now three steps (what you have, pick a style, make your first short)
  that end with the short being made and a link to its live view; the samples and the
  start-at-login offer come with it as extras.
- Reading the first-run state (`GET /api/onboarding`) no longer writes to the database; a real
  project made elsewhere is recorded through `POST /api/onboarding/dismiss`.

## 2026-09-27 - studio-prep-three-thumbnails
### YouTube Studio prep and three thumbnails

- Thumbnails: a generated thumbnail can make 1 or 3 (Play's Thumbnail rail, Edit project → Images). Three draws the same prompt twice more with a different composition, following the establishing image when it is on. The project shows them side by side, each with its own Regenerate, and all three are in the images download. A project left at one (or saved before this) keeps its thumbnail and every fingerprint as they were.
- Prepare upload on a finished project lists what YouTube Studio asks for, in its order (video file, title, description with chapters, thumbnails, playlist, audience "not made for kids", tags), each with Copy and a done tick, for the video and each short. Settings → YouTube Studio holds the playlist name.
- The Slopify Studio browser extension (`packages/extension`, Chrome/Chromium and Firefox) fills Studio's upload dialog from the pack after the video is dropped in: title, description, thumbnails (Test & compare when found), playlist, audience and tags. It never presses Publish, and each field it can't fill gets its own message with the text copied. It pairs with Slopify through a token in Settings → YouTube Studio; only the paired extension's origin is answered across origins. Studio's selectors are unverified against the live page; see docs/studio-extension.md.

## 2026-09-27 - studio-extension-ships
### The Studio extension ships with Slopify, fills uploads one after another and never half-fills

- The Slopify Studio extension is built into the app: Settings → YouTube Studio → Install the Studio extension (and Prepare upload while none is paired) has Download for Chrome or Firefox and three install steps. The root build builds the extension before the app, which serves the zips at `/api/studio/extension/<browser>.zip`.
- Prepare upload checks whether an extension is paired. Unpaired, it shows the install and pair steps, keeps the Copy steps as the upload pack and offers Open YouTube Studio; Fill in YouTube Studio is only offered once paired.
- Fill in YouTube Studio now adds to Waiting for Studio instead of replacing the last choice: each new upload dialog is filled with the next waiting item. Prepare upload lists what waits, with Remove. The list is kept in the settings table per pairing, so a restart keeps it; items wait up to 24 hours and never travel with a backup.
- The playlist can be set per channel in Settings → YouTube Studio; a channel without its own uses the default. No migration: one settings row per channel.
- The extension checks every field the item needs before writing anything. If Studio's dialog lacks one, it fills nothing, copies the whole pack and names the missing fields. Every message with text to paste has a Copy button, with a selectable fallback when the browser refuses the clipboard.
- The extension watches Studio at most every 250 ms and stops watching while a dialog is handled.
- The test fixture's header says honestly which parts come from the live Details editor and which follow the selectors; tests now pin the upload dialog's structure as the selectors describe it.

## 2026-09-27 - storage-trash-total
### Disk space shows the trash

- Settings → Backup & storage → Disk space shows deleted projects apart: for example "256 KB in the trash (2 deleted projects), freed when removed for good", and the project files figure no longer counts them. `GET /api/storage` gains `trash: {projects, bytes}`.
- The older settings-only .zip still imports and deliberately carries no channels: nothing has written one since Export everything, which already carries channels and their cast; importing one leaves the channels here untouched.
- The architecture chapter's HTTP table now lists every route, including trash, backups, channels, reviews, Studio, onboarding and the host CLI bridge.

## 2026-09-27 - start-at-login
### Start Slopify when I log in

- Settings → General has a "Start Slopify when I log in" switch. It uses your account's own start-up list, with no administrator password or systemctl: an XDG autostart entry on Linux, a LaunchAgent on macOS, a Run registry value on Windows. Slopify starts quietly, without a browser tab, and turning the switch off removes exactly what it added.
- The login entry runs a small launcher in the data folder, never the npx cache: the installed Slopify when there is one, otherwise the version that was running, through npx. It is rewritten on every start, so it follows Node and Slopify upgrades.
- The first-run screen and the terminal (`Start Slopify when you log in? (Y/n)`) ask once; `--autostart` and `--no-autostart` answer without asking.
- In Docker the screen says whether Docker itself starts at login, as the `--docker` installer found it, and where to turn that on. Slopify never changes Docker's settings.

## 2026-09-27 - standalone-provider-calls
### Topic generation, episode summaries and cast pictures count on Home

- Topic generation for a schedule, the episode summary written when a project finishes, and a generated cast picture now go through the same retries and timeouts as a stage's provider calls; a closing Slopify or the caller's deadline still stops them.
- What each of them cost is recorded against its schedule or channel (new table `standalone_usage`, migration 0040) instead of a project; the episode summary no longer lands on the finished project's Run cost tab.
- Home's "This week" counts them in calls, spend, unpriced calls and API equivalent, the channel filter narrows them, and CLI plan windows they report update the plan standings.
- Backups carry them.

## 2026-09-27 - site-readme-2.4.0
### slopify.stream and the README catch up with 2.4.0

- The site's Features list names Shorts under Make (the best 60–120 s moments, new 9:16 images, big word-by-word captions, a title, description and hashtags each, optional music) and gains a Cut group: cuts that follow the narration, transitions, the Look, chapter cards and animated images.
- The README's Features list gains one line for the video editing: narration cuts, transitions, the Look, chapter cards and animated images.
- The showcase recording is unchanged and still shows 2.1: it was captured by hand, and the repository has no script that records it.

## 2026-09-27 - sentence-pauses
### Pauses between sentences

- New runs lengthen the quiet after every sentence to at least 0.4 s (Pause between sentences, 0 to 2 s), with an optional longer Pause between paragraphs (0 by default), set on Play's Export row or in Edit project → Pauses and volume.
- The pauses are added in the narration join, in the middle of the quiet each sentence already ends with (found by silencedetect and the text's sentence ends), never shortening a pause or cutting a word; the word timing runs afterwards, so captions, highlights, cuts, shorts, chapters and M4B marks stay in sync.
- Multi-voice scripts get them inside a speaker's turn; the turn gap stays separate. Projects made before them keep their fingerprints (stored only while set).

## 2026-09-27 - scheduled-backups
### Scheduled backups

- New Settings → Backups: back up automatically once a day at a chosen local time (03:00 by default), keep the last 1–30 backups (5 by default), in a folder of your choice. Off by default for every install, because an archive holds every video and can be many gigabytes. The screen shows the last backup's time, size and result, the next run, and Back up now.
- Backups are the Export everything archive, written by the same code (`planBackup`/`streamBackup`). The default folder is `Backups` inside the projects folder, the one folder a Docker install shares with the host (`~/Slopify/Projects/Backups`); storage cleanup leaves it alone and it no longer counts as project files.
- A once-a-minute timer runs at most one backup per day; a time missed while Slopify was off is caught up about two minutes after the next start unless a backup succeeded in the last 20 hours; failures retry hourly. Only one backup runs at a time.
- Backups never compete with a render: like Export everything they refuse to copy a project being made, so an automatic backup waits ("Waiting for … to finish"), looks again every ten minutes, and starts once those projects finish or are paused. It holds the updater's mutation gate, and a stop removes its unfinished file.
- The archive is written under a hidden `.partial` name, synced, then renamed, so a partial file is never counted. Pruning deletes only this feature's own `slopify-backup-YYYY-MM-DDTHHMMSSZ.tar` files, oldest first; nothing else in the folder is touched. Free space is checked first; every failure says what failed, why and which setting to change.
- Configuration and status live in the settings table (`backups.config`, `backups.status`); no migration. Docs: `docs/backups.md`.

## 2026-09-27 - schedule-topics-per-keyword
### Schedule topics can set any keyword

- A schedule's topics can be written one per line, as a table with a column per keyword a topic sets itself (such as its word count), or pasted as a YAML or JSON list. Switching between the three keeps every value; a list that doesn't read names the topic and keyword to fix.
- Each topic shows the project title it will make, and Copy as YAML and Export as YAML take the queue out again.
- Saving a schedule refuses a topic that names a keyword the template doesn't use, or a value over 2,000 characters, saying which topic and key. Topics saved before are left as they are.
- The calendar API gives each run its `renderedTitle`, the project title it will get (null while a topic waits for approval or generation), and the schedules list shows it beside the next run.

## 2026-09-27 - schedule-topic-generation
### Schedules find their own topics; a calendar of the coming weeks

- A schedule can carry a series brief and generate its next topics with an LLM (the template's or one you pick) whenever fewer than N are queued (default 10): queued directly, or held for approval under Topics waiting with Approve, Edit, Reject and Approve all.
- Generated topics never repeat: the prompt lists every title the schedule queued, held, rejected or used and every project's title, and near-duplicates are dropped (normalised text plus word overlap; see docs/schedules.md).
- One generation per schedule at a time; a failure is shown on the schedule with its reason and retried 5 minutes later. A Notification URL gets "N new topics are waiting for you".
- A schedule with generation on keeps going when its queue empties; a run with no topic is skipped with the reason.
- New Library → Calendar: the next four weeks by day with each run's topic, running and finished projects and the batch queue; move topics up, down or to another schedule. API: `GET /api/calendar`.

## 2026-09-27 - samples-levelled
### Samples rebuilt with level volume and sentence pauses

- The three bundled samples were spoken again on Inworld TTS-2 (6,256 characters, about $0.16) and rebuilt with Level the volume and Pause between sentences on: the Library of Alexandria is now a new run's narration (Tristan, one prepared request per paragraph) instead of an uploaded file.
- Every sample's video now measures about −14 LUFS with peaks under −1.5 dBTP, and the demos' MP3 and M4B about −18 LUFS under −3 dBTP; the audiobook's turn-to-turn spread went from 14.9 LU to 0.7 LU, the podcast's from 9.5 LU to 0.2 LU.
- The smaller encodes in the archives are mastered again with lower peaks, and made again if they still overshoot; sizes stay under the limits (23.5 MB, 9.9 MB, 8.9 MB).

## 2026-09-27 - sample-real-narration-and-paintings
### The sample speaks and is painted

- "The Library of Alexandria" now has a real narration, spoken by Inworld's stock voice Tristan, with captions timed to it by the English aligner, in place of the ambient track.
- Its four scenes, their tall versions for the two shorts and the thumbnail are painterly documentary pictures made with the Codex CLI, in place of procedural art.
- Maintainers: `build-sample.mjs --assets <folder>` builds from a folder of pre-made narration and pictures, and `src/sample-build/paint.ts` paints the pictures with the Codex CLI. Without `--assets` the build stays free and local for CI.

## 2026-09-27 - run-notifications
### Run notifications

- New Settings → Notifications section. Slopify tells you when a run finishes ("Video ready: <title>", or "Run finished" for an audio-only run), fails ("Run failed: <title> — <first line of the reason>") or stops to wait for you (a review checkpoint holds the next step, or held work waits for Resume). A pause or cancel you pressed yourself says nothing, and neither does a project that was already finished when the page loaded.
- **Browser notifications**: an Off/On toggle, remembered per browser. Permission is asked only when you turn it on, never on page load. Any open Slopify tab can notify, and only one tab notifies per change. Clicking the notification opens the project. It rides the global event stream the page already holds open, so it adds no connection.
- **Notification URL**: for when no tab is open. The server POSTs a short plain-text body (the title line and a line on what to do) to it, which works with ntfy (`https://ntfy.sh/<topic>`) and any address that accepts a POST. Only http and https URLs without a user name or password are accepted. The request gives up after 5 seconds, is never retried, and a failure goes to the log without affecting the run. The body never includes keys, and the URL is never logged and never goes into a backup.
- Each option has a **Send test notification** button; a failed test says what failed (no answer within 5 seconds, unreachable, or the HTTP status) and where to fix it.
- No schema change: the URL is one row in the existing settings table.
- Guide: `docs/notifications.md`.

## 2026-09-27 - run-flow-smoothness
### Time left on every step, a notice for flagged reviews, and fewer dead ends while a run goes

- Every running step on the project page and on Home's Running now says its time left: from its own rate once it has counted something, otherwise from how long the same kind of step took in finished runs (on the same provider and model when there are two of those), "taking longer than usual" past that, and "time left unknown" with nothing to go by. CLI image jobs that count nothing for minutes are covered by the second. `GET /api/projects/:id` carries `etaSeconds`, `etaBasis` and `typicalSeconds` on running stages (docs/time-left.md).
- Notifications: "Review needs a decision" when an automatic review flags an item and keeps it (its redos ran out, or the stage only flags), once per verdict, by browser notification and Notification URL. Every Notification URL message now ends with the project's link.
- A failed or canceled thumbnail no longer holds the PDF back: the document is laid out without a cover, and making the thumbnail again later marks it outdated. No fingerprint changes; finished projects stay current.
- Health check: for keyed providers, **Model reachable** asks the provider with the saved key about each chosen model (its model page, or the model list for OpenRouter and ElevenLabs), without generating anything. Gemini CLI's sign-in is read from `~/.gemini` (settings.json's method, oauth_creds.json, GEMINI_API_KEY) instead of always "can't check". Each provider has **Check again**.
- Start at login in Docker: the installer notes the system and, with Docker Desktop, reads Docker Desktop's own **Start Docker Desktop when you sign in** from its settings file; Settings and the first-run screen name that setting instead of `sudo systemctl enable docker`. The first-run screen shows Docker's status line. Someone who updated (no first-run screen, no terminal) is asked once in a dialog.
- Home: queued runs show as one line under Running now, with **See queued**; more than three running runs get **See all N running**. Projects has a Queued filter and opens on `?show=running|queued|waiting|ready|failed`.
- Windows: the Documents folder is read from PowerShell as UTF-8, so a non-ASCII path survives.

## 2026-09-27 - run-cost-and-plan-limits
### Run cost, CLI usage and plan limits

- New Run cost tab on every project: what the run actually cost, per stage and per model, priced from the model catalogue when each call finished, with tokens in and out (and cached), narration characters, images, video seconds and time per stage.
- CLI runs are counted too: Claude Code, Codex and Gemini calls show $0 on your plan with what the same tokens would cost through the API, and how much of the 5-hour and weekly limit the run used when the CLI reports it (Claude Code and Codex do).
- The estimate before Start prices CLI steps the same way: "$0 on your plan · ~$X via API", instead of an unknown charge.
- When a CLI's plan limit runs out, the step waits instead of failing: the project says "Waiting for Codex limits (resets at 14:00)" and carries on by itself after the reset, also after a restart. Other providers keep working.
- Claude Code's tokens in now include the prompt it read from or wrote to its cache, so the Usage page counts every input token.

## 2026-09-27 - release-2.5.0
### Slopify 2.5.0

- **Codex images, properly.** Pick the Codex model and effort for images (Ultra included). Codex may look at its image and redraw it; Slopify waits for the whole job and keeps the last image. Up to 30 minutes per image, four at once.
- **Establishing image.** An optional reference image, made first from an image prompt or uploaded, that every video image, short and (optionally) the thumbnail follow for consistent characters, palette and style. It is never shown in the video. Works with Codex, OpenAI, Google and fal.ai's FLUX.2 and Nano Banana models.
- **Notifications.** Browser notifications and an optional Notification URL (ntfy works) when a run finishes, fails or waits for you.
- **Automatic backups.** Settings → Backups makes a full backup every day at a chosen time and keeps the last few.
- **Shorts music in Play.** Background music for shorts can be added when starting a run.
- **Play and schedules.** The review refreshes itself after an edit, so Start/Queue no longer stays grey. The project title fills its keywords, runs use the Library's current prompts, extra videos don't get "2"/"3" appended to keyword titles, and New schedule offers the title's keyword for topics.
- **Fixes.** Cancelling a CLI step now always stops the CLI. Old duplicate queued steps are removed. The site and README list Shorts and video editing.

## 2026-09-27 - provider-setup-and-model-upkeep
### Key setup, provider health check, self-updating models and a no-key first run

- Settings → Providers: every key field has a step list (sign-up page, key page, billing, permissions, all on the provider's own site) and a **Test** button that makes the cheapest harmless authenticated call and says in plain words whether the key works and what to do if not.
- **Check all** checks every CLI (installed, up to date, signed in), every saved key, and that every chosen model is still offered, with a fix for each problem.
- The model catalogue checks itself at start and daily: new models appear, prices follow the published list and OpenRouter's live prices, and retired models are flagged instead of disappearing. Local edits are kept. **Check now** runs it by hand.
- Settings → Models lists every template, schedule, draft and unfinished project still using a retired model, with **Switch to <model>** per row and **Switch all**. Nothing is switched without a click.
- First launch finds Claude Code, Codex and Gemini CLI, picks them on Play and says "You can make a video now, no API keys needed". `GET /api/providers/first-run` exposes what was found.

## 2026-09-27 - prompt-history-description-edits-reading
### Prompt history, editable YouTube descriptions, reading view and visible Library actions

- Library prompts and intros/outros keep a version for every save. History shows two versions side by side with the changed words marked, restores any version as a new one, and lists the templates, schedules and projects (with revision counts) that use it. Existing ones start with their current text as version 1.
- Library rows show Edit, Duplicate, Use in Play, History and Delete instead of a menu. Use in Play opens Play with the prompt or intro/outro picked.
- The YouTube summary, chapters, hashtags and tags can be edited on the project page. A regenerated description keeps your edits and offers the new text with Use it / Keep mine / View diff.
- Settings → Channel links: `{{Patreon}}`-style placeholders in descriptions fill from named links when shown or copied; a project can set its own Previous video. Placeholders without a link are highlighted, never dropped.
- The article, research notes, sources and narration text read as a proper reading view with contents, search and copy-as-Markdown per section.
- Database migration 31 adds the version history and the description edits; project backups include the edits.

## 2026-09-27 - project-page-next-action
### The project page, redesigned around one next action

- The project page is a workspace: a section rail on the left (Article, Narration, Images, Video, Shorts, YouTube, PDF, Cost, Live, then Settings, Checkpoints and History), the section in the middle, and on the right the next action, the run's steps with their times, and the cost so far with each plan's share.
- Resume, Retry stage, Re-run section, Rebuild affected outputs and the other overlapping buttons are gone. The project shows one action named for its result, only when it applies, in the right rail and beside the thing it affects: Continue the run, Approve and render the video, Remake 3 outdated images, Try images again (or the fix: Soften and retry, Switch model, the provider's settings), Pause, Prepare upload, Make my own copy. Waiting for limits shows no button, only when it carries on.
- Remake 3 outdated images remakes exactly those, starting at once when nothing needs your consent; the full rebuild review is Choose what to remake in the More menu.
- The rebuild review is compact: counts per kind of work and the cost up top, what Start still needs beside Start, the changed inputs, work items and cost rows folded away. CLI work reads "$0 on plan · ~$X via API" instead of an unknown cost.
- Images, thumbnails and the establishing image are media frames with review badges, Overrule and Redo, and open full size in the lightbox; the video plays in a real player; shorts are vertical players in their own grid. An outdated image is marked Outdated.
- Making a whole stage again (Write the article again, Make all images again, Render the video again) sits behind each section's More and asks first.
- Every project action is in the command palette (Ctrl+K), including Regenerate image N, Remake outdated, Copy description, Prepare upload, Open the project folder, and Pause or Continue the run.
- The app rail no longer ends at the first screen on long pages.
- Messages that named Retry stage, Re-run section, Resume or Rebuild affected outputs now name the new controls.
- Edit project: Add from the cast in the speakers panel (the project's channel), voices filtered by the project's language, ambient sound (Rain, Fireplace, Wind or None), More images for long videos (saving adds the images and keeps every existing one), and a style preview drawn on the establishing image or the cast picture, as on Play.
- Editing a caption's text or timing keeps who says it on a multi-voice run.

## 2026-09-27 - See it before you make it, the short first, reviews and schedules gaps
key: feat/preview-short-first-reviews-schedules

- Style preview: plays six seconds of the bundled sample project's narration over three of its images (landscape or portrait), with the captions timed to the narration's word timing; a typed sample text is spread over the stretches the narration speaks. The establishing image or cast picture still wins when there is one. Saved previews from before are not reused (preview recipe version 2); project fingerprints are unchanged.
- Shorts preview: under More shorts options on Play and Edit project → Shorts, a 9:16 preview rendered through the Shorts renderer with the caption font, the title on screen and the speed.
- A finished short's next action is Make the full video on this topic: Play opens on a long-video draft with the same topic, starter pack (its template) and providers (`POST /api/onboarding/full-video`).
- Topic generation compares suggestions only with the projects of the schedule's own channel, and a topic of one or two words must match a clause of a title near exactly instead of merely appearing in it.
- Edit on a held topic sets the template's other keywords for its run, checked like the queue's; they go with it into the queue on approval.
- Overrule on a review whose automatic redo is still waiting to start calls the redo off and accepts the item; one already started is still refused.
- Integration tests for the article, narration (the spoken text), thumbnail and shorts reviews, and for Overrule calling off a pending redo.

## 2026-09-27 - play-shorts-music
### Shorts: background music from Play

- Play's Shorts row can now start a run with background music: attach an audio file under Outputs → Export → More shorts options → Background music. It uploads like the narration file, is copied into each new project when the run starts (every video of a batch gets its own copy), and is the same music Edit project → Shorts shows, replaces or removes later. The row's summary and Review name the file.
- The music is only used while Shorts is on; turning Shorts off keeps the file on the draft for when it is turned back on.
- A music file that is still uploading, failed, or is gone holds the run with a sentence that names the file and where to attach it again or remove it.
- Saved as a template, the music is kept by name and attached again on Play, like supplied narration and images. A template made from a project with music names it "Music from project". Scheduled runs cannot attach files, so a template whose shorts use supplied music is refused for a schedule with a sentence that says so.

## 2026-09-27 - play-review-refreshes
### Play's review refreshes itself

- Play checks the setup again by itself a moment after an edit (a keyword variation, the expected words, returning to the window), so Start run / Queue videos is no longer stuck grey until Refresh review is pressed.
- Adding a keyword variation no longer appends " 2", " 3" to a title that already uses keywords such as `{{Topic}}`.

## 2026-09-27 - play-queue-count-guard
### Play starts exactly the videos its button counts

- Play's Start button now counts the videos from the same reviewed receipt that Start runs, so "Queue 3 videos" can no longer start a single video. If the review of the saved draft covers a different number of videos than the page shows, Play says so ("The saved draft has 1 video, but this page shows 3…"), saves the page again with its keyword variations and asks for Refresh review before Start.
- The server refuses a Start that would create a different number of projects or queue entries than were reviewed; nothing is created, the draft stays editable, and the person is asked to review again.

## 2026-09-27 - play-one-path
### Play: one path from topic to queue

- Play opens on Template and Topic. A title that names `{{Topic}}` asks for the topic and shows the title it makes; more topics are chips under "More videos from the same setup" (they replace the keyword variations drawer, same variants and the same queue-count guard).
- Everything else is folded into summary rows (Title and keywords, Article, Narration, Images, Video and style, Outputs, Reviews, Channel) with Change opening the stage's editor in place; rows that need attention start open. Reviews, checkpoints and the whole setup open in a side panel.
- The right rail holds the style preview, the videos count, the estimate (refreshed once typing pauses) and the Play key. When it can't start, the reason sits right under it and goes to the field.
- A real style preview: six seconds rendered locally at low resolution with the captions, the Look, transitions and a chapter card, from sample stills and silence (no provider is called), cached by the settings. In Play's rail and Edit project → Subtitles, with Render again.
- One keyword list, each keyword with what it feeds, in Play, Edit project → Prompts and Templates → Keywords.
- Save as template from Play. Templates never store one-off values: keywords the title names are saved empty, other keywords keep their values, extra videos are dropped, on every template save. The dialog says what is left out.
- Play sets a per-run silence between segments (empty uses Settings), as Edit project does. The Play and Edit project audit is in `docs/play-and-edit.md`.
- Ctrl+K offers Start or Queue, Add a topic, Save as template, Review the whole setup, Pick a template and Change for each row.

## 2026-09-27 - play-editors-estimate-voices
### Play: kit editors, a shorter estimate, real style previews, and voices in the project language

- The editors under Play's setup rows use the 3.0 kit's fields and spacing, and no longer repeat the row's name: Article, Narration, Images and Video and style start at their Source switch.
- The estimate in the right rail shows the total; the price of each stage, what it assumes and the catalogue date fold under **Cost by stage**.
- The style preview is drawn on the draft's uploaded establishing image, or a picture of the channel's cast member the title names (else the first one with a picture), and says which. Without one it uses the sample stills as before.
- The Cuts control follows a language inherited from the channel: a channel in a language without word timing now cuts every N seconds on Play too.
- Each speaker's voice list on Play and a cast member's voice list in the channel show the voices of the project's language, with **Show all voices** for the rest.
- Play's tests start from a complete draft, open only the row they need and save at once instead of waiting for the autosave, so they run about three times faster and no longer time out under a full test run.

## 2026-09-27 - picked-up-by-others
### Being picked up by others: walkthrough, donation link, channel page, site restyle

- The site's walkthrough video is recorded by a script (`npm run record:walkthrough -w @slopify/site`, [docs/walkthrough.md](../../walkthrough.md)): a demo project seeded from locally made placeholder media, the built app run natively on a random port against a temp data directory, Playwright at 1920x1080 over one list of steps, and an ffmpeg cut to `play-run.mp4` (faststart), its poster and step captions. No provider is called. The published recording is replaced (18.7 s: finished project, description, a short, Play); Run cost, Prepare upload and the calendar join it once their screens exist.
- A donation link on the site, in Settings → About (new section) and in the README, driven by one value that is still the placeholder `https://example.com/donate`: while it is, nothing renders a link. The maintainer must supply the real page.
- New page `channel.html`: how a lore channel runs on Slopify, linked from the home page. Anything from 3.0 on it is held back until release.
- slopify.stream restyled to the 3.0 design system (tokens, type scale, buttons, lamps, media frame). The 3.0 features are written into the Features list inside an inert template, shown only once `nextReleasePublished` in `main.js` is true.

## 2026-09-27 - patch-notes
### Patch notes inside the app

- New Settings → Patch notes: the newest release's notes open in the reading view (contents, search, copy); older versions are folded under Earlier versions and each opens on its own. Also reachable from Ctrl+K (Show patch notes) and Settings → About (What's new in this version).
- After an update, the new version's notes open by themselves once, in a drawer. A fresh install does not see them, a version without notes of its own opens nothing, and closing them is remembered per install (`patchNotes.seenVersion`, left out of backups).
- On a major update the What's new tour shows instead; closing it also closes the notes, and its last step has Read the full patch notes. The two never show together.
- The notes are Markdown in `docs/patch-notes/` with an `index.json`, copied into the build and served by `GET /api/patch-notes` and `GET /api/patch-notes/:id`. `node scripts/patch-notes.mjs <version>` drafts a release's notes from the changelog fragments since the previous tag.

## 2026-09-27 - other-languages
### Projects in other languages

- A **Language** picker on Play, in Edit project and on a channel's brand kit (the language of its new projects); templates keep the language their draft had. English projects are unchanged and are not re-run.
- The article, narration preparation, YouTube description, chapters, tags, Shorts titles and multi-voice scripts are written in the project's language: Slopify adds one line after your prompt and never edits the prompt itself.
- Captions in Spanish, German, French, Italian, Portuguese, Dutch, Catalan, Polish and Czech are timed word by word with a free multilingual model (248 MB, Apache-2.0), downloaded the first time a project in one of them makes captions, with numbers spelled in the language. Other languages are timed sentence by sentence, with word-by-word Shorts captions and cuts that follow the narration turned off, and the project page says so.
- Voices carry the languages they speak: asked of ElevenLabs, Cartesia and Inworld when a voice is added, or typed in Settings → Voices. Play lists the voices for the project language, with Show all voices, and warns when the chosen voice is listed for another language.
- The pronunciation glossary accepts full IPA in other languages, and captions fall back to a bundled Noto Sans font (Latin, Greek, Cyrillic, Arabic, Hebrew, Devanagari, Thai) when the chosen font lacks the language's letters.
- `scripts/validate-multilingual-alignment.mjs` aligns a local recording against its text and prints the timing quality.

## 2026-09-27 - refactor: one theme, one grid, no card inside a card
key: refactor/one-theme-one-grid

- Every use of the 2.x token names (`bg-panel`, `text-ink2`, `text-red`, `rounded-panel`, `--color-shadow`, ...) now uses the 3.0 tokens, and the aliases are gone from `styles/index.css`; `styles/tokens.test.ts` fails if one is defined again.
- slopify.stream's `:root` tokens are checked against the app's: `packages/site/tokens.test.js` fails when a shared value differs, dark or light. The app's mono stack gained the site's fallbacks so both match.
- Hand-set pixel spacing outside the kit is snapped to the 4px grid, and `styles/grid.test.ts` rejects `p-[Npx]`, `gap-[Npx]` and friends outside `components/kit`.
- No card inside a card: the old `components/rail.tsx` (RailGroup) and the unused `components/tally.tsx` are deleted; their lists are kit List rows, and the batch queue, Play's Start panel, live writing and live narration, the Library editors and the font picker sit on the page with hairlines and space. The aliases load error is a kit Callout.
- Wider screens use the width: Welcome in two columns with PageHeader, Channels beside a summary of the picked channel, Projects beside counts per state and the video queue, template keywords beside the template list, aliases beside how they are used, and Usage in two columns.

## 2026-09-27 - narration-reads-like-speech
### Narration that reads like speech

- New setting "Describe tables and figures in the narration" (Play → Audio Advanced, Edit project → Providers), on by default for new runs and templates. Tables, figures, Mermaid and ASCII diagrams, equations and code blocks are each described in a short spoken passage by the run's text model instead of being skipped or read cell by cell; "Leave code out" drops code instead.
- Lists are spoken as sentences ("First, … Then, … Finally, …"), blockquotes as quotes, and footnote markers and bare URLs are no longer spoken.
- Each description is its own cached step (`narration:describe:<n>`), written in the project language with the Narration Preparation prompt as style guidance; a figure's own picture is shown to Claude Code and Codex when the project has it as an uploaded image.
- Captions and word timing follow what is spoken; the article, PDF and reading view keep the real table. On multi-voice runs a table inside a turn is described in that turn's voice.
- Estimates add one text-model call per described block. Projects saved before the setting keep every fingerprint.
- New setting "Show tables and figures on screen" (Play → Video, Edit project → Video), on by default with describing: every described block is drawn as a card on this computer (the article's own picture for a figure; a grid, monospace code or typeset equation in the brand kit's title font and colour otherwise) and shown in the video exactly while its description is spoken, with the images taking turns around it. Shorts that include a description show the card upright. Cards are listed under Images → From the article and can be made again.

## 2026-09-27 - narration-aliases
### Narration aliases

- Library → Aliases: words the narrator says differently from how they are written (`Dr.` as `Doctor`), each with Whole word and Match case, saved as one ordered list (database schema 35, carried in backups).
- Use narration aliases in Play (on for new drafts) and Edit project, for any generated voice. A project copies the Library's aliases when it starts; Update from Library in Edit project copies them again.
- Aliases change the text sent to the voice and the sentences Narration Preparation reads; the article, narration text and captions keep the written words, and caption timing matches written words to their aliased speech.
- Projects from before aliases, and projects where no alias appears in the text, keep their fingerprints and are not rebuilt.

## 2026-09-27 - narration-aliases-integration
### Narration aliases in dialogue, single spaces, skipped speaker pronunciations

- Narration aliases now reach native multi-speaker requests (ElevenLabs Text to Dialogue): every turn in the request is aliased on its own, the transcript keeps the script's wording, and the request's 2,000-character limit counts the aliased text.
- A multi-word alias (`et al.` → `and others`) no longer leaves two spaces in the text sent to the voice; the whitespace in front of the alias's later words goes with them.
- Multi-voice runs can store their turn requests: the stored work-piece schema now accepts each request's speaker, turn and dialogue lines, which it rejected before.
- Speaker pronunciation rows that are skipped (bad notation, sounds the project's language doesn't use) are named on the Speakers panel as you type, with the entry numbers, the reason and where to fix them, and listed in the rebuild review for speakers on Inworld TTS-2 voices.
- Projects that use multi-word aliases, or aliases in native dialogue turns, see those narration parts as changed once, because the text sent to the voice is now different.

## 2026-09-27 - multiple-voices
### Multiple voices: audiobook, podcast, radio drama and interview

- Audio → Speakers (Play) and Edit project → Providers → Speakers pick the format and the speakers: name, role, voice, pace and pronunciations, with a priced Audition button that speaks each speaker's first line only when clicked.
- Cast members can have a voice (migration 0034); Speakers → Add from the cast casts them, and each new run takes the member's current voice, so recurring hosts and characters sound the same in every episode.
- A new Script prompt kind (migration 0034) writes speaker turns; an audiobook can instead have the text model split its article into speakers, checked to keep the text's words.
- Narration is one request per turn in the speaker's voice (ElevenLabs Text to Dialogue for consecutive eleven_v3 turns), joined with a gap between turns at each speaker's pace; changing one speaker's voice remakes only their turns.
- Captions carry the speaker (colour, optional name tag, VTT voice spans), never mix two speakers, and podcasts and interviews get a burned-in speaker panel; shorts start and end on turns.
- The Video stage can also make an MP3 and an M4B with chapter markers from the script's sections.
- Runs in the Narration format are unchanged: no recipe, fingerprint or file of theirs moves.

## 2026-09-27 - media-looks-like-media
### Media looks like media

- Videos play in Slopify's own player instead of the browser's: the poster and a big play key, then a bar with play, time, a lime track you can click or drag (buffered range, a time tip, chapter marks), volume, speed from 0.75× to 2×, captions, picture in picture and full screen. The bar hides while the video plays. YouTube's keys work: Space or K, J and L, the arrows, M, F, C and 0–9.
- The finished video shows the first thumbnail until it plays, and its YouTube chapters sit on the track; each short shows its first still; the style preview shows the picture it is drawn on.
- Every gallery (images, thumbnails, shorts, cast pictures, the Live tab, Home's running run, Prepare upload) uses the one media grid.
- Pictures open full size everywhere: cast, cast pictures, Prepare upload's thumbnails and Home's running run. At full size, images and thumbnails keep Regenerate and Download.
- Image previews in Edit project, History and the Live tab sit in the same rounded media frame.

## 2026-09-27 - level-the-volume
### Level the volume (loudness normalization)

- Every narration piece (a chunk, an intro or outro part, a speaker's turn) is measured with loudnorm and brought to −20 LUFS by one fixed gain (a 192 kHz limiter holding any peak over −2 dBTP) before the pieces are joined, so voices and requests no longer jump in loudness; the Narration section says what it did ("the spread was 16.6 LU, now 0.2 LU").
- The long video and the shorts are mastered to −14 LUFS (peaks under −1.5 dBTP), the audio-only WAV and the MP3/M4B to −18 LUFS (peaks under −3 dBTP), measured on the finished files; the ambient bed and shorts music stay ducked under the levelled voice.
- Volumes are set in dB from the recommendation or as a percentage (−10 dB to +4 dB) in Settings → General (the default for new runs, on), Play's Export row and Edit project → Pauses and volume.
- The levelled narration is its own join beside the plain one (`level:*`), so turning it on in Edit project makes no speech, word timing, description, shorts pick or review again; projects made before it keep their fingerprints (the setting is stored only while on).
- Uploaded narration is never re-levelled; only the exports' master reaches it while the setting is on.

## 2026-09-27 - host-bridge-usage-limits
### Run cost and plan limits through the Docker host bridge

- The host CLI bridge now carries cached input tokens, the answering model and the plan windows (Claude's `rate_limit_event`, Codex's `account/rateLimits/read`) on the `done` frame, so Run cost and the plan-limit share work in Docker like they do natively.
- The helper now asks the host's Codex for its plan windows before and after each Codex text and image call, as the app does without Docker.
- Codex images report their tokens and plan windows in an `x-slopify-image-report` response header.
- Backward compatible both ways: the app asks with `x-slopify-frames: 2` and the helper only sends the new fields when asked (older apps read frames strictly); the app reads frames leniently and treats missing fields as "not reported". The health protocol stays 1. Documented in `docs/docker.md`.

## 2026-09-27 - home-calendar-screens
### Home, the calendar and the 3.0 screens

- Home (`/`) shows what needs you (a held review you can approve there, a schedule's suggested topics, a failed run with the one thing that fixes it), what is running with its steps and images as they land, the next seven days, the finished videos not marked uploaded, and this week's videos, spend, API equivalent and plan limits. The projects list moved to `/projects`.
- **Mark uploaded** on Home and in Projects takes a finished video off Ready to upload (migration 0037, carried in backups). The project list now says each project's channel and upload mark.
- The calendar is its own screen at `/calendar`: four weeks Monday to Sunday or a list, drag a topic to another day or schedule (or Alt+arrows, or the list's buttons), Add to calendar, and the suggested topics beside it with Queue, Reject and Queue all.
- The channel picker in the rail filters Home, the calendar and Projects.
- Projects, Library, Channels, Schedules, Settings, Templates, Prepare upload and Run cost follow the 3.0 design: page headers, visible row actions, no box inside a box. The project page uses the kit reading view.
- A schedule's suggested topics now also show as a browser notification, which opens the calendar.

## 2026-09-27 - help-tutorials
### Help → Tutorials, inside the app

- The wiki's 49 tutorial pages live in the repository (`docs/wiki`) and ship with the app like the patch notes, so **Help → Tutorials** (`/help/tutorials/<Page>`) reads offline and always describes the version that is running. The book button beside the tutorial launcher opens it.
- The page shows the wiki sidebar's groups beside the page in the reading view (contents, search in the page, Copy section), a search across every page that lists the matching sections, and the wiki's own links kept in the app with their sections.
- Ctrl+K has **Open tutorials** and **Open tutorial: <page>** for every page.
- Every info button's help ends in **Learn more**, which opens the tutorial section that explains it; a test checks each linked page and heading exists.
- `scripts/wiki-sync.mjs <wiki checkout>` copies `docs/wiki` into a clone of the GitHub wiki, for review and push there.
- The pages were brought up to date with this release: the sidebar, whole-row clicks, one Download per stage, the players, the command palette, limit waits and fix-it buttons, the first run, voices, hosts and books, previews, schedules, the Studio extension and more.

### Words that match the screens

- Messages, help and guides name controls where they are: pauses, Level the volume and ambient sound under Play's **Video and style**, Speakers and **Audio Advanced** under **Narration**, the YouTube description switch under **Edit project → Prompts**, fonts through **Upload font** in the caption font picker, and recovery's **Check again**, **Try … again** and **Edit the prompt**.
- The README and CLI help say the native `update` needs Slopify running, and that new installs keep files in Documents/Slopify.
- Template names share one 120-character limit on Play and in Library → Templates.
- Help for the first short, style packs, Narration Preparation (per-speaker cues on TTS-2) and a channel's intro and outro (each narrated, one voice request) matches what they do.

### Fixes

- A style pack used by the first short still offers **Add pack** for its Play template; Added now means its prompts, voice and template are all in the library.
- The narration row shows its length once, in the player.
- An editor's Cancel and Save bar no longer hides a heading such as the document theme's Fonts, and on phones it sits above the bottom navigation.

## 2026-09-27 - glossary-skipped-entries
### Pronunciation Glossary skips bad entries

- A glossary entry narration can't use (non-English sounds, ARPAbet, a word-count mismatch, a second different pronunciation, an unreadable line) is now skipped and read as ordinary text, instead of blocking every narration request of the project.
- Table glossaries whose IPA column has no slashes (`| Cleopatra | kliːəˈpætrə |`) are read as IPA.
- The article's Pronunciation tab and the rebuild review list the skipped entries by number and reason, never their text.
- The Use Pronunciation Glossary help says what to ask the article prompt for: slash-delimited standard-English IPA and English approximations for foreign names.
- The rebuild review folds its per-item list into a summary with counts, shows every blocked item's reason (grouped) above Start rebuild, and says next to the button what still keeps it off.
- Projects whose glossary was already valid keep their fingerprints and are not rebuilt.

## 2026-09-27 - first-five-minutes
### The first five minutes

- A first-run screen (`/welcome`) shows the agent CLIs found on the machine, "Make a 60-second short", the sample and the starter packs; Skip, or a first real project, hides it for good.
- Make a 60-second short: a topic becomes a short-mode project (9:16, ~150-word script, narration, 4 images, word-by-word captions through the Shorts renderer) with the CLIs picked for text and images and a keyed voice. Long videos' fingerprints are unchanged.
- A bundled, read-only sample project (The Library of Alexandria: video, two shorts, article, PDF, description, images) is imported on first launch; Make my own copy clones it into an ordinary project with nothing to rebuild, and Settings → Backup & storage → Restore sample brings it back.
- Four starter packs (Sleep lore, True crime, History, Science explainers) add prompts, a suggested voice and a template, from the first-run screen or Library → Templates → Add pack, without ever replacing your own items.
- A Live tab on the project page shows the steps, the article as it is typed (Claude Code and Codex now stream partial text), images as they land and the narration waveform growing piece by piece.

## 2026-09-27 - files-in-documents
### Your files in Documents

- New installs keep projects, scheduled backups and exports in `<Documents>/Slopify` (Windows' Documents known folder, OneDrive included; `~/Documents` on macOS; `xdg-user-dir` on Linux). The database, settings, models and logs stay in the hidden data folder.
- Existing installs keep their folders. Settings → Backup & storage → Your files shows where they are, with Open folder, Move to Documents/Slopify and Choose another folder: every file is copied and checked by size and SHA-256 before Slopify switches, the old folder is kept, a move refuses while a project runs and continues where it stopped after an interruption.
- New Docker installs mount `<Documents>/Slopify/Projects` and `Backups`; `update --docker --projects-dir documents` moves an existing one there.
- Storage cleanup never removes loose files, hidden files or `desktop.ini` from a Projects folder outside the data folder.

## 2026-09-27 - fewer-clicks
### Fewer clicks: inline topics, inline rename, one keyword list

- Calendar → Schedules: the picked schedule's **Queued topics** can be added, renamed, moved and removed in place; each change saves at once with **Undo** on its notice, and only the queue changes (new `PUT /api/schedules/:id/topics`; the next run and other settings stay).
- Library → Prompts, Intros & Outros and Templates: the pencil beside a name renames it in the row, with Undo. The text stays as it is; a prompt's rename is one History version, a template's a new template version.
- The schedule form's every-run keywords use the shared keyword list with its "Feeds …" line, like Play, Edit project and templates.
- A finished project whose YouTube description is written opens on the YouTube section, so Copy description is one press.
- Toasts can carry one action button (used for Undo).
- `click-budget.test.tsx` counts the clicks of five common tasks against their budgets; the table is in docs/design-system.md under "Fewer clicks".

## 2026-09-27 - feat: the calendar shows what needs you, limit waits everywhere, fix-it buttons, free space per project
key: feat/every-day-after

- Calendar: each project carries what it needs from the person (failed, paused, a review checkpoint or a failed automatic review) and whether its video is ready to upload; a Needs you list above the weeks acts on them (Open to fix / continue / review, Prepare upload). The batch queue is only on the calendar now (numbered, paused shown); Projects no longer repeats it. Edit schedules still opens `/schedules`.
- CLI limits: the project listing and the calendar carry `limitWaits`; the project page, Home's Running now, the Projects row and the calendar all say "Waiting for Codex limits (resets at 14:00)".
- Fix-its: a signed-out CLI gets Copy sign-in command and Check again, which probes that CLI alone (`POST /api/providers/health?provider=`) and retries the step once it is signed in. Schedule topic-generation failures and cast picture failures get the same fix-its; Home's Needs you copies the sign-in command.
- Storage: a finished project's page offers "Free 1.2 GB: keep the outputs, drop the working files" with a confirmation (`GET /api/storage/projects/:id`); hidden for bundled samples, running or waiting projects and when nothing is left to drop.

## 2026-09-27 - every-control-explains-itself
### Every control explains itself

- Every setting, option, toggle, select, number field and non-obvious action now has an info button beside it: press it (or Tab to it and press Enter) to read what it does, when to change it, the default, and what it costs or slows. Esc closes it; it works on touch.
- All the help text lives in one catalogue, so the same control is explained the same way in Play, Edit project, templates and schedules.
- Covers Play, the project page and every Edit project section, Library, Templates, Schedules, Calendar, Channels, Settings, Prepare upload, Run cost, Home and the welcome steps.

## 2026-09-27 - edit-project-images-channel
### Edit project: image prompts, Numbers and the channel

- Edit project → Images has Play's image prompt control: tick or untick prompts and change how many images each makes. It says what saving will do ("Saving adds 2 images to make and removes 1"). On save the images are planned again: a prompt left as it was keeps every image it has, a raised Number adds images after the prompt's last one, a lowered one drops its last ones, and an unticked prompt's images go. Only the new images are made when you remake outdated outputs.
- Edit project → Inputs → Channel moves a project to another channel and switches "Use the channel's brand kit". Saving takes the new channel's cast as it is now and applies its brand kit again, as Play does when a run starts: settings left at their default or set by the old kit take the new kit's, ones you set yourself stay. The project then shows under its new channel on Home, the calendar and Projects.
- A run started with the brand kit off now remembers it, so Edit project shows the switch as it was. Projects with the kit on save the config they always did.
- The rebuild review no longer lists work done by Claude Code, Codex or Gemini CLI as an unknown cost: a step whose request is built when it runs (the article after new research, the thumbnail prompt, intros and outros written by the model, Narration Preparation) shows $0 on your plan with what it would cost through the API, as Play's review does, and no longer asks you to tick "I understand the costs are unknown" for it. Their API figure is read from the whole catalogue now, so it shows in the rebuild review too.
- Edit project's settings follow the 3.0 design: labels above fields, two columns on desktop, groups separated by a hairline instead of boxes, and notices as callouts with the fix as their button.

## 2026-09-27 - drop-duplicate-held-work
### Leftover waiting copies

- Updating clears the extra waiting copies that saves made before 2.4.0 left behind: for each step the project keeps the row a save would now reuse (the finished result if there is one, otherwise the newest waiting copy), and removes only other waiting copies of exactly that step that never started. Versions that pointed at a removed copy point at the kept waiting one. Finished, running and failed work, admitted work, files and the last row for a step are never removed, and a waiting copy that a saved version still uses beside a finished result is left as it is (database migration 0022).

## 2026-09-27 - docker-compose-install
### One compose file, one install command, one update command

- Docker now runs from a single `compose.yaml` (shipped in the package, copied with a private `.env` to `~/.local/share/slopify/docker/<name>/`): one service, the external `slopify-data` volume, your Projects folder, the host CLI bridge folder, `restart: unless-stopped`, port on 127.0.0.1 only.
- `npx @gentbajko/slopify --docker` installs or re-applies settings; `npx @gentbajko/slopify@latest update` updates, Docker or native. The image tag is pinned to the installer's release.
- Docker updates wait for running work, keep a verified recovery copy of the data volume (only the newest is kept), and put the previous container and data back automatically if the new version doesn't answer. A cut-off run is undone first on the next run.
- Installations from 2.5.0 or earlier are taken over in place: same volume by name, same project folder; the stopped `slopify-previous-*` containers the old launcher kept are removed after a successful update. An unfinished 2.5.0 update is refused with the command to finish it.
- Native `slopify update` drives the running app's own updater, the same path as the Update button.
- Removed the layered launcher (bash entry, flock wrapper, journal/claims/recovery engine); `docs/docker.md` documents the host CLI bridge protocol, auth and lifecycle.

## 2026-09-27 - implement: 3.0 design system foundation
key: implement/design-system-foundation@2026-09-27
- Tokens: `styles/index.css` carries the 3.0 palette (ground, surface, raised, sunken, screen, line, line-strong, ink 1-3, accent family, waiting, danger, info with tints, scrim), type scale, radii, per-theme shadows and the 8px grid; dark default, light via prefers-color-scheme or the Appearance setting. 2.x names stay as deprecated aliases; `text-accent-ink` uses moved to `text-on-accent`. JetBrains Mono added through @fontsource.
- Components: `styles/kit.css` ports the design system's bundle.css; `components/kit` gains Button/IconButton/PlayKey, Field/Input/Select/Textarea, Switch, Segmented, Status/Lamp/Badge/Chip, MediaFrame/MediaGrid/Lightbox, Player, Rail, Steps, NextAction, Callout, List/ListRow, Stats/Meter/DataTable, CommandPalette (`useCommand`, Ctrl+K), Dialog/ConfirmDialog, EmptyState, ReadingView and layout primitives (PageHeader, Workspace, ListDetail). Tabs, SectionHead and Toast restyled in place; the shadcn Button and Dialog render the kit classes, so every screen picks up the new look.
- Shell: 232px left rail with the palette button, six destinations, a channel picker slot and the New video key; thin top bar; full width to 1680px; bottom bar of five on phones. Home and Channels point at existing screens until their routes land.
- Dev-only `/design` gallery shows every component in every state with a theme switch; it is left out of production builds.
- Docs: `docs/design-system.md`.

## 2026-09-27 - demo-projects
### Audiobook and podcast demos, and delivery cues for speakers

- Two more bundled, read-only samples beside The Library of Alexandria: an audiobook of the opening of *The Wind in the Willows* (narrator and two character voices, speaker-tagged captions, MP3 and M4B with chapters, a short) and a two-host podcast on the Antikythera mechanism (speaker panel with painted portraits, name tags, MP3 and M4B, a short). Both are spoken by Inworld stock voices and painted by the Codex CLI.
- All three are seeded on first launch (an install that already has the first gets the demos once), marked Sample, shown on the first-run screen ("See an audiobook", "Hear a podcast"), copied with Make my own copy with nothing to rebuild, and brought back together by Settings → Backup & storage → Restore samples.
- Narration Preparation now works for multi-voice runs: each turn of a speaker on Inworld TTS-2 gets delivery cues (Inworld's bracketed directions and non-verbal sounds) suited to who says it, while captions and word timing keep the clean words. Runs without the prompt are unchanged.
- Fixed: a multi-voice run whose script or speaker split was written by the text model failed to store that step (its recipe carried a field the store refused).
- `build-sample.mjs --demo <audiobook|podcast>` builds a demo through the real pipeline; `paint.ts --demo` and `voices.ts --demo` make its pictures and voices, and without `--assets` it builds with tones and procedural art for CI.

## 2026-09-27 - cost-keys-and-reading
### Channel links per channel, downloads as shown, nested contents, key tests and retired-model flags

- Each channel keeps its own named links under Channel links on its Brand tab; `{{Patreon}}` and `{{Previous video}}` fill from the project's channel. Links saved in Settings → Channel links before still fill the default channel's projects until its Brand tab is saved, and they travel in backups with the channel.
- The youtube-description and youtube-tags downloads are the text as the page shows it: hand edits, fitted chapters and filled links, as Prepare upload already used.
- The reading view's contents follow the two highest heading levels the text uses (`#`, `##` or `###`), the second indented; a lone `#` title stays above the list.
- Test in Settings → Providers checks a pasted key before Save, without storing or logging it. The tutorial's key steps link the same pages as the key guides, Inworld included.
- A template or schedule that picks a retired model is flagged on its row in Library → Templates and Library → Schedules, with the same Switch to <model> button as Settings → Models.
- A finished project sums up its run cost in one line at the top of its page, with See cost by stage to open the Cost section.

## 2026-09-27 - command-palette-shortcuts
### Ctrl+K for everything, and keyboard shortcuts

- The command palette matches several words in any order across a command's name, the project it acts on and its keywords: "cleopatra regenerate image 3" finds it.
- Every image of a project can be regenerated from the palette by number ("regenerate image 12"), including the ones behind Show all. It asks first, as the Regenerate button does.
- From any screen, the palette opens any project by name, regenerates a project's image by number ("cleopatra regenerate image 3" opens Cleopatra on Images and asks), and offers New schedule and Add to calendar.
- Keyboard shortcuts: C for New video, G then H, P, C, S, L, K or comma to go to Home, Projects, Calendar, Schedules, Library, Channels or Settings, / to search a list, Shift+N for a project's next action, Shift+D to copy the YouTube description, Ctrl+S (Cmd+S) to save in the Library editors, and Ctrl+Enter to review the setup in Play. Press ? for the full list.

## 2026-09-27 - codex-image-model-establishing-image
### Codex images: pick the model and effort; an establishing image keeps the look

- Codex CLI images can use any of the Codex CLI's own models (the same list as the Codex text provider) and a reasoning effort, up to Max and Ultra where Codex offers them: Images → Model and Effort on Play, Edit project → Providers, and templates. "Codex default" is what every existing project keeps, unchanged, so nothing is marked outdated.
- The Codex image agent now writes a detailed, faithful prompt from the brief, may look at its image and redraw it until it matches, and the last image it draws is the one used. A Codex image may take up to 30 minutes, shows "Codex is refining the image… N images so far" on the stage's live panel, and four are drawn at once.
- New optional Images setting, Establishing image: made first from an image prompt (keywords filled like the others) or uploaded, and never shown in the video. Every other image, the shorts' images and (unless you untick it) the thumbnail are drawn with it as a reference for characters, style and palette. Changing it or pressing Regenerate on it marks those images outdated. Templates and schedules carry the setting.
- The establishing image works with the Codex CLI, OpenAI's GPT image models, Google's Gemini image models and fal.ai's FLUX.2 and Nano Banana 2. Replicate's models can't take one: Play and Edit project say so and name the control to change.
- Database schema 24 lets a Play draft hold an uploaded establishing image.

## 2026-09-27 - cli-cancel-force
### Cancelling a CLI provider always stops it

- Stopping or pausing a step that runs Claude Code, Codex or Gemini CLI now force-stops the CLI after a one-second grace if it ignores the polite stop, instead of leaving it running in the background.

## 2026-09-27 - channels
### Channels: brand kit, cast library and series brief

- New Channels destination: a channel page with Brand, Cast, Templates and Schedules tabs. Migration 0032 adds the channels, the cast and a content-addressed picture store, and puts every existing template and project in the default channel "My channel" without touching any project config.
- Cast members (character, creature, place, object) have aliases, a description and up to four reference pictures, uploaded or made from a prompt in the background. A name or alias mentioned as a whole word (case-insensitive; "Cleopatraic" is not "Cleopatra") in an image's brief sends that member's pictures with the image; the establishing image and the thumbnail also take the members the title mentions. Codex gets several `referenced_image_paths`; OpenAI, Google and fal.ai edit models several input images; Replicate gets the members in words.
- The run snapshots the cast into its config (`cast`), and image requests carry it only when a member is mentioned, so no existing project turns outdated.
- The brand kit fills what a template leaves at its default: caption font and colours, chapter card font and colour, an end screen card over the last 5 seconds, intro/outro and document theme. Play has a Channel picker and "Use the channel's brand kit"; Templates and Schedules filter by channel; templates move between channels without a new version, and schedules follow their template.
- The series brief is stored on the channel; topic generation uses it for a schedule without a brief of its own, found through the schedule's template (`scheduleChannel`, `withChannelBrief`).

## 2026-09-27 - channel-import-filter
### Existing videos: pick which CSV titles to import

- Importing a YouTube Studio CSV on a channel's Existing videos tab now lists its titles with a tick each before saving; only the ticked titles are added, so videos of other channels in the same Studio export stay out.
- "Keep only titles containing…" ticks the titles holding that text (any case) and unticks the rest; Tick all and Untick all reset the ticks.
- The filter is remembered per channel and applied to the next CSV.

## 2026-09-27 - channel-essentials
### Channel essentials: AI disclosure, ambient sound, episode memory, trash and more

- Studio prep answers YouTube's "Altered or synthetic content" question for every video and Short: Yes when an AI voice narrates or AI draws the pictures, No only when the voice and pictures are your own. The upload pack shows the answer and why, the extension ticks it (it still never publishes), and a channel can say Always Yes or Always No.
- An optional ambient bed (rain, fire, wind, generated on your machine, or your own file) plays under the whole narration of the long video, ducked under the voice, with a level, a fade-in and a tail after the narration ends. Set it on Play or a template, or as a channel's default in its brand kit.
- Episode memory: each finished episode leaves a short summary on its channel, and a new episode's article or script prompt gets the summaries of up to five related ones (shared cast, overlapping titles). On for new channels, off for existing ones; view, edit and delete memories on the channel page.
- Existing videos: paste a channel's titles or import a YouTube Studio CSV; topic suggestions and duplicate checks skip them.
- More images for long videos: "N images per hour" or "one every N minutes" scales the image count to the expected length, spread round-robin over the ticked prompts, up to 240 per run, with Mix of both motion by default.
- Trash: deleted projects, prompts, intros and outros, templates and schedules stay in Settings → Trash for 30 days, with Restore and Delete now; a name can be reused meanwhile, and a restored clash gets "(restored)".
- A "What's new in 3.0" tour on the first launch after updating from 2.x, and the tutorial's wording brought up to date with the new screens.
- Backups now carry prompt history, channels with their cast and pictures, episode memories, existing videos, review verdicts, run cost, project channels, channel links, provider defaults and the trash.
- Chapters in the YouTube description follow YouTube's rules (first at 0:00, at least three, each at least 10 s): they are fixed when shown or copied, and a note says what changed.

## 2026-09-27 - buttons-and-links
### Buttons mean one thing, links go somewhere, rows are one target

- Every screen uses the kit's five buttons; the 2.x button is gone. The first-run notice and the "Slopify was updated" prompt end in a plain primary button instead of the Play key.
- A link looks like a button only when it is the item's main action or sits in a row of buttons (New prompt, Open to continue, a Library row's Edit and Duplicate, Download PDF); any other link reads as a link (Open, Calendar, Edit schedules, See all patch notes).
- Nothing that acts looks like plain text: a queued video's chip opens its keywords through a quiet button with a pencil, the reason under the Play key sits beside Go to the field, a saved draft is a list row with a Discard button, and the tutorial launcher is an icon button.
- Section headings on the project page, Play, Settings → Providers, the video queue, the document theme editor and the prompt editor use the one section head, with their actions top right.
- Library → Templates has the same row actions as the other Library tabs: Edit (its keywords beside the list), Duplicate, Use in Play, History (every saved version, compared with the current one, with Restore) and Delete.
- Library → Aliases shows each alias as a list row with its fields under it and a Remove button.
- A press anywhere on a row or tile opens or picks it, not only on its name: Library lists (prompts, intros and outros, templates, document themes), channels, schedules, projects, Home items, calendar entries, samples, saved drafts and media tiles. The row's own buttons keep working on their own.
- A source scan (`kit-rules.test.ts`) fails when a screen writes a button by hand, dresses a link as a button outside the kit, or puts a click handler on a row.

## 2026-09-27 - automatic-reviews
### Automatic reviews

- A reviewer model checks the article, every image, the narration, the thumbnail and every short before the run moves on, and saves its verdict with the reasons beside the item on the project page.
- Per stage, on Play's Review step, in Edit project → Reviews and in templates: Off, Flag only, or Flag and redo. A redo goes through Re-run's path and is limited per item (2 by default, 0-5); after that the item is kept and flagged, never looped.
- Overrule accepts a flagged item as it is; Redo makes it again and reviews it again.
- Claude Code and Codex review pictures (Claude Code through its Read tool confined to a private folder, Codex through `--image`); the Gemini CLI and OpenRouter can review the article and the narration only, and Play says so when one is picked for pictures.
- Review prompts are a new Library kind, with built-in ones per stage. Reviews count in Usage and in the estimate.
- A review is its own recipe step, so it is cached and fingerprinted; with every review Off, projects plan exactly as before (database schema 25).

## 2026-09-27 - ai-use-and-studio-live-dom
### AI use answers Yes only for YouTube's three cases; the Studio extension follows the live page

- Prepare upload and the Studio extension now answer Studio's "AI use" question (formerly "Altered or synthetic content") Yes only when one of YouTube's three cases applies, and say which in YouTube's words; an AI narrator or AI pictures alone are No.
- Settings → Voices: a **Real person** switch per voice, for a voice cloned from or made to sound like a real person (case 1).
- Library → Prompts: an Image prompt's **Draws photorealistic pictures** switch (case 3). Stylised prompts stay off.
- Prepare upload: for a project with uploaded video clips, **The uploaded clips are real footage** under AI use (case 2, when the Look's atmosphere overlay is laid over them).
- The marks are off by default, need no migration and travel with backups. Channel Always Yes / Always No still win.
- Studio extension: selectors follow the live Details page (read 2026-09-27); the title and description are typed through the editor with real line breaks, tags become chips one by one, radios are picked by name, Show more is pressed only while collapsed, and three thumbnails go to A/B Testing when it can be filled, else the first is set and the message says what to add by hand. The playlist list and A/B Testing dialog are still unverified.

## 2026-09-26 - video-editing
### Video editing

- New "Cuts" setting beside Motion on Play's Export rail and in Edit project → Inputs: Every N seconds (what every video did) or Follow the narration, the default for new projects. Following the narration cuts in the pause after a sentence, as near to Seconds per image as the sentences allow and never under 40% of it, and starts a new image at every chapter (the YouTube description's chapters when that step runs, otherwise the article's top-level headings). It times the narration's words first, as captions do. Images are not tied to passages of the article, so they keep taking turns in order.
- A folded "Look" row under it: transitions (Cut, Crossfade, Fade through black, Slide, Wipe; 0.2–2 s, 0.6 by default), vignette and film grain (Off, Subtle, Strong), colour grade (None, Warm fantasy, Cold, Desaturated, Sepia), an atmosphere drawn by Slopify itself (Embers, Dust, Fog; no downloaded footage), and chapter cards, each chapter's title centred for 2.5 s in the caption font. Help for each sits behind an InfoTip.
- The render stays one short ffmpeg run per clip and a concat join: a transition is one more short clip made from the two shots it joins, so the video stays exactly as long as its narration; the Look is filters inside each clip, and a colour grade is applied once to each still rather than to every frame.
- Animate images (Off, Chapter openers, Every Nth image) turns images into 5-second clips with an image-to-video model on your image provider: Kling 2.5 Turbo Pro, Wan 2.5 and Seedance on fal.ai and on Replicate, added to the model catalogue with their per-clip prices. Each clip is paid and shown in the estimate; a clip that can't be made leaves its image still, and the video says which image and why. Uploaded images are never animated.
- Edit project → Images has "Add a video clip": a clip takes an image's place in the order and plays muted, trimmed, slowed to half speed at most, or looped to fill its time.
- Projects saved before, or with every setting at today's behaviour, plan exactly the same work and keep their finished videos; no database change.
- Render time, bundled ffmpeg 7.0.2, a synthetic 10-minute slideshow (40 stills at 15 s, zoom motion), measured on a machine shared with other test runs, so only the ratios mean much: plain slideshow 292-314 s (about 2x real time here; the owner's machine does a 2-hour video in about 12 minutes); with a 0.6 s crossfade 311 s (+6%); vignette, subtle grain and Warm fantasy 417 s (+33%); embers 338 s (+8%); fog 347 s (+11%); crossfade, that Look, embers and chapter cards together 428 s (+36%). Memory stays at one clip's worth by design (not measured here).

## 2026-09-26 - telemetry-shorts
### Telemetry for shorts

- Each rendered short is reported as `shorts: 1` with no stage: the Shorts step runs inside the Video stage, and a stage of "video" would count as a finished video. The first-run notice lists "Shorts made".
- The collector counts `shorts_made` (a new key in the `aggregates` table; no schema change) and the landing board shows it as "shorts made".
- `02-models.md`: TelemetryCounters/TelemetryPayload gain `descriptions` and `shorts`; Aggregates gains `documents_made`, `descriptions_made` and `shorts_made`.

## 2026-09-26 - telemetry-documents-descriptions
### Telemetry for PDFs and YouTube descriptions

- The collector counts `documents_made` (a finished document stage, already reported by 2.1.0) and `descriptions_made`. The landing board shows both as "PDFs made" and "descriptions written".
- A written YouTube description is reported with its provider, model and tokens and `descriptions: 1`, and no stage: it is made inside the Video stage, and a stage of "video" would count as a finished video. Its tokens now count toward "tokens used".
- The first-run notice and README list the two new counters.

## 2026-09-26 - stale-held-work
### Held work after a save

- Undoing an edit, or restoring an earlier version, no longer queues a step again that had already finished with exactly the same settings: the save picks up the finished result, and its output reads as ready instead of outdated.
- Saving several times while a step waits for Resume keeps one waiting copy of that step instead of adding a new one on every save.
- While narration chunks land, the steps waiting on them (joining the audio, subtitle timing, the export and the YouTube description) take the new inputs in place instead of getting a fresh row per chunk. On a long narration this used to leave dozens of never-run rows behind, one every few seconds, each marked finished although it never ran.
- A stage whose remaining work is waiting for Resume now says "Waiting for Resume" on the project page instead of "Waits for the stages above".

## 2026-09-26 - shorts
### Shorts

- New optional step in the Video stage: after subtitle timing, the project's text model picks the best self-contained moments of the narration, and each becomes a vertical 1080×1920 short with new 9:16 images and big captions, two to four words at a time with the word being spoken highlighted, in the project's subtitle font. It is fully automatic and runs beside the render. Switch it on per project on Play's Export rail or in Edit project → Prompts, below the YouTube description; it is off by default and needs narration.
- Choose how many shorts (1–10, 3 by default) and how long each may be (15–180 seconds, 60 to 120 by default). The images are held for the project's Seconds per image, the last one to the end of the clip, with the project's motion.
- The model picks clips by sentence number, and Slopify cuts them at the narration's own word times, a moment before the first word and after the last, taking the sound from the same timeline the video uses. Clips of the wrong length, overlapping clips and malformed titles are refused; when fewer than asked for are usable, the model is asked once more with what was wrong.
- Each short gets a title (at most 60 characters), a one-line description and hashtags. The project page's Video stage shows the shorts in a grid of small vertical players, each with Copy (title, description and hashtags) and Download; the stage's Download menu lists each short. While the stage runs, each short says how far it got.
- A new Shorts prompt kind in Library → Prompts, with a Use Built-in Starter button; the images' style is an Image prompt. With none picked, the built-in wording is used. Edit project → Prompts can make the shorts again after review.
- Play's estimate and review include the extra calls and charge the images at the most the step can ask for (every short at the longest length). Projects saved before, or with Shorts off, plan exactly the same work as before. The upgrade widens the prompts table for the new kind (schema version 19) and keeps every saved prompt.

## 2026-09-26 - shorts-remake-and-polish
### Shorts: remake one, move a clip, title, music and speed

- The Shorts settings have their own section, Edit project → Shorts. Once the clips are picked it lists each one with its first and last sentence: move the start or the end a sentence earlier or later, or choose your own range from the transcript. A range that is too short, too long or overlaps another short is refused in plain words, and only that short is made again.
- "Make this short again" makes one short again with new images, leaving the others as they are. "Pick different moments" asks the model again; a clip it chooses again on the same sentences keeps its images and video. Both are also on the project page's Shorts part, where they open Edit project with the change ready to save.
- When the moments are picked again and there are fewer shorts, the extra ones leave the project's current files.
- Optional title on screen: the short's title as a large, bold headline near the top for the whole clip, on two lines at most and clear of the apps' own buttons. It is on for new projects.
- Optional background music: upload an audio file in Edit project → Shorts. It is looped to each short, faded in and out, and dips while the narrator speaks; set its level with Music volume (15 % by default). A file that can't be read is named in the error.
- Optional speed from 1.00× to 1.25×: the narration plays faster with its pitch kept, and the captions and images stay in time.
- Each short's description now ends with a line to the full video. Set the project's Full video link, or paste it where "[PASTE THE FULL VIDEO LINK HERE]" stands; Copy includes the line.
- With the bundled Barlow font the captions are drawn in Barlow's own Bold face (SIL Open Font License 1.1, now shipped beside the regular one); other fonts are emboldened as before.
- Captions no longer leave one word alone on screen when a neighbouring group can take it, or can lend it a word, without growing wider.
- Edit project's rebuild review prices each short's images together with its image prompts once the clips are picked.
- The title, speed, volume and link are under "More shorts options" on Play's Shorts row too, and travel with drafts, templates and schedules. Projects saved before keep their shorts exactly as they are.
- Fixed: saving any change in Edit project after the shorts were made failed with an internal error.

## 2026-09-26 - run-meter-sections
### Run meter counts the sections shown

- The project page's Run meter said "x of 7 stages finished" beside five cells. It now counts the five sections the page shows (Article, Audio, Images, Video, Document): research counts inside Article and the thumbnail inside Images, a section is finished when every stage in it is, and a switched-off section is left out. The percent is worked out the same way, so both agree.
- `uiux/screens/03-project.md`: Rundown strip notes how the meter counts.

## 2026-09-26 - release-2.4.0
### Slopify 2.4.0

- **Shorts.** A new part of the Video section picks the best 60–120 s moments of the narration (whole sentences only), makes new vertical images for each and renders 1080×1920 shorts with big word-by-word captions, a title on screen, and a title, description and hashtags to copy. Optional background music that dips under the narration, a speed setting, "Make this short again", "Pick different moments" (unchanged clips keep their images), and hand adjustment of each clip's start and end. A new Shorts prompt type in the Library.
- **Video editing.** Cuts that follow the narration (on sentence ends and chapter starts; the default for new projects), transitions (crossfade, fade through black, slide, wipe), and a Look: vignette, film grain, colour grade, atmosphere (embers, dust, fog) and chapter title cards. Your own video clips can be used as shots, and images can be animated with fal.ai or Replicate models, priced in the estimate. Existing projects are unchanged.
- **Fixes.** Saving, undoing or restoring an edit reuses finished work instead of queueing copies of it, and waiting steps are no longer duplicated while the narration lands. Held work says "Waiting for Resume". The run meter counts the five sections the page shows. Edit project says "unsaved" only when something changed.
- **Housekeeping.** Docker updates keep only the newest recovery copy of your data. Backup imports no longer time out on slow connections. Shorts are counted in the anonymous usage totals.

## 2026-09-26 - release-2.3.1
### Slopify 2.3.1

- The Video section's files (video, subtitles, YouTube description and tags) download from one Download menu beside one Open folder, instead of a row of links each with its own folder button; the YouTube description and tags each have Copy beside their heading, and the tags sit beside the description as chips on a wide screen.

## 2026-09-26 - release-2.3.0
### Slopify 2.3.0

- The project page has five sections: Article, Audio, Images, Video and Document. Research is a tab of Article (beside Sources and Pronunciation), and the thumbnail is shown large at the top of Images, without its prompt. The Video stage's YouTube part is no longer a card inside a card.
- Plain is the only built-in document theme and the default for new projects. Installs that already made PDFs with the old DiceMaster look get it as a theme of their own in Library → Documents; existing projects keep their look.
- Settings → Backup & storage: Export everything saves prompts, intros and outros, templates, schedules, document themes, unstarted drafts, projects with all their files, usage and non-secret settings into one .tar (never provider keys). Import a backup adds it to this install without replacing anything; schedules arrive paused, and importing the same backup twice adds nothing.

## 2026-09-26 - release-2.2.0
### Slopify 2.2.0

- Library → Documents: document themes with every PDF setting (page, colours, fonts, sizes, spacing, drop caps, title, contents, header and footer, sources and closing pages, PDF details), edited beside a live preview of a sample article. Play and Edit project pick from the built-ins and your themes; a project keeps its own copy of the theme it was given.
- The project page's Article section has Article, Sources and Pronunciation tabs when the article has them, each with Copy as Markdown.
- The Sources page of the PDF (and the Sources tab) list one source per line even when the article wrote them without blank lines between.
- Pronunciations are shared across projects: a new project copies the Pronunciation Glossary terms of your other projects (its own glossary wins); on by default, off per project, refreshed from Edit project.
- Edit project: "Write the description again after review" for the YouTube description, and a note with "Use the Library version" when a Library prompt changed since the project copied it.
- The Audio meter counts spoken chunks only ("chunk 7 of 19"), not the text preparation, join and file steps.
- A much shorter README; the Docker, Inworld, ffmpeg and development details moved to docs/.

## 2026-09-26 - release-2.1.1
### Slopify 2.1.1

- Written YouTube descriptions are counted in the anonymous usage totals (with their model tokens), alongside the PDFs that 2.1.0 already reported; the first-run notice lists both.

## 2026-09-26 - project-sections
### Research and the thumbnail move inside Article and Images

- The project page has five sections instead of seven. Research is a tab on Article (Article, Research, Sources, Pronunciation) with its notes, live writing, Re-run research and Copy research notes; it opens by default while research runs or has stopped, and a research failure lights the Article cell with its own Retry research.
- The thumbnail sits large at the top of Images with Regenerate thumbnail, Download thumbnail and Open folder, and its prompt is no longer shown. With Images off and a thumbnail on, the section reads as Thumbnail. A thumbnail failure shows on Images with Retry thumbnail.
- The Video stage's YouTube part is no longer a bordered card inside the stage: it sits under a rule with read-only text instead of text boxes.
