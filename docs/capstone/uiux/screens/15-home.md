---
generated_at_commit: e9226a34aa8a
generated_date: 2026-10-02
capstone_version: 7.0.1
content_hash: d0fc34307339
paths_covered:
  - ":(top)packages/web/src/routes/home.tsx"
  - ":(top)packages/web/src/home/**"
---

# Home

## Mode & job
Operate surface at `/`, the app's front door: what needs a decision, what is running, what the calendar starts in the next seven days, what is ready to upload and what this week cost, for the channel picked in the rail or for every channel (`packages/web/src/routes/home.tsx:38-40`, `packages/web/src/router.tsx:61-67`). The rail's Home item (house icon, shown on phones) lights only on `/` exactly; Ctrl+K carries "Open home" in group "Go to" with the chord `G H` (`packages/web/src/components/shell.tsx:70-77`, `packages/web/src/components/shell.tsx:146`, `packages/web/src/components/shell.tsx:189-195`, `packages/web/src/lib/shortcuts.ts:8`). The full project list lives on `/projects`; Home's "See all" links open it on a filter (`packages/web/src/home/running-more.tsx:32-47`).

Home is also the first-run gate: when the onboarding view reports `show: true` it navigates to `/welcome` once per tab (module flag `welcomed`), and when it reports `settle: true` (a real project exists but the first-run screen was never recorded as done) it posts `POST /api/onboarding/dismiss` once per visit, retrying on the next visit if that fails (`packages/web/src/routes/home.tsx:33-75`, `packages/app/src/slices/onboarding/first-run.ts:10-24`).

## Composition
| Region | What renders | Kit / tokens |
|---|---|---|
| Page header | `display`-size title: the current channel's name, else "Home"; crumb is today's date (`weekday long, day, month long`); meta "Every channel" when no channel is picked; actions: secondary ButtonLink "New project" (plus icon) to `/play`, quiet ButtonLink "Open calendar" (calendar icon) to `/calendar` (`packages/web/src/routes/home.tsx:25-29`, `packages/web/src/routes/home.tsx:119-136`) | `PageHeader display` renders `sl-display` (`packages/web/src/components/kit/layout.tsx:22-23`, `packages/web/src/components/kit/layout.tsx:52`, `packages/web/src/styles/kit.css:375`), `ButtonLink` |
| Phone channel picker | Below 768px only: `ChannelPicker` plus InfoTip `home.channel` (`packages/web/src/routes/home.tsx:137-140`, `packages/web/src/channels/current.tsx:91`, `packages/web/src/help/entries/settings.ts:293-297`) | `md:hidden`, `helpScope` |
| Board | `Board split="main-side"`: main column and side column at 1.35 : 1, stacked below 1024px (`packages/web/src/routes/home.tsx:146`, `packages/web/src/styles/shell.css:866-868`, `packages/web/src/styles/shell.css:883-891`) | `Board`, `BoardColumn` (`packages/web/src/components/kit/board.tsx:15-33`) |
| Main: Needs you | `SectionHead` "Needs you" (InfoTip `home.needs-you`) over a list of waiting, paused, held-topics and failed items, in that order (`packages/web/src/routes/home.tsx:109-114`, `packages/web/src/routes/home.tsx:148-191`) | `SectionHead` (`packages/web/src/components/kit/section-head.tsx:9`), `sl-home-item` |
| Main: Running now | `section#running`, `SectionHead` "Running now" (InfoTip `home.running`), up to three `RunningProject` cards, then `RunningMore` (`packages/web/src/routes/home.tsx:192-216`) | `sl-home-run` |
| Side: Coming up | `SectionHead` "Coming up" (InfoTip `home.coming-up`, meta "Next 7 days") with TextLink "Calendar" to `/calendar`; `ComingUp` list of up to six scheduled runs (`packages/web/src/routes/home.tsx:219-236`) | `List`, `ListRow`, `Badge` |
| Side: Ready to upload | `SectionHead` "Ready to upload" (InfoTip `home.ready`), up to four `ReadyItem`s (`packages/web/src/routes/home.tsx:237-254`) | `sl-home-ready` |
| Side: This week | `SectionHead` "This week" (InfoTip `home.this-week`, meta "Since Monday"), `ThisWeek` stats (`packages/web/src/routes/home.tsx:255-258`) | `Stats`, `Stat`, `Meter` (`packages/web/src/components/kit/stats.tsx:5-36`) |

Every list is first narrowed to the rail's current channel: projects by `channelId`, schedules and calendar runs by their template's channel (`packages/web/src/routes/home.tsx:82-108`). Section item cap `shownPerSection = 4` (`packages/web/src/routes/home.tsx:31`).

### Needs you items
All share `Item`: lead media (168px wide, 96px on phones), a `Status` line, a 17px title, a small `text-ink-2` detail, and an action `ButtonRow` that wraps below on phones. Only the first item's action is `primary`; the rest are `secondary` (`packages/web/src/home/needs-you.tsx:32-34`, `packages/web/src/home/needs-you.tsx:51-75`, `packages/web/src/styles/shell.css:729-742`, `packages/web/src/styles/shell.css:766-774`).

| Item | Selected by | Lead / status | Detail | Action |
|---|---|---|---|---|
| `WaitingItem` | `isWaiting`: status pending, progress > 0, and not set aside with Keep as is (`packages/web/src/home/needs-you.tsx:47-49`) | `ProjectThumb`; `Status tone="waiting"` "Waiting for you", or "Waiting for you · review before the narration/images/video" when a current checkpoint gate is held (`packages/web/src/home/needs-you.tsx:91-95`, `packages/web/src/home/needs-you.tsx:117-123`, `packages/web/src/home/needs-you.tsx:192-196`) | "Its next step is held. Open the project to review it and continue the run." or "Everything before this step is done. Approve to let the run go on, or open the project to look first." (`packages/web/src/home/needs-you.tsx:198-202`) | With a gate: Button "Approve the article and record" / "Approve and draw the images" / "Approve and render", which calls `approveCheckpoint` with an idempotency key kept across a retry; without: ButtonLink "Open to continue" to the project plus a quiet "Keep as is" (disabled "Saving…" while pending) that sets the project aside until its next edit: success toast "Kept as is: `<title>`. It is off Needs you; editing the project brings it back." with an Undo action (toast "`<title>` is back on Needs you."), error toast "`<title>` wasn't kept as is: `<message>` Press Keep as is again." (`packages/web/src/home/needs-you.tsx:85-89`, `packages/web/src/home/needs-you.tsx:124-134`, `packages/web/src/home/needs-you.tsx:156-176`, `packages/web/src/home/needs-you.tsx:203-235`, `packages/web/src/home/api.ts:31-44`) |
| `PausedItem` | status paused (`packages/web/src/routes/home.tsx:87-91`) | `ProjectThumb`; `Status tone="waiting"` "Paused" | "You paused this run. Nothing more happens until you open it and press Continue the run." | ButtonLink "Open to continue" (`packages/web/src/home/needs-you.tsx:272-296`) |
| `HeldTopicsItem` | live schedule with `topicGeneration.mode === "hold"` and `topics.held > 0` (`packages/web/src/routes/home.tsx:99-105`) | `sl-media__frame` well with `LayersIcon` in `text-info`; `Status tone="info"` "`N` new topic(s)"; title is the schedule name | "Slopify suggested a topic / N topics for this schedule. Queue the ones you want and reject the rest." | ButtonLink "Review topics" to `/calendar` (`packages/web/src/home/needs-you.tsx:237-268`) |
| `FailedItem` | status failed, first four only (`packages/web/src/routes/home.tsx:93`, `packages/web/src/routes/home.tsx:113`) | `ProjectThumb`; `Status tone="failed"` "Failed · `<stage name>`" (`packages/web/src/home/needs-you.tsx:310-324`, `packages/web/src/home/needs-you.tsx:353`) | `shortReason` of the failed stage, else "The run stopped with an error."; a sign-in fix adds "Run `<command>` in a terminal to sign in, then press Check again on the project to retry the step." (`packages/web/src/home/needs-you.tsx:323`, `packages/web/src/home/needs-you.tsx:355-364`) | By `fixOf` kind: `provider-settings` → ButtonLink to Settings → Providers; `free-space` → Settings → Storage; `sign-in` → Button "Copy sign-in command" plus ButtonLink "Open to retry"; otherwise ButtonLink with the fix label or "Open to retry" to the project (`packages/web/src/home/needs-you.tsx:321-349`, `packages/web/src/project/fix-it.tsx`) |

Titles of project items are router Links to `/projects/$projectId` (`packages/web/src/home/needs-you.tsx:77-83`). `ProjectThumb` shows the project's thumbnail in a 16:9 `sl-media__frame`, lazy-loaded; on image error it swaps to a `bg-sunken` well with a `FilmIcon`; it is `aria-hidden` (`packages/web/src/home/project-thumb.tsx:7-35`).

### Running now card
`RunningProject` (one per project with status `running`; paused runs sit under Needs you) is a two-column card (fluid + 280px steps), one column below 1280px (`packages/web/src/routes/home.tsx:87-88`, `packages/web/src/styles/shell.css:743-765`):
- Title link and a `Status`: "Paused" (waiting), the `limitWaitLine` text such as a CLI limit wait (waiting), or the running stage's name (running) (`packages/web/src/home/running-now.tsx:98-99`, `packages/web/src/home/running-now.tsx:113-128`).
- `MediaGrid list density="compact"` of the last four images landed, or the last three plus a `MediaFrame` placeholder "The next image" with generating text "Drawing · `N` so far" while the images stage runs; each image opens a `Lightbox` with the image prompt as caption; under it "Images `x` of `y`" (`packages/web/src/home/running-now.tsx:93-101`, `packages/web/src/home/running-now.tsx:129-164`, `packages/web/src/components/kit/media.tsx:19`, `packages/web/src/components/kit/media.tsx:102-145`).
- `Steps` of every stage not off or skipped: lamp tone and word per state (Not started, Running, Done, Provided, Failed, Canceled), elapsed time ("38 s", "4 min", "1 h 12 min") and, for a running step, "`n` of `total` · `<eta label>`" from `stageEta`, or, when the server names the step's activity, that activity with its percentage instead of the count ("Rendering the video (45%)", plus " · `<eta label>`" when the ETA is known) (`packages/web/src/home/running-now.tsx:59-80`, `packages/web/src/home/running-now.tsx:22-77`, `packages/web/src/home/running-now.tsx:102-109`, `packages/web/src/home/running-now.tsx:166`, `packages/web/src/components/kit/steps.tsx:16`).
- The card subscribes to the project's own event stream via `useLiveProject` and reads the project body with `projectQuery` (`packages/web/src/home/running-now.tsx:87-89`).

`RunningMore` renders under the cards when more than three run ("See all `N` running" → `/projects?show=running`) or runs are queued (`isQueued`: pending with progress 0): "Queued, waiting to start (`N`): " followed by up to two titles ("Untitled project" for blank ones) and " and `N` more", then TextLink "See queued" → `/projects?show=queued` (`packages/web/src/home/running-more.tsx:8-52`).

### Coming up rows
`ComingUp` renders one `ListRow` per calendar run: title "`<short weekday, day, short month>` · `<short time>` · `<runTitle>`", meta "`<schedule name>` · `<template name>`", and a `Badge`: "Paused" (waiting) when the run is paused, "Needs a topic" (info) when its topic source is held, else "Queued" (`packages/web/src/home/coming-up.tsx:10-38`). The query window runs from now to local midnight plus eight days, fixed for the page's life (`packages/web/src/routes/home.tsx:46-55`).

### Ready to upload rows
`ReadyItem` shows projects that are done or partial, or pending but set aside with Keep as is, make a video, have no `uploadedAt`, and are not one of the bundled samples (`packages/web/src/home/ready.tsx:18-27`, `packages/web/src/routes/home.tsx:94-98`). Each row: 132px `ProjectThumb` (96px on phones), title link, meta "`<format>` · finished `<time>`" plus " · a step failed" for partial, then a `ButtonRow` with `PrepareUpload` (small, see 23-studio-upload) and quiet small "Mark uploaded" (`packages/web/src/home/ready.tsx:61-87`, `packages/web/src/styles/shell.css:752-760`, `packages/web/src/styles/shell.css:778-781`). Mark uploaded sends `PUT /api/projects/:id/uploaded` (`packages/web/src/home/api.ts:46-59`).

### This week stats
`ThisWeek` reads `GET /api/home/week?since=<Monday 00:00 local>&channelId=` (stale after 30 s) and renders: "videos made"; the week's cost in USD with label "spent", plus " · ~$x via API" when an API-equivalent is known and " · `N` call(s) without a price" for unpriced calls; then one `Stat` per CLI plan with a known weekly percent, label "weekly `<plan>` limit", with a `Meter` whose tone turns `waiting` at 80% or more (`packages/web/src/home/api.ts:10-29`, `packages/web/src/home/week.tsx:7-65`). The block carries `sl-home-stats` (`packages/web/src/home/week.tsx:38`).

### Commands
While Home is open, each waiting item registers a Ctrl+K command in group "Needs you" titled with its approve label or "Open the held run", context the project title; each ready item registers "Mark uploaded" in group "Ready to upload" (`packages/web/src/home/needs-you.tsx:178-188`, `packages/web/src/home/ready.tsx:53-60`).

## States
| State | Trigger | Rendered |
|---|---|---|
| Loading | `projects.isPending` | Needs you meta "Loading…"; Running now shows no empty state; This week shows "—" values; Coming up shows "Loading…" while the calendar is pending (`packages/web/src/routes/home.tsx:115`, `packages/web/src/routes/home.tsx:153-154`, `packages/web/src/routes/home.tsx:202-207`, `packages/web/src/routes/home.tsx:229-231`, `packages/web/src/home/week.tsx:39-43`) |
| Projects load error | `projects.error` | `role="alert"` `text-danger` paragraph above the board: "Your projects didn't load: `<message>` Check that Slopify is still running, then reload the page." (`packages/web/src/routes/home.tsx:141-145`) |
| Calendar error | `calendar.error` | Small `text-danger`: "The calendar didn't load: `<message>` Reload the page to try again." (`packages/web/src/routes/home.tsx:223-226`) |
| Week error | week query error | Small `text-danger`: "This week's numbers didn't load: `<message>` Reload the page to try again." (`packages/web/src/home/week.tsx:30-35`) |
| Nothing waiting | `needs` empty | Meta "Nothing is waiting for a decision", no list (`packages/web/src/routes/home.tsx:155-160`) |
| Nothing running | no running, none queued, loaded | `EmptyState` "Start the next video", "Pick a template and a topic on Play, or let a schedule start one." with no button (`packages/web/src/routes/home.tsx:202-207`, `packages/web/src/components/kit/empty-state.tsx:6`) |
| Nothing coming up | no calendar runs in range | "No scheduled runs this week. Plan some on the calendar." (`packages/web/src/routes/home.tsx:227-232`) |
| Nothing ready | `ready` empty | Meta "Finished videos you haven't marked uploaded show here", no list (`packages/web/src/routes/home.tsx:241-247`) |
| Approving | approve mutation pending | Button disabled, label "Approving…", disabled reason "Approving…" (`packages/web/src/home/needs-you.tsx:223-230`) |
| Approve result | approve settles | Success toast "Approved: `<title>`. The run continues."; refused: "`<title>` wasn't approved: `<message>` Open the project to review it there."; network failure: "Slopify didn't confirm the approval of `<title>`: `<message>` Press the button again to check whether it went through."; checkpoint and projects queries invalidated (`packages/web/src/home/needs-you.tsx:135-154`) |
| Sign-in copy | Copy sign-in command pressed | Success toast "Copied `<command>`. Run it in a terminal on the computer running Slopify and sign in, then open the project and press Check again."; clipboard blocked: error toast "Couldn't copy: the browser blocked the clipboard. Type `<command>` …" (`packages/web/src/home/needs-you.tsx:312-320`) |
| Marking uploaded | mark mutation pending | "Mark uploaded" disabled, reason "Saving…" (`packages/web/src/home/ready.tsx:75-83`) |
| Mark result | mark settles | Success toast "Marked uploaded: `<title>`. It is off Ready to upload; Projects still lists it."; error toast "`<title>` wasn't marked uploaded: `<message>` Press Mark uploaded again."; projects query invalidated (`packages/web/src/home/ready.tsx:33-52`) |
| Plan near limit | weekly percent ≥ 80 | Meter tone `waiting` (`packages/web/src/home/week.tsx:58`) |
| Missing thumbnail | thumbnail request errors | Film-icon well (`packages/web/src/home/project-thumb.tsx:20-24`) |
| Live refresh | runs active | Projects query polls every 15 s while any project is active; schedules and calendar poll every 30 s; running cards update from the project event stream; a 1 s clock re-renders elapsed times (`packages/web/src/queries.ts:60-71`, `packages/web/src/schedules/api.ts:56-64`, `packages/web/src/schedules/api.ts:261-273`, `packages/web/src/home/running-now.tsx:87`, `packages/web/src/routes/home.tsx:76-80`) |

## Motion
- Running `Status` lamps and running step lamps pulse (`sl-pulse`, 1200ms, infinite), stopped under reduced motion (`packages/web/src/styles/kit.css:396-422`).
- The generating image tile is a static striped fill with text; it does not animate (`packages/web/src/styles/kit.css:557-568`).
- Elapsed times and ETAs tick once a second (`packages/web/src/routes/home.tsx:76-80`).
- Toasts enter with `sl-enter` (200ms) (`packages/web/src/styles/shell.css:165-172`).

## Copy
- Section titles: "Needs you", "Running now", "Coming up", "Ready to upload", "This week" (`packages/web/src/routes/home.tsx:150-256`).
- Section metas: "`N` thing(s) is/are waiting for you", "`N` video(s)", "Nothing is running", "Next 7 days", "`N` finished and not marked uploaded", "Since Monday" (`packages/web/src/routes/home.tsx:152-256`).
- Action words: "New project", "Open calendar", "Calendar", "Open to continue", "Keep as is", "Review topics", "Copy sign-in command", "Open to retry", "Mark uploaded", "See all `N` running", "See queued" (`packages/web/src/routes/home.tsx:126-221`, `packages/web/src/home/needs-you.tsx:203-347`, `packages/web/src/home/ready.tsx:82`, `packages/web/src/home/running-more.tsx:35-46`).
- Help bodies for the six InfoTips live in `packages/web/src/help/entries/settings.ts:292-321`; the `home.running` body says paused videos show under Running now, while the code lists them under Needs you (`packages/web/src/help/entries/settings.ts:303-306`, `packages/web/src/routes/home.tsx:87`).
- Errors name what failed and the next step ("Reload the page to try again.", "Press Mark uploaded again.") (`packages/web/src/routes/home.tsx:143`, `packages/web/src/home/ready.tsx:45`).

## Not in play
- Pagination or "see all" for Needs you, Ready to upload and Coming up: absent; lists are capped (4 failed, 4 ready, 6 coming up) with no link to the rest from those sections (`packages/web/src/routes/home.tsx:113`, `packages/web/src/routes/home.tsx:234`, `packages/web/src/routes/home.tsx:249`).
- Reordering or editing scheduled runs: absent here; Coming up is read-only (`packages/web/src/home/coming-up.tsx:7-8`).
- Retry buttons on load errors: absent; errors are text only (`packages/web/src/routes/home.tsx:141-145`, `packages/web/src/routes/home.tsx:223-226`, `packages/web/src/home/week.tsx:30-35`).
- Cancel or pause controls on running cards: absent; the card links to the project (`packages/web/src/home/running-now.tsx:111-167`).
- Upload to YouTube: absent; Ready to upload offers Prepare upload and Mark uploaded only (`packages/web/src/home/ready.tsx:16-17`).
- `needsYouCount` is exported but not used by `routes/home.tsx` (`packages/web/src/home/needs-you.tsx:36-42`).
- Offline and permission-denied states: not rendered.
