---
generated_at_commit: d6a72d6428ff
generated_date: '2026-10-18'
capstone_version: 7.0.1
content_hash: d0fc34307339
absorbed_from:
  - features/2026-09-30-slopify-mcp@2026-10-11
paths_covered:
  - ":(top)packages/web/src/routes/home.tsx"
  - ":(top)packages/web/src/home/**"
  - ":(top)packages/web/src/components/model-checks.tsx"
  - ":(top)packages/web/src/components/batch-queue.tsx"
  - ":(top)packages/web/src/lib/zoned.ts"
---

# Home

## Mode & job
Operate surface at `/`, the app's front door: before the person has a project of their own, what a video needs on this computer and the finished samples to watch; then what is finished, what needs a decision, what is running and waiting to start, what the schedules start in the next seven days, what this week cost and the templates to start from, for the channel shown or for every channel (`packages/web/src/routes/home.tsx`). The narrow rail's Home item (house icon over the word) lights only on `/` exactly; Ctrl+K carries "Open Home" in group "Go to" with the chord `G H` (`packages/web/src/components/shell.tsx`, `packages/web/src/components/shell-commands.tsx`, `packages/web/src/lib/shortcuts.ts`). The full project list lives on `/projects`; Home's "See all" links open it on a filter or order.

Home is also the first-run gate: when the onboarding view reports `show: true` it navigates to `/welcome` once per tab (module flag `welcomed`), and when it reports `settle: true` (a real project exists but the first-run screen was never recorded as done) it posts `POST /api/onboarding/dismiss` once per visit, retrying on the next visit if that fails; that also answers the start-at-login question (`packages/web/src/routes/home.tsx`, `packages/app/src/slices/onboarding/first-run.ts`).

## Composition
| Region | What renders | Kit / tokens |
|---|---|---|
| Page header | One line: crumb today's date (`weekday long, day, month long`), title "Home", actions `ChannelPicker` "Showing: [All channels ▾]" (only with two or more channels) and, once a schedule exists, quiet ButtonLink "Open calendar". No Create button: the rail's lime Create carries it (`packages/web/src/routes/home.tsx`, `packages/web/src/channels/current.tsx`) | `PageHeader` (`packages/web/src/components/kit/layout.tsx`), `ButtonLink` |
| Board | `Board split="main-side"`: main column and side column, stacked below 1024px | `Board`, `BoardColumn` (`packages/web/src/components/kit/board.tsx`) |
| Main: Your first video | Only while every project is a bundled sample (`firstTime`): `SectionHead` "Your first video", meta "What a video needs on this computer", the welcome's `SetupChecklist` (each part with its state word and its fix), then ButtonLink "Make your first video" to `/play`, primary only once nothing is missing (`FirstVideo`, `packages/web/src/home/setup.tsx`, `packages/web/src/components/welcome.tsx`) | `SectionHead`, `ButtonLink` |
| Main: Finished | `FinishedList` "Finished": the person's finished work (`finishedWork`: not a sample; done, done with problems, or Kept as is), newest finished first, up to six `FinishedItem`s; meta `finishedMeta` ("4 videos · 2 ready to upload"); "See all N finished in Projects" (Projects `?sort=finished`) when there are more (`packages/web/src/home/work-list.tsx`, `packages/web/src/home/ready.tsx`) | `sl-home-list` |
| Main: Needs you | `WorkList`: `SectionHead` "Needs you", meta "2 decisions · 1 failed", over the held and stopped runs, the paused runs, the schedules with suggested topics to review, then up to four failed runs; "See all N failed" (Projects `?show=failed`) when there are more (`packages/web/src/home/work-list.tsx`) | `sl-home-list` |
| Main: Running | `section#running` "Running", meta "2 videos · 3 waiting": up to three `RunningProject` cards, then `RunningMore`: "See all N running" (Projects `?show=running`) when more than three run, and "Waiting to start" (meta "N videos, in the order they start") with the video queue's `QueueList`, each with "Earlier", "Later" and "Remove", and any queued run the queue does not hold yet (`packages/web/src/home/running-now.tsx`, `packages/web/src/home/running-more.tsx`, `packages/web/src/components/batch-queue.tsx`) | `sl-home-run`, `List` |
| Main: empty | When the person has projects but nothing is finished, waiting or running: `EmptyState` "Nothing is finished, waiting or running", "Finished videos show here with Watch and Download, and so does anything that needs you.", primary "Make a video" to `/play` | `EmptyState` |
| Side: Finished samples | While the person has finished nothing of their own: `FinishedList` "Finished samples" of the bundled samples, none primary | `sl-home-list` |
| Side: Coming up | Once a schedule exists (or while schedules load): `SectionHead` "Coming up", meta "Next 7 days", then `Autopilot` (forecast, warnings, last seven days), then `ComingUp`, up to six scheduled runs, or "No scheduled runs in the next 7 days." (`packages/web/src/home/autopilot.tsx`, `packages/web/src/home/coming-up.tsx`) | `List`, `ListRow`, `Badge` |
| Side: This week | `ThisWeek`, in the open: `SectionHead` "This week", meta "Since Monday", then one line "3 videos · $9.40 spent · ~$31.00 via API" (plus calls without a price, what template samples cost, and the total across all channels when one channel is shown), then one row per CLI plan with a known weekly percent, "Weekly <plan> limit" with a `Meter` that turns waiting at 80% (`packages/web/src/home/week.tsx`) | `Meter` (`packages/web/src/components/kit/stats.tsx`) |
| Side: Start from a template | `StartFromTemplate` "Start from a template": the channel's templates, each with small "Make a video" (it opens Create with a fresh draft from the template; "Opening…" while it does), and "See all N" to `/templates` when there are more (`packages/web/src/home/templates.tsx`) | `SectionHead`, `Button` |
| Side: new models | `NewModelsSlot`, last in the column so its empty slot opens no gap: "N new model(s) work(s) for you" as a TextLink to Settings → Models when models started working after a check, else nothing (`packages/web/src/components/model-checks.tsx`) | `StatusSlot` |

Every list is first narrowed to the channel shown: projects by `channelId`, schedules, calendar runs and templates by their template's channel. Only one action in the main column is primary: the first decision's when there is one, else the newest finished video's Watch.

### Work rows
Every row of Finished and Needs you is a `WorkItem` (`packages/web/src/home/work-item.tsx`): the picture (`ProjectThumb`, a film-icon well when there is none), the title (a router Link to the project), one line with the state word beside its lamp and what the row is about, and the actions on the right in words. Rows sit between hairlines, dense enough to show eight or more in 900px; where the column is too narrow for the text and the actions side by side, the actions wrap under the text.

| Item | Selected by | State and detail | Actions |
|---|---|---|---|
| `FinishedItem` | `finishedWork`, newest finished first | `listState` word ("Ready to upload", "Uploaded", "Done", "Done with problems"); `finishedLine` ("3:05 · 16:9 · video + 2 shorts + PDF · finished Sep 27"), plus the steps a run done with problems lost and "See what failed" | "Watch" (the project's Video part) or "Open" when there is no video, and "Download video" when it made one (not on a sample) |
| `WaitingItem` | `waitsForPerson`, not stopped, not paused | "Waiting for your review", or "Waiting for your review · <before the stage>" when a pause holds it; without a pause, "Its next step is held for your review." | With a pause: the approve button ("Approve the article and record", "Approve and draw the images", "Approve and render"), sent with an idempotency key kept across a retry; without one: "Open to continue" and quiet "Keep as is" |
| `StoppedItem` | a run a restart stopped | "Stopped"; "The run stopped before it finished. Continuing makes only what is missing; everything made so far is kept." | "Continue the run" ("Continuing…"), quiet "Keep as is" |
| `PausedItem` | status paused | "Paused"; "You paused it. Nothing runs until you continue it." | "Open to continue" |
| `HeldTopicsItem` | a live schedule holding suggested topics | "N new topic(s)" (info); the schedule's name; "Queue the ones you want and reject the rest." | "Review topics" to `/calendar` |
| `FailedItem` | `failedRun`, first four | "Failed · <stage>"; the step's short reason, or "The run stopped with an error." | By the fix: a ButtonLink to Settings → Keys & services or Backup & storage named for the fix; for a sign-in, "Copy sign-in command" and "Open to retry"; otherwise the fix's label or "Open to retry" |

Keep as is sets a held run aside until its next edit: success toast "Kept as is: <title>. It is off Needs you; editing the project brings it back." with Undo.

### Running card
`RunningProject` (one per project `runningNow`: running, or parked on an External agent's review, which goes on by itself; paused runs sit under Needs you) rides the project's own event stream (`useLiveProject`), so a step lighting up or an image arriving shows here when it does on the project page (`packages/web/src/home/running-now.tsx`):
- The title link and one line `runLine`: "Step 2 of 4 · Narration · about 4 min left on this step", or the held word, or the plan-limit line ("Waiting for Codex limits (resets at 14:00)").
- `Steps` of every stage not off: the state word before its detail (Not started, Running, Done, Provided, Failed, Canceled), elapsed time ("38 s", "4 min", "1 h 12 min"), and for a running step "`n` of `total` · `<time left>`" from `stageEta`, or the activity the server names with its percentage ("Rendering the video (45%)").
- While the images step runs, a compact `MediaGrid` of the last images landed with a "The next image" placeholder "Drawing · N so far", and "Images x of y" under it; each image opens full size.

### Coming up rows
`ComingUp` renders one `ListRow` per calendar run: "`<short weekday, day, short month>` · `<short time>` · `<the title it will make>`" on the schedule's own clock, with its zone named when it is not this browser's (`zonedFormat`, `zonedTime`, `packages/web/src/lib/zoned.ts`), meta "`<schedule name>` · `<template name>`", and a `Badge`: "Paused" (waiting) when the run is paused; a waiting badge when no version of its template is approved for schedules, so the run is skipped; "Needs a topic" (info) when its topic source is held; else "Queued". The query window runs from now to local midnight plus eight days, fixed for the page's life.

### Autopilot (inside Coming up)
`Autopilot` reads `GET /api/home/autopilot` (optionally `?channelId=`). It shows a bold forecast line, "`<n>` days of content ready" with "+" when covered beyond the window and " · the queue runs dry on `<date>`" when known; a list of warnings, each with its lamp and its word, the text, a small ButtonLink fix (to a Settings page, a schedule, or Templates) and a quiet "Hide" that hides it for a week or until it changes; and a `Fold` "Last 7 days · `<n>` made · `<n>` failed · `<cost>`" listing failed steps. The weekly report that mirrors it is Settings → Notifications → Weekly report (`08-settings.md`).

### Commands
While Home is open, each waiting item registers a Ctrl+K command in group "Needs you" titled with its approve label or "Open the held run", its context the project title.

## States
| State | Trigger | Rendered |
|---|---|---|
| Loading | projects pending | `LoadingBlock` "Loading your projects…" in the main column; Coming up shows "Loading the calendar…" while the calendar is pending |
| Projects load error | `projects.error`, no data | `LoadFailed` "Your projects" with the message and Retry |
| Stale projects | a refetch failed over data shown | `StaleNote` for "your projects" with when it was last read and Retry |
| Calendar or schedules error | query error | `QueryState` for "The calendar", or `LoadFailed` "Your schedules", each with Retry |
| Week error | week query error | Compact `QueryState` for "This week's numbers" with Retry |
| First time | every project is a sample | Your first video in the main column, Finished samples in the side column |
| Nothing waiting | no decisions or failures | No Needs you section |
| Nothing at all | projects of your own, none finished, waiting or running | The empty state with "Make a video" |
| Nothing coming up | no calendar runs in range | "No scheduled runs in the next 7 days." |
| Approving | approve pending | Button disabled, "Approving…" |
| Approve result | approve settles | Success toast "Approved: `<title>`. The run continues."; refused: "`<title>` wasn't approved: `<message>` Open the project to review it there."; network failure: "Slopify didn't confirm the approval of `<title>`: `<message>` Press the button again to check whether it went through." |
| Sign-in copy | Copy sign-in command pressed | Success toast "Copied `<command>`. Run it in a terminal on the computer running Slopify and sign in, then open the project and press Check again."; clipboard blocked: an error toast with the command to type |
| Plan near limit | weekly percent ≥ 80 | Meter tone `waiting` |
| Live refresh | runs active | Projects poll every 15 s while any project is active; schedules and calendar every 30 s; running cards update from the project event stream; a 1 s clock re-renders elapsed times |

## Motion
- Running lamps pulse (`sl-pulse`, 1200ms, infinite), stopped under reduced motion (`packages/web/src/styles/kit.css`).
- The generating image tile is a static striped fill with text; it does not animate.
- Elapsed times and times left tick once a second.
- Toasts enter with `sl-enter` (200ms).

## Copy
- Section titles: "Your first video", "Finished", "Needs you", "Running", "Waiting to start", "Finished samples", "Coming up", "This week", "Start from a template".
- Section metas: "What a video needs on this computer", "4 videos · 2 ready to upload", "2 decisions · 1 failed", "2 videos · 3 waiting", "N videos, in the order they start", "Next 7 days", "Since Monday".
- Action words: "Make your first video", "Make a video", "Open calendar", "Watch", "Open", "Download video", "Open to continue", "Continue the run", "Keep as is", "Review topics", "Copy sign-in command", "Open to retry", "Earlier", "Later", "Remove", "See all N finished in Projects", "See all N failed", "See all N running", "Hide".
- Errors name what failed and the next step ("Check that Slopify is still running, then press Retry.", "Press the button again to check whether it went through.").

## Not in play
- Mark uploaded on Home: absent; Projects keeps it per row and in bulk, and Copy for YouTube Studio has "I've uploaded it".
- Info buttons beside section titles: absent; each section's meta line says what it holds.
- A folded This week with Show totals: removed; the numbers are in the open.
- The channel picker in the rail: moved to the page header, shown only with two or more channels.
- Pagination for Finished, Needs you and Coming up: absent; lists are capped (6 finished, 4 failed, 6 coming up) and Finished, Failed and Running link to the rest in Projects.
- Reordering or editing scheduled runs: absent here; Coming up is read-only (reordering lives on the calendar).
- Cancel or pause controls on running cards: absent; the card links to the project.
- Upload to YouTube: absent; Slopify never uploads.
- Offline and permission-denied states: not rendered.
