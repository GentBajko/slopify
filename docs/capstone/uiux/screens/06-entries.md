---
generated_at_commit: 54f5cb4c1dab
generated_date: 2026-09-30
capstone_version: 7.0.1
content_hash: 81bf4d445fb5
paths_covered:
  - ":(top)packages/web/src/routes/entries.tsx"
  - ":(top)packages/web/src/routes/library.tsx"
  - ":(top)packages/web/src/library/**"
  - ":(top)packages/web/src/lib/entry-options.ts"
  - ":(top)packages/web/src/router.tsx"
---

# Intros and outros

## Mode & job

Operate surface: the Library's Intros & Outros tab at `/entries?category=intro|outro`, for finding, renaming, previewing, handing to Play, duplicating and deleting saved intro/outro entries. `entriesRoute` is a child of `libraryRoute` and validates `category` through `categoryOf`, which falls back to `intro` (`packages/web/src/router.tsx:279`, `packages/web/src/lib/entry-options.ts:58`). The category switch replaces the URL (`replace: true`) rather than pushing history (`packages/web/src/router.tsx:525`). The shell's Library nav item stays lit for `/entries` (`packages/web/src/components/shell.tsx:111`).

## Composition

Top to bottom, inside `LibraryLayout` (`packages/web/src/routes/library.tsx:22`):

| Region | What renders | Source |
|---|---|---|
| Page header | kit `PageHeader` titled "Library", meta "Prompts, intros and outros, templates, document themes and narration aliases" | `packages/web/src/routes/library.tsx:25` |
| Tabs | kit `TabLinks` "Library sections": Prompts, Intros & Outros, Templates, Documents, Aliases | `packages/web/src/routes/library.tsx:14`, `:29` |
| Toolbar | `LibraryToolbar`: filters left, one action right (wraps under on a phone) | `packages/web/src/routes/library.tsx:112` |
| Toolbar filters | kit `Input type="search"` "Search intros and outros" (width `sm:w-64`, keyboard shortcut from `useSearchShortcut`), then kit `Segmented` "Entry category" with Intros / Outros and an InfoTip `library.entry.category` | `packages/web/src/routes/entries.tsx:89`, `:99` |
| Toolbar action | primary `ButtonLink` "New intro or outro" → `/entries/new?category=<current>` | `packages/web/src/routes/entries.tsx:84` |
| Body | kit `ListDetail` with `libraryListDetail` (two equal columns from 1180 px; one column at phone width) | `packages/web/src/routes/entries.tsx:123`, `packages/web/src/library/list-states.tsx:7`, `packages/web/src/styles/shell.css:719` |

List column: a kit `List` labelled "Intros" / "Outros" of `ListRow`s (`packages/web/src/routes/entries.tsx:129`). Each row:

- Title: `InlineName`: the name as a `RowSelect` (selects the row for the detail) plus a pencil `IconButton` "Rename <name>" (`packages/web/src/library/inline-name.tsx:87`).
- Meta: `<Mode> · <n> keyword(s) · updated <date>` (`packages/web/src/routes/entries.tsx:241`).
- Actions, all visible, via `LibraryRowActions` (`packages/web/src/library/row-actions.tsx:10`): quiet small `ButtonLink` "Edit" → `/entries/$entryId`; "Duplicate" → `/entries/new?category=&from=<id>`; quiet "Use in Play"; `IconButton` History (clock icon) and Delete (trash icon) (`packages/web/src/routes/entries.tsx:144`).

Detail column: `LibraryItemDetail` for the selected row, or the first listed row when nothing is picked (`packages/web/src/routes/entries.tsx:78`, `:185`):

- kit `SectionHead` with the name, kicker `<Intro|Outro> · <Text|LLM>`, meta `Updated <date>`, and a small `ButtonLink` "Edit intro" / "Edit outro" (`packages/web/src/library/item-detail.tsx:38`).
- The body in a sunken monospace block capped at 420 px with its own scroll, then keyword chips (`Code` `{{slot}}`) or "No keywords. It runs as written." (`packages/web/src/library/item-detail.tsx:42`).
- "Used by" (h3, InfoTip `library.used-by`, meta "<n> templates, <n> schedules, <n> projects"): links to `/templates`, `/calendar?tab=schedules&schedule=`, and `/projects/$projectId` with revision counts (`packages/web/src/library/item-detail.tsx:63`).
- "History" (h3, InfoTip `library.history`, meta "<n> versions · latest …") with "Compare versions", then a `DiffColumns` word diff of the two newest versions (`packages/web/src/library/item-detail.tsx:132`).

Overlays: `HistoryDrawer` (kit `Drawer` "History of <name>": Compare section, Versions list with "Current" or "Restore" per version, a `StatusSlot`) (`packages/web/src/library/history-drawer.tsx:84`); kit `ConfirmDialog` for Delete (`packages/web/src/routes/entries.tsx:222`).

Ctrl+K commands registered on every Library tab: "New intro or outro" (starts on the tab's category), "Open intros and outros", plus the other Library new/open commands (`packages/web/src/routes/library.tsx:39`).

## States

| State | Trigger | Rendering | Source |
|---|---|---|---|
| Loading | entries query without data and no error | `ListSkeleton` "Intros and outros, loading": three rows of two sunken bars, `aria-busy` | `packages/web/src/routes/entries.tsx:116`, `packages/web/src/library/list-states.tsx:12` |
| Load error | entries query error | danger `Callout` "The intros and outros couldn't be loaded." with the server message and "Try again" (refetch) | `packages/web/src/routes/entries.tsx:108`, `packages/web/src/library/list-states.tsx:28` |
| Empty category | no entry of this category | kit `EmptyState` "No intros yet" / "No outros yet" with "An intro is narrated before the body in the run's voice." (after for outro); no detail column | `packages/web/src/routes/entries.tsx:246` |
| No search match | search filters out every row | `No intros match "<query>".` in place of the list; the search matches name or body, case-insensitive | `packages/web/src/routes/entries.tsx:70`, `:127` |
| Selected | a row picked or the first row by default | row `selected`; detail shows that entry | `packages/web/src/routes/entries.tsx:142` |
| Renaming | pencil pressed | inline `Input` "New name for <name>" with "Save name" (primary, "Saving…" while pending) and "Cancel"; Enter saves, Escape cancels; empty name says "Write a name first, or press Cancel to keep the old one." | `packages/web/src/library/inline-name.tsx:109`, `:56` |
| Rename refused | server rejects the name | `role="alert"` line "The name wasn't saved. <server field messages>" | `packages/web/src/library/inline-name.tsx:12`, `:141` |
| Rename saved | save ok | success toast `Renamed “<old>” to “<new>”.` with an Undo action | `packages/web/src/library/inline-name.tsx:72` |
| Use in Play blocked | Play is starting a run from its draft | "Use in Play" disabled, `title` "Play is starting a run from its draft. Wait for it to start, then try again." | `packages/web/src/router.tsx:473`, `packages/web/src/library/row-actions.tsx:42` |
| Used by / history unreadable | per-section query error | danger text "What uses it couldn't be read: …" / "The history couldn't be read: …" | `packages/web/src/library/item-detail.tsx:81`, `:163` |
| Unused / single version | no templates, schedules or projects; one version | "Nothing uses it yet." / "Only one version so far." | `packages/web/src/library/item-detail.tsx:90`, `:169` |
| Delete confirm | trash icon | `ConfirmDialog` `Delete "<name>"?`, consequence "Moves it to the trash for 30 days (Settings → Trash). Projects that used it keep their text.", confirm "Delete intro" / "Delete outro", pending while the request runs | `packages/web/src/routes/entries.tsx:222` |
| Delete failed | remove mutation error | danger `Callout` "The intro wasn't deleted." with the message, under the list | `packages/web/src/routes/entries.tsx:206` |

## Motion

The `HistoryDrawer` opens with the kit drawer's `animate-tick-in` (150 ms fade), off under reduced motion (`packages/web/src/components/kit/drawer.tsx:70`, `packages/web/src/styles/index.css:90`). The list, detail and dialog have no route-specific animation (`packages/web/src/routes/entries.tsx`).

## Copy

Sentence-case, plain statements that name the thing and the way out. Key labels: "New intro or outro", "Search intros and outros", "Intros" / "Outros", "Edit", "Duplicate", "Use in Play", "Edit intro", "Used by", "History", "Compare versions", "Save name" (`packages/web/src/routes/entries.tsx:85`, `packages/web/src/library/row-actions.tsx:50`, `packages/web/src/library/item-detail.tsx:75`). Mode labels are "Text" and "LLM" (`packages/web/src/lib/entry-options.ts:22`). Delete copy names the trash and its 30 days (`packages/web/src/routes/entries.tsx:227`).

## Not in play

- No overflow menu: row actions are always visible (`packages/web/src/library/row-actions.tsx:6`).
- No bulk selection, sorting control or pagination; the list endpoint's name order is used as-is (`packages/web/src/routes/entries.tsx:24`).
- No offline or permission-denied state; failures surface as the load-error callout (`packages/web/src/routes/entries.tsx:108`).
