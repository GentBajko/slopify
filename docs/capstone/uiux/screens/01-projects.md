---
generated_at_commit: d6a72d6428ff
generated_date: '2026-10-18'
capstone_version: 7.0.1
content_hash: e0334aa0552a
absorbed_from:
  - features/2026-09-30-slopify-mcp@2026-10-11
paths_covered:
  - ":(top)packages/web/src/routes/projects.tsx"
  - ":(top)packages/web/src/routes/projects-row.tsx"
  - ":(top)packages/web/src/routes/projects-bulk.tsx"
  - ":(top)packages/web/src/routes/projects-order.ts"
  - ":(top)packages/web/src/routes/projects-remake-review.tsx"
  - ":(top)packages/web/src/home/finished-words.ts"
  - ":(top)packages/web/src/home/ready.tsx"
---

# Projects

## Mode & job
Operate surface at `/projects`: every run ever started, newest first unless another order is picked, for the channel shown, at the page's full width, each row with its picture, its state in words, what it made and when, and its actions in words; a selection bar acts on several at once (`packages/web/src/routes/projects.tsx`). The route keeps the filter, the search words and the order in the address (`?show=`, `?q=`, `?sort=`; defaults left out) and replaces the history entry on each change, so Back from a project, a reload and Home's "See all" links open the same list (`projectsSearchOf` in `packages/web/src/router.tsx`, `projectFilterOf` and `projectSortOf` in `packages/web/src/routes/projects-order.ts`). The narrow rail's Projects item (film icon over the word) lights for `/projects` and `/projects/*`; Ctrl+K carries "Open Projects" in group "Go to" with the chord `G P` (`packages/web/src/components/shell.tsx`, `packages/web/src/components/shell-commands.tsx`, `packages/web/src/lib/shortcuts.ts`). A project's own page is `/projects/$projectId` (see 03-project).

## Composition
| Region | What renders | Kit / tokens |
|---|---|---|
| Page header | One line: title "Projects", meta `N project(s)` for the channel shown once data arrives, and, with two or more channels, `ChannelPicker` "Showing: [All channels ▾]" as its action. There is no Create button here: the rail's lime Create (and the phone's bottom bar) carries it (`packages/web/src/routes/projects.tsx`, `packages/web/src/channels/current.tsx`) | `PageHeader` (`packages/web/src/components/kit/layout.tsx`) |
| Tutorial invite | Only when the install has zero projects: "Make your first video", one line on the tour, secondary "Start the tour"; hidden while the tour runs (`TutorialInvite`, `packages/web/src/tutorial/launcher.tsx`) | `rounded-media border-line bg-surface` box |
| Toolbar | Search input (search icon, placeholder "Search projects", up to 320px wide, `/` focuses it via `useSearchShortcut`; the address follows 300 ms after typing stops); the `Segmented` "Show" filters, each with its count, offering only filters that hold something (plus All and the one in use), hidden when only All is left; on a phone (≤767px) the filters are one `Select` "Show" with "Label (n)" options; the `Select` "Sort projects": Newest first, Finished first, Recently changed, Name (A–Z), Status (`filters`, `filterCounts`, `sortOptions` in `packages/web/src/routes/projects-order.ts`) | `sl-input`, `Segmented` (`packages/web/src/components/kit/switch.tsx`), `Select` (`packages/web/src/components/kit/field.tsx`) |
| Selection bar | `ProjectsBulkBar` above the rows: "Select all" (indeterminate while some are ticked; "Select all N shown" when a filter, search or Show more leaves rows out) and "N projects" or "2 of 14 projects selected". Its actions appear only once a row is ticked, each only when it applies to a ticked row: "Mark uploaded" (ticked rows ready to upload), quiet "Mark not uploaded" (ticked uploaded rows), with two or more channels a `Select` "Move to channel…" and "Move to <channel>", "Make outdated parts again" (ticked rows with outdated files; opens a review drawer with what it makes and its cost before anything starts), destructive "Delete" (ticked rows that are not running), then quiet "Clear selection". Esc anywhere in the list clears the selection. The ticked rows are also what the Assistant sees as the selected projects (`useAssistantSelection("project", …)`) (`packages/web/src/routes/projects-bulk.tsx`, `packages/web/src/routes/projects-remake-review.tsx`, `packages/web/src/components/selection.tsx`) | `SelectionBar`, `Button`, `Select`, `ConfirmDialog`, `Drawer` |
| Project rows | `List` (`.sl-projects`) of `ProjectRow`s, the first 50 of the matching projects in the picked order; with All channels shown and two or more channels, grouped under a small `SectionHead` per channel with its count. The Queued filter lists in the order the video queue starts them, whatever the sort (`inQueueOrder`) (`packages/web/src/routes/projects.tsx`, `packages/web/src/routes/projects-row.tsx`) | `List`, `ListRow` (`packages/web/src/components/kit/list-row.tsx`) |
| Show more | Under the rows while more match: secondary small "Show N more" (up to 50) and "50 of 62 shown"; a new filter, search or order starts from the first 50 again (`projectsPage`) | `Button` |

There is no aside: the counts that were "At a glance" are on the filters, and the video queue is under Home → Running → Waiting to start, on the Queued filter and on each queued row.

A `ProjectRow` holds (`packages/web/src/routes/projects-row.tsx`):
- Lead: `RowCheck` "Select row: <title>" (a 16px box in a 24px label; Shift+click ticks a range, Space toggles) and the project's thumbnail (`ProjectThumb`, a film-icon well when there is none).
- Title: router Link to `/projects/$projectId` (truncated, the full title as its tooltip), a "Sample" `Badge` for the bundled samples, an "Outdated" `Badge` (waiting tone) when an edit left files outdated.
- Meta, one line: the `Status` lamp with its word (`listState`), with an sr-only polite live region `<title>: <state>`, then for a finished run `finishedLine`: length · shape · what it made · when it finished ("3:05 · 16:9 · video + 2 shorts + PDF · finished Sep 27"), and for any other run `madeOf` · `started <time>` ("Documentary dossier · 16:9 · started 14:02"). A run done with problems adds "PDF failed" (the steps it lost) and the link "See what failed" to that part of the project (`FailedStep`, `packages/web/src/home/ready.tsx`). A running row adds a `Meter progress` (max 240px, `role="progressbar"`) valued `<n>% done`.
- Actions, in words: "Open"; "Download video" (secondary) once a finished run made a video; then "Make my own copy" on a sample, "Mark uploaded" when the project is ready to upload, or "Undo upload mark" within 24 hours of marking (`uploadUndoable`; after that the selection bar's Mark not uploaded reverses it); "Earlier", "Later" and "Remove" on a row waiting in the video queue (`QueueItemActions`, `packages/web/src/components/batch-queue.tsx`); "Delete" (trash icon and word) on a row that is neither running nor queued, hidden on phones where the selection bar carries it.

`listState` words and tones (`packages/web/src/home/ready.tsx`, then `projectStateOf` in `packages/web/src/lib/state-words.ts` with words from `packages/app/src/slices/admission/state-words.ts`, the same the MCP tools say):

| Project | Word | Tone |
|---|---|---|
| running, a step held by a CLI plan limit | `limitWaitLine` text, e.g. "Waiting for Codex limits (resets at 14:00)" | waiting |
| done and marked uploaded | Uploaded | done |
| done, makes a video, not uploaded, not a sample | Ready to upload | done |
| held run (`heldRun`), set aside | Kept as is | done |
| held run parked on an External agent (MCP) review | Waiting for the agent | waiting |
| held run a restart stopped | Stopped | waiting |
| held run prepared by a schedule, waiting for its day | Prepared | waiting |
| any other held run | Waiting for your review | waiting |
| running | Running | running (pulsing lamp) |
| paused | Paused | waiting |
| pending, none of its run done | Queued | off |
| failed | Failed | failed |
| partial | Done with problems | waiting |
| done | Done | done |
| canceled | Canceled | off |

Filter predicates (shared with Home, `packages/app/src/slices/admission/state-words.ts`, `matches` in `packages/web/src/routes/projects-order.ts`): Running = `runningNow` (running, or parked on an External agent's review: exactly Home's Running); Queued = `queuedRun`; Needs you = `waitsForPerson` (paused, or held for the person: not Waiting for the agent, Prepared or Kept as is); Ready to upload = `isReadyToUpload` (`packages/web/src/home/ready.tsx`; never a sample); Failed = `failedRun`. The list is first narrowed to the channel shown (`useCurrentChannel`), then by filter and by case-insensitive title substring, then sorted (`sortProjects`: newest by `createdAt`; finished by `finishedAt`, unfinished after; recently changed by `updatedAt`; name with numeric, case-insensitive collation; status ranks waiting on you, running, paused, queued, failed, done with problems, done, canceled; ties newest first).

Bulk operations run each project on its own, so one refusal leaves the rest done, and report in a toast with Undo (`packages/web/src/routes/projects-bulk.tsx`):

| Action | Request | Toast | Undo |
|---|---|---|---|
| Mark uploaded | `PUT /api/projects/:id/uploaded {uploaded:true}` per ticked ready project | "Marked N projects uploaded." | the same with `false` |
| Mark not uploaded | `{uploaded:false}` per ticked uploaded project (it also forgets the long video's saved link) | "N projects back on Ready to upload." | marks them again |
| Move to <channel> | `POST /api/projects/move-channel` with the ticked ids | "Moved N projects to <channel>." | moves each back to the channel it came from |
| Make outdated parts again | plans each ticked project's remake, then a drawer "Make outdated parts again: N projects" lists what each makes again and what it costs; nothing starts until it is confirmed there | per project, in the drawer | none: nothing starts before the confirm |
| Delete | asks first (`Delete N projects?`, moves them to the trash for 30 days, plus how many running ones stay); `DELETE /api/projects/:id` per non-running ticked project | "Moved N projects to the trash." | `POST /api/trash/bulk/restore` with those projects |

A failure names the first project and the server's sentence in an error toast.

Commands registered in Ctrl+K while the screen is open: "Show projects that need you", "Show videos ready to upload", "Show failed projects" (group Projects), and "Search projects" (group This page, shortcut `/`).

## States
| State | Trigger | Rendered |
|---|---|---|
| Loading | `projects.data` undefined, no error | `SkeletonRows`: six `sl-row` items with `bg-sunken` bars for the thumbnail, title, meta and state, `aria-label="Loading projects"` |
| Load error | `projects.error` set | `role="alert"` paragraph in `text-danger` with the error message; no list |
| Empty install | zero projects in any channel | Tutorial invite plus `EmptyState` "No projects yet", "Every video you make is kept here with its files.", primary "Make your first video" to `/play` |
| Empty channel | projects exist, none in the channel shown | `No projects in <channel> yet. Show all channels to see the others.` |
| No match | filter or search leaves nothing | "No project matches. Clear the search or pick All." |
| Running row | status running | progress bar; no Delete (the server refuses deleting a running project; cancel it on its page first) |
| Upload mark busy | `markUploaded` in flight | Mark uploaded and Undo upload mark disabled, reason "Saving…", on every row |
| Upload marked | `markUploaded` resolves | Success toast "Marked uploaded: <title>." with Undo, or "<title> is back on Ready to upload." |
| Upload mark failed | `markUploaded` rejects | Error toast `<title> wasn't changed: <message> Press the button again.` |
| Copying a sample | Make my own copy pressed | Button "Copying…"; the copy opens once made; a failure toast says "Press Make my own copy again." |
| Delete confirm | Delete pressed | `ConfirmDialog` `Delete "<title>"?`, consequence that it moves to the trash for 30 days and Undo brings it back, buttons "Keep it" (focused) and destructive "Delete project" |
| Deleted | `removeProject` resolves | Success toast `Moved "<title>" to the trash.` with Undo, which restores it from the trash and says "Restored 1 project." (`restoreProjects`) |
| Delete failed | `removeProject` rejects | `role="alert"` small `text-danger` paragraph under the list with the message |
| Live refresh | project step events or active runs | The shell invalidates the projects query at most once a second on global step events, and the query polls every 15 s while any project is running or pending (`packages/web/src/components/shell.tsx`, `packages/web/src/queries.ts`) |

After delete or upload marking settles, the projects query is invalidated.

## Motion
- The running `Status` lamp pulses (`sl-pulse`, 1200ms, infinite); reduced motion stops it (`packages/web/src/styles/kit.css`).
- The confirm dialog enters with `dialog-in` (200ms ease-out), off under reduced motion.
- Toasts enter with `sl-enter` (200ms).
- The Meter fill has no transition.

## Copy
- Titles and labels: "Projects", "Showing:", "Search projects", "Show", "Sort projects", "Open", "Download video", "Mark uploaded", "Undo upload mark", "Make my own copy", "Earlier", "Later", "Remove", "Delete", "Sample", "Outdated", "Select all", "Mark not uploaded", "Move to channel…", "Make outdated parts again", "Clear selection", "Show N more".
- Filters: "All", "Running", "Queued", "Needs you", "Ready to upload", "Failed", each with its count.
- Row meta: finished `<length> · <shape> · <what it made> · finished <time>`; otherwise `<made of> · started <time>`; meter value text `<n>% done`.
- Control names: `Open <title>`, `Download video: <title>`, `Mark uploaded: <title>`, `Undo upload mark: <title>`, `Make my own copy of <title>`, `Delete <title>`, `Select row: <title>`.
- Errors name what failed and the next step ("Press the button again.", "Pick the channel again and press Move.").

## Not in play
- Row overflow menus: absent; every row action is a worded button on the row.
- An aside (At a glance, Video queue): removed; counts sit on the filters, the queue on Home and the Queued filter.
- A Create button in the header: removed; the rail's Create is the one way in.
- Bulk actions before anything is ticked: hidden, not greyed.
- A first-run redirect from this screen to `/welcome`: Home does that, not Projects.
- Retry on load error: absent; the error is a paragraph only.
- Offline and permission-denied states: not rendered.
