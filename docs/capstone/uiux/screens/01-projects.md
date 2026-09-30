---
generated_at_commit: 54f5cb4c1dab
generated_date: 2026-09-30
capstone_version: 7.0.1
content_hash: 68071daf4a64
paths_covered:
  - ":(top)packages/web/src/routes/projects.tsx"
---

# Projects

## Mode & job
Operate surface at `/projects`: every run ever started, newest first, for the channel picked in the rail, with each row's state and actions visible on it (`packages/web/src/routes/projects.tsx:35-38`). The route validates `?show=` against the six filter values and remounts the screen keyed by it, so Home's "See all" links open on a filter (`packages/web/src/router.tsx:68-82`, `packages/web/src/routes/projects.tsx:44-47`). The rail's Projects item (film icon, shown on phones) lights for `/projects` and Ctrl+K carries "Open projects" (`packages/web/src/components/shell.tsx:79-85`, `packages/web/src/components/shell.tsx:232-237`). A project's own page is `/projects/$projectId` (`packages/web/src/router.tsx:250-254`).

## Composition
| Region | What renders | Kit / tokens |
|---|---|---|
| Page header | Title "Projects"; meta line `N project(s) · <channel name>` or `· every channel` once data arrives; primary ButtonLink "New project" (plus icon) to `/play` (`packages/web/src/routes/projects.tsx:179-192`) | `PageHeader` (`packages/web/src/components/kit/layout.tsx:9`), `ButtonLink` (`packages/web/src/components/kit/link.tsx:38`) |
| Tutorial invite | Only when the install has zero projects: "Make your first video", one line on the walkthrough, secondary "Start tutorial"; hidden while a tutorial is active (`packages/web/src/routes/projects.tsx:194`, `packages/web/src/tutorial/launcher.tsx:21-37`) | `rounded-media border-line bg-surface` box |
| Board | `Board split="aside"`: a fluid list column beside a fixed 360px aside; below 1024px the columns stack (`packages/web/src/routes/projects.tsx:218`, `packages/web/src/styles/shell.css:869-871`, `packages/web/src/styles/shell.css:882-890`) | `Board`, `BoardColumn` (`packages/web/src/components/kit/board.tsx:15-58`) |
| List column toolbar | Search input (search icon, placeholder "Search projects", max 320px wide, `/` focuses it via `useSearchShortcut`) and a `Segmented` "Show" group: All, Running, Queued, Needs you, Ready to upload, Failed (`packages/web/src/routes/projects.tsx:49-56`, `packages/web/src/routes/projects.tsx:220-245`, `packages/web/src/components/kit/command-palette.tsx:133-150`) | `sl-input`, `Segmented` (`packages/web/src/components/kit/switch.tsx:58`) |
| Project rows | `List label="Projects"` of `ProjectRow`s (`packages/web/src/routes/projects.tsx:253-264`) | `List`, `ListRow` (`packages/web/src/components/kit/list-row.tsx:13-77`) |
| Aside: At a glance | `SectionHead` "At a glance" over one `Stat` per non-All filter, counting the channel's projects matching it (`packages/web/src/routes/projects.tsx:268-283`) | `Stats`, `Stat` (`packages/web/src/components/kit/stats.tsx:5-33`) |
| Aside: Video queue | `SectionHead` "Video queue" with InfoTip `play.queue`, one line that the queue is on the calendar, TextLink "Open calendar" to `/calendar` (`packages/web/src/routes/projects.tsx:284-292`, `packages/web/src/help/entries/play.ts:523-527`) | `SectionHead`, `TextLink` |

A `ProjectRow` holds (`packages/web/src/routes/projects.tsx:320-408`):
- Title: router Link to `/projects/$projectId`, plus a "Sample" `Badge` for the bundled sample projects read from the onboarding record (`packages/web/src/routes/projects.tsx:118-122`, `packages/web/src/routes/projects.tsx:338-345`).
- Meta: `madeOf` (voice book label · the run's article prompt name · format, e.g. "Documentary dossier · 16:9") and `started <time>`; a running project adds a `Meter` (max 240px) valued `<n>% done` (`packages/web/src/routes/projects.tsx:92-104`, `packages/web/src/routes/projects.tsx:346-358`, `packages/web/src/components/kit/stats.tsx:36-66`).
- Actions: `Status` lamp and word from `stateOf`, with an sr-only polite live region `<title>: <state>`; "Mark uploaded" quiet small button plus InfoTip `project.mark-uploaded` when the project is ready to upload; an "Uploaded" `Badge` and quiet "Undo" when `uploadedAt` is set; an icon-only Delete (trash) button (`packages/web/src/routes/projects.tsx:359-405`, `packages/web/src/help/entries/project.ts:311-315`).

`stateOf` words and tones (`packages/web/src/routes/projects.tsx:76-90`):

| Project status | Word | Tone |
|---|---|---|
| waiting on the user (`isWaiting`, `packages/web/src/home/needs-you.tsx:46`) | Waiting for you | waiting |
| running, a step held by a CLI plan limit | `limitWaitLine` text, e.g. "Waiting for Codex limits (resets at 14:00)" (`packages/web/src/project/limit-wait.ts:11`) | waiting |
| running | Running | running (pulsing lamp) |
| paused | Paused | waiting |
| pending | Queued | off |
| failed | Failed | failed |
| partial | Done with problems | info |
| done | Done | done |
| canceled | Canceled | off |

Filter predicates: Running = running or paused; Queued = `isQueued`; Needs you = `isWaiting`; Ready to upload = `isReadyToUpload`; Failed = failed or partial (`packages/web/src/routes/projects.tsx:58-73`, `packages/web/src/home/running-more.tsx:8`, `packages/web/src/home/ready.tsx:18`). The list is first narrowed to the rail's current channel (`useCurrentChannel`), then by filter and by case-insensitive title substring (`packages/web/src/routes/projects.tsx:169-175`, `packages/web/src/channels/current.tsx:85-87`).

Commands registered in Ctrl+K while the screen is open: "Show projects that need you", "Show videos ready to upload", "Show failed projects" (group Projects), and "Search projects" (group This page, shortcut `/`) (`packages/web/src/routes/projects.tsx:125`, `packages/web/src/routes/projects.tsx:147-167`).

## States
| State | Trigger | Rendered |
|---|---|---|
| Loading | `projects.data` undefined, no error | `SkeletonRows`: six `sl-row` items with `bg-sunken` bars matching title, meta and state widths, `aria-label="Loading projects"` (`packages/web/src/routes/projects.tsx:202-205`, `packages/web/src/routes/projects.tsx:410-425`) |
| Load error | `projects.error` set | `role="alert"` paragraph in `text-danger` with the error message; no list, no retry control (`packages/web/src/routes/projects.tsx:196-200`) |
| Empty install | zero projects in any channel | Tutorial invite plus `EmptyState` "No projects yet", "Set up a run on Play: pick a template, type a topic and start.", primary "Make your first video" to `/play` (`packages/web/src/routes/projects.tsx:194`, `packages/web/src/routes/projects.tsx:206-216`, `packages/web/src/components/kit/empty-state.tsx:6-24`) |
| Empty channel | projects exist, none in the current channel | `No projects in <channel> yet. Pick All channels in the rail to see the others.` (`packages/web/src/routes/projects.tsx:246-249`) |
| No match | filter or search leaves nothing | "No project matches. Clear the search or pick All." (`packages/web/src/routes/projects.tsx:250`) |
| Running row | status running | Meter shown; Delete disabled with tooltip "Cancel the run first, then delete it." (`packages/web/src/routes/projects.tsx:334-356`, `packages/web/src/routes/projects.tsx:395-403`) |
| Upload mark busy | `markUploaded` in flight | Mark uploaded and Undo disabled with tooltip "Saving…" on every row (`packages/web/src/routes/projects.tsx:261`, `packages/web/src/routes/projects.tsx:368-392`) |
| Upload mark failed | `markUploaded` rejects | Error toast `<title> wasn't changed: <message> Press the button again.` (`packages/web/src/routes/projects.tsx:134-145`, `packages/web/src/home/api.ts:32`) |
| Delete confirm | Delete pressed | `ConfirmDialog` `Delete "<title>"?`, consequence "Moves the project to the trash for 30 days. Restore it or delete it for good in Settings → Trash.", buttons "Keep it" (focused) and destructive "Delete project"; confirm disabled "Working on it" while pending (`packages/web/src/routes/projects.tsx:303-315`, `packages/web/src/components/kit/dialog.tsx:60-108`) |
| Delete failed | `removeProject` rejects | `role="alert"` small `text-danger` paragraph under the board with the message (`packages/web/src/routes/projects.tsx:297-301`) |
| Live refresh | project step events or active runs | The shell invalidates the projects query at most once a second on global step events, and the query polls every 15 s while any project is running or pending (`packages/web/src/components/shell.tsx:329-334`, `packages/web/src/queries.ts:60-71`) |

After delete or upload marking settles, the projects query is invalidated (`packages/web/src/routes/projects.tsx:129-132`, `packages/web/src/routes/projects.tsx:142-144`).

## Motion
- The running `Status` lamp pulses (`sl-pulse`, 1200ms, infinite); reduced motion stops it (`packages/web/src/styles/kit.css:396-422`).
- The confirm dialog enters with `dialog-in` (200ms ease-out), off under reduced motion (`packages/web/src/styles/index.css:89`, `packages/web/src/components/ui/dialog.tsx:39`).
- Toasts enter with `sl-enter` (200ms) (`packages/web/src/components/kit/toast.tsx:91`, `packages/web/src/styles/shell.css:165-172`).
- The Meter fill has no transition (`packages/web/src/styles/kit.css:1182-1196`).

## Copy
- Titles and labels: "Projects", "New project", "Search projects", "Show", "At a glance", "Video queue", "Open calendar", "Mark uploaded", "Uploaded", "Undo", "Sample" (`packages/web/src/routes/projects.tsx:180-392`).
- Row meta: `<made of> · started <time>`; meter value text `<n>% done` (`packages/web/src/routes/projects.tsx:348-353`).
- Video queue line: "Videos started together, in the order they run, are on the calendar." (`packages/web/src/routes/projects.tsx:287`).
- Icon button names: `Delete <title>`, `Mark <title> not uploaded` (`packages/web/src/routes/projects.tsx:386`, `packages/web/src/routes/projects.tsx:396`).
- Errors name what failed and the next step ("Press the button again.", "Cancel the run first, then delete it.") (`packages/web/src/routes/projects.tsx:139`, `packages/web/src/routes/projects.tsx:399`).

## Not in play
- Row overflow menus: absent; every row action is visible inline (`packages/web/src/routes/projects.tsx:359-405`).
- The batch-queue rail: absent; the aside links to the calendar instead (`packages/web/src/routes/projects.tsx:284-292`).
- A first-run redirect from this screen to `/welcome`: not implemented in `packages/web/src/routes/projects.tsx`; the router comment at `packages/web/src/router.tsx:84` names one.
- Pagination, sorting controls and bulk selection: absent (`packages/web/src/routes/projects.tsx:169-175`).
- Retry on load error: absent; the error is a paragraph only (`packages/web/src/routes/projects.tsx:196-200`).
- Search and filter persistence: component state only, lost on leaving; only `?show=` survives in the URL (`packages/web/src/routes/projects.tsx:117`, `packages/web/src/routes/projects.tsx:123`, `packages/web/src/router.tsx:78-82`).
- Offline and permission-denied states: not rendered.
