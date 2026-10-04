---
generated_at_commit: d83482c1175e
generated_date: 2026-10-02
capstone_version: 7.0.1
content_hash: e0334aa0552a
paths_covered:
  - ":(top)packages/web/src/routes/projects.tsx"
  - ":(top)packages/web/src/routes/projects-row.tsx"
  - ":(top)packages/web/src/routes/projects-bulk.tsx"
  - ":(top)packages/web/src/routes/projects-order.ts"
---

# Projects

## Mode & job
Operate surface at `/projects`: every run ever started, newest first unless another order is picked, for the channel picked in the rail, with each row's state and actions visible on it and a selection bar for several at once (`packages/web/src/routes/projects.tsx`). The route keeps the filter, the search words and the order in the address (`?show=`, `?q=`, `?sort=`; defaults left out) and replaces the history entry on each change, so Back from a project, a reload and Home's "See all" links open the same list (`projectsSearchOf` in `packages/web/src/router.tsx`, `projectFilterOf` and `projectSortOf` in `packages/web/src/routes/projects-order.ts`). The rail's Projects item (film icon, shown on phones) lights for `/projects` and Ctrl+K carries "Open projects" (`packages/web/src/components/shell.tsx:79-85`, `packages/web/src/components/shell.tsx:232-237`). A project's own page is `/projects/$projectId` (`packages/web/src/router.tsx:251-255`).

## Composition
| Region | What renders | Kit / tokens |
|---|---|---|
| Page header | Title "Projects"; meta line `N project(s) · <channel name>` or `· every channel` once data arrives; primary ButtonLink "New project" (plus icon) to `/play` (`packages/web/src/routes/projects.tsx:181-194`) | `PageHeader` (`packages/web/src/components/kit/layout.tsx:9`), `ButtonLink` (`packages/web/src/components/kit/link.tsx:38`) |
| Tutorial invite | Only when the install has zero projects: "Make your first video", one line on the walkthrough, secondary "Start tutorial"; hidden while a tutorial is active (`packages/web/src/routes/projects.tsx:196`, `packages/web/src/tutorial/launcher.tsx:21-37`) | `rounded-media border-line bg-surface` box |
| Board | `Board split="aside"`: a fluid list column beside a fixed 360px aside; below 1024px the columns stack (`packages/web/src/routes/projects.tsx:220`, `packages/web/src/styles/shell.css:869-871`, `packages/web/src/styles/shell.css:882-890`) | `Board`, `BoardColumn` (`packages/web/src/components/kit/board.tsx:15-58`) |
| List column toolbar | Search input (search icon, placeholder "Search projects", max 320px wide, `/` focuses it via `useSearchShortcut`; the address follows 300 ms after typing stops), a `Segmented` "Show" group: All, Running, Queued, Needs you, Ready to upload, Failed, and a `Select` "Sort projects": Newest first, Recently changed, Name (A–Z), Status (`packages/web/src/routes/projects-order.ts`, `packages/web/src/routes/projects.tsx`) | `sl-input`, `Segmented` (`packages/web/src/components/kit/switch.tsx:58`), `Select` (`packages/web/src/components/kit/field.tsx`) |
| Selection bar | `ProjectsBulkBar` above the rows: Select all (indeterminate while some are ticked; "Select all N shown" when a filter, search or Show more leaves rows out), "N projects" or "2 of 14 projects selected", then small buttons Mark uploaded (disabled "None of the selected projects is ready to upload"), Mark not uploaded (only when a selected row is marked uploaded), with two or more channels a `Select` "Move to channel…" and "Move to <channel>", destructive "Delete" (disabled "Running projects can't be deleted. Cancel the run first."), quiet "Clear selection"; every action disabled "Nothing is selected" until a row is ticked. Esc anywhere in the list clears the selection (`packages/web/src/routes/projects-bulk.tsx`, `packages/web/src/components/selection.tsx`) | `SelectionBar`, `Button`, `Select`, `ConfirmDialog` |
| Project rows | `List label="Projects"` of `ProjectRow`s, the first 50 of the matching projects in the picked order; grouped under a small `SectionHead` per channel when the rail shows All channels (`packages/web/src/routes/projects.tsx`, `packages/web/src/routes/projects-row.tsx`) | `List`, `ListRow` (`packages/web/src/components/kit/list-row.tsx`) |
| Show more | Under the rows while more match: secondary small "Show N more" (up to 50) and "50 of 62 shown"; a new filter, search or order starts from the first 50 again (`projectsPage` in `packages/web/src/routes/projects-order.ts`) | `Button` |
| Aside: At a glance | `SectionHead` "At a glance" over one `Stat` per non-All filter, counting the channel's projects matching it (`packages/web/src/routes/projects.tsx:270-285`) | `Stats`, `Stat` (`packages/web/src/components/kit/stats.tsx:5-33`) |
| Aside: Video queue | `SectionHead` "Video queue" with InfoTip `play.queue`, one line that the queue is on the calendar, TextLink "Open calendar" to `/calendar` (`packages/web/src/routes/projects.tsx:286-294`, `packages/web/src/help/entries/play.ts:528-532`) | `SectionHead`, `TextLink` |

A `ProjectRow` holds (`packages/web/src/routes/projects-row.tsx`):
- Lead: `RowCheck` "Select row: <title>", a 16px box in a 24px label so the pointer target meets WCAG 2.5.8; Shift+click ticks a range, Space toggles (`packages/web/src/components/selection.tsx`).
- Title: router Link to `/projects/$projectId` (truncated, the full title as its `title` tooltip), plus a "Sample" `Badge` for the bundled sample projects read from the onboarding record (`packages/web/src/routes/projects.tsx:120-124`, `packages/web/src/routes/projects.tsx:340-347`).
- Meta: `madeOf` (voice book label · the run's article prompt name · format, e.g. "Documentary dossier · 16:9") and `started <time>`, then ` · <n> views` and ` · <n>% CTR` once the Studio extension has read the long video's numbers (each omitted while unknown; `packages/web/src/routes/projects.tsx:352-355`, `packages/app/src/slices/admission/model.ts:358-360`); the meta line truncates with the full text as its tooltip; a running project adds a `Meter progress` (max 240px, `role="progressbar"` because it measures a task towards done) valued `<n>% done` (`packages/web/src/routes/projects.tsx:94-106`, `packages/web/src/routes/projects.tsx:348-365`, `packages/web/src/components/kit/stats.tsx:36-66`).
- Actions: `Status` lamp and word from `stateOf`, with an sr-only polite live region `<title>: <state>`; "Mark uploaded" quiet small button plus InfoTip `project.mark-uploaded` when the project is ready to upload; an "Uploaded" `Badge` when `uploadedAt` is set, plus quiet "Undo upload mark" (aria-label `Undo upload mark: <title>`, tooltip "Puts it back on Ready to upload. Offered for a day after marking.") only within 24 hours of `uploadedAt` (`uploadUndoable`); after that the selection bar's Mark not uploaded reverses it; an icon-only Delete (trash) button (`packages/web/src/routes/projects.tsx:366-412`, `packages/web/src/help/entries/project.ts:316-320`).

`stateOf` words and tones (`packages/web/src/routes/projects-row.tsx`):

| Project status | Word | Tone |
|---|---|---|
| waiting on the user, checked first (`isWaiting`, `packages/web/src/home/needs-you.tsx:47`) | Waiting for you | waiting |
| running, a step held by a CLI plan limit | `limitWaitLine` text, e.g. "Waiting for Codex limits (resets at 14:00)" (`packages/web/src/project/limit-wait.ts:11`) | waiting |
| running | Running | running (pulsing lamp) |
| paused | Paused | waiting |
| pending and `setAside` ("Keep as is" on Needs you, `packages/app/src/slices/admission/model.ts:340-342`) | Kept as is | done |
| pending | Queued | off |
| failed | Failed | failed |
| partial | Done with problems | info |
| done | Done | done |
| canceled | Canceled | off |

Filter predicates: Running = running or paused; Queued = `isQueued`; Needs you = `isWaiting`; Ready to upload = `isReadyToUpload`; Failed = failed or partial (`matches` in `packages/web/src/routes/projects-order.ts`, `packages/web/src/home/running-more.tsx:8`, `packages/web/src/home/ready.tsx:18`). The list is first narrowed to the rail's current channel (`useCurrentChannel`), then by filter and by case-insensitive title substring, then sorted (`sortProjects`: newest by `createdAt`; recently changed by `updatedAt`; name with numeric, case-insensitive collation; status ranks waiting on you, running, paused, queued, failed, done with problems, done, canceled; ties newest first) (`packages/web/src/routes/projects-order.ts`, `packages/web/src/channels/current.tsx:85-87`).

Bulk operations run each project on its own, so one refusal leaves the rest done, and report in a toast with Undo (`packages/web/src/routes/projects-bulk.tsx`):

| Action | Request | Toast | Undo |
|---|---|---|---|
| Mark uploaded | `PUT /api/projects/:id/uploaded {uploaded:true}` per selected ready project | "Marked N projects uploaded." | the same with `false` |
| Mark not uploaded | `{uploaded:false}` per selected uploaded project | "N projects back on Ready to upload." | marks them again |
| Move to <channel> | `POST /api/projects/move-channel` with the selected ids | "Moved N projects to <channel>." | moves each back to the channel it came from |
| Delete | asks first (`Delete N projects?`, "Moves these N projects to the trash for 30 days. Undo brings them back, or restore them later in Settings → Backup & storage → Trash." plus how many running ones stay); `DELETE /api/projects/:id` per non-running selected project | "Moved N projects to the trash." | `POST /api/trash/bulk/restore` with those projects |

A failure names the first project and the server's sentence in an error toast. There is no bulk re-run: a re-run spends money per project and needs a combined scope and cost review first.

Commands registered in Ctrl+K while the screen is open: "Show projects that need you", "Show videos ready to upload", "Show failed projects" (group Projects), and "Search projects" (group This page, shortcut `/`) (`packages/web/src/routes/projects.tsx:127`, `packages/web/src/routes/projects.tsx:149-169`).

## States
| State | Trigger | Rendered |
|---|---|---|
| Loading | `projects.data` undefined, no error | `SkeletonRows`: six `sl-row` items with `bg-sunken` bars matching title, meta and state widths, `aria-label="Loading projects"` (`packages/web/src/routes/projects.tsx:204-207`, `packages/web/src/routes/projects.tsx:417-432`) |
| Load error | `projects.error` set | `role="alert"` paragraph in `text-danger` with the error message; no list, no retry control (`packages/web/src/routes/projects.tsx:198-202`) |
| Empty install | zero projects in any channel | Tutorial invite plus `EmptyState` "No projects yet", "Set up a run on Play: pick a template, type a topic and start.", primary "Make your first video" to `/play` (`packages/web/src/routes/projects.tsx:196`, `packages/web/src/routes/projects.tsx:208-218`, `packages/web/src/components/kit/empty-state.tsx:6-24`) |
| Empty channel | projects exist, none in the current channel | `No projects in <channel> yet. Pick All channels in the rail to see the others.` (`packages/web/src/routes/projects.tsx:248-251`) |
| No match | filter or search leaves nothing | "No project matches. Clear the search or pick All." (`packages/web/src/routes/projects.tsx:252`) |
| Running row | status running | progress bar shown; Delete disabled with tooltip "Cancel the run first, then delete it." (`packages/web/src/routes/projects.tsx:336-363`, `packages/web/src/routes/projects.tsx:402-410`) |
| Upload mark busy | `markUploaded` in flight | Mark uploaded and Undo upload mark disabled with tooltip "Saving…" on every row (`packages/web/src/routes/projects-row.tsx`) |
| Upload marked | `markUploaded` resolves | Success toast "Marked uploaded: <title>." with Undo, or "<title> is back on Ready to upload." (`packages/web/src/routes/projects.tsx`) |
| Upload mark failed | `markUploaded` rejects | Error toast `<title> wasn't changed: <message> Press the button again.` (`packages/web/src/routes/projects.tsx`, `packages/web/src/home/api.ts:47`) |
| Delete confirm | Delete pressed | `ConfirmDialog` `Delete "<title>"?`, consequence "Moves the project to the trash for 30 days. Undo brings it back, or restore it later in Settings → Backup & storage → Trash.", buttons "Keep it" (focused) and destructive "Delete project"; confirm disabled "Working on it" while pending (`packages/web/src/routes/projects.tsx`, `packages/web/src/components/kit/dialog.tsx:60-108`) |
| Deleted | `removeProject` resolves | Success toast `Moved "<title>" to the trash.` with Undo, which restores it from the trash and says "Restored 1 project." (`restoreProjects` in `packages/web/src/routes/projects-bulk.tsx`) |
| Delete failed | `removeProject` rejects | `role="alert"` small `text-danger` paragraph under the board with the message (`packages/web/src/routes/projects.tsx:299-303`) |
| Live refresh | project step events or active runs | The shell invalidates the projects query at most once a second on global step events, and the query polls every 15 s while any project is running or pending (`packages/web/src/components/shell.tsx:329-334`, `packages/web/src/queries.ts:60-71`) |

After delete or upload marking settles, the projects query is invalidated (`packages/web/src/routes/projects.tsx:131-134`, `packages/web/src/routes/projects.tsx:144-146`).

## Motion
- The running `Status` lamp pulses (`sl-pulse`, 1200ms, infinite); reduced motion stops it (`packages/web/src/styles/kit.css:396-422`).
- The confirm dialog enters with `dialog-in` (200ms ease-out), off under reduced motion (`packages/web/src/styles/index.css:89`, `packages/web/src/components/ui/dialog.tsx:39`).
- Toasts enter with `sl-enter` (200ms) (`packages/web/src/components/kit/toast.tsx:91`, `packages/web/src/styles/shell.css:165-172`).
- The Meter fill has no transition (`packages/web/src/styles/kit.css:1185-1199`).

## Copy
- Titles and labels: "Projects", "New project", "Search projects", "Show", "Sort projects", "At a glance", "Video queue", "Open calendar", "Mark uploaded", "Uploaded", "Undo upload mark", "Sample", "Select all", "Mark not uploaded", "Move to channel…", "Delete", "Clear selection", "Show N more" (`packages/web/src/routes/projects.tsx`, `packages/web/src/routes/projects-row.tsx`, `packages/web/src/routes/projects-bulk.tsx`).
- Row meta: `<made of> · started <time>[ · <n> views[ · <n>% CTR]]`, views with locale thousands separators; meter value text `<n>% done` (`packages/web/src/routes/projects.tsx:350-363`).
- Video queue line: "Videos started together, in the order they run, are on the calendar." (`packages/web/src/routes/projects.tsx:289`).
- Control names: `Delete <title>`, `Undo upload mark: <title>`, `Select row: <title>` (`packages/web/src/routes/projects-row.tsx`).
- Errors name what failed and the next step ("Press the button again.", "Cancel the run first, then delete it.") (`packages/web/src/routes/projects.tsx:141`, `packages/web/src/routes/projects.tsx:406`).

## Not in play
- Row overflow menus: absent; every row action is visible inline (`packages/web/src/routes/projects.tsx:366-412`).
- The batch-queue rail: absent; the aside links to the calendar instead (`packages/web/src/routes/projects.tsx:286-294`).
- A first-run redirect from this screen to `/welcome`: not implemented in `packages/web/src/routes/projects.tsx`; the router comment at `packages/web/src/router.tsx:85` names one.
- Bulk re-run: absent on purpose; see the bulk table above.
- Retry on load error: absent; the error is a paragraph only (`packages/web/src/routes/projects.tsx:198-202`).
- Offline and permission-denied states: not rendered.
