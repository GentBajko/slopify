---
generated_at_commit: e9226a34aa8a
generated_date: 2026-10-02
capstone_version: 7.0.1
content_hash: 33049148a289
paths_covered:
  - ":(top)packages/web/src/routes/prompts.tsx"
  - ":(top)packages/web/src/routes/library.tsx"
  - ":(top)packages/web/src/library/**"
  - ":(top)packages/web/src/lib/prompt-kinds.ts"
---

# Prompts

## Mode & job
Operate surface, the Library's Prompts tab at `/prompts?kind=<kind>`: every saved prompt of one kind beside the selected one's text, keywords, what uses it and its latest change, with rename, edit, duplicate, Use in Play, history and delete on each row (`packages/web/src/routes/prompts.tsx:24-27`). The kind comes from the URL through `kindOf`, defaulting to `article`; switching it replaces the URL entry (`packages/web/src/router.tsx:257-262`, `packages/web/src/router.tsx:455-468`, `packages/web/src/lib/prompt-kinds.ts:30-32`). `/library` redirects here with `kind=article` (`packages/web/src/router.tsx:106-112`). The rail's Library item points at `/prompts` and lights for every Library path (`packages/web/src/components/shell.tsx:104-112`).

Kinds, in order: Article, Image, Thumbnail, Narration Preparation, YouTube Description, Shorts, Review, Script (speakers) (`packages/app/src/slices/library/model.ts:12-21`, `packages/web/src/lib/prompt-kinds.ts:7-26`).

## Composition
| Region | What renders | Kit / tokens |
|---|---|---|
| Library header | `PageHeader` "Library", meta "Prompts, intros and outros, templates, document themes, narration aliases and A/B results" (`packages/web/src/routes/library.tsx:26-29`) | `PageHeader` (`packages/web/src/components/kit/layout.tsx:9`) |
| Library tabs | `TabLinks` "Library sections": Prompts, Intros & Outros, Templates, Documents, Aliases, A/B results (`packages/web/src/routes/library.tsx:14-21`, `packages/web/src/routes/library.tsx:30`) | `TabLinks` (`packages/web/src/components/kit/tabs.tsx:95`) |
| Toolbar | `LibraryToolbar`: search `Input` ("Search prompts", `/` focuses it, full width on phones, 16rem from `sm`), `Select` "Prompt kind" with InfoTip `library.prompt.kind`; primary ButtonLink "New prompt" to `/prompts/new?kind=<kind>` at the right, wrapping under the filters on a phone (`packages/web/src/routes/prompts.tsx:78-102`, `packages/web/src/routes/prompts.tsx:245-251`, `packages/web/src/routes/library.tsx:111-131`) | `Input`, `Select` (`packages/web/src/components/kit/field.tsx:109-141`), `InfoTip` |
| List and detail | `ListDetail`: list column beside the detail; two equal columns from 1180px (`libraryListDetail`), the kit default `minmax(280px,380px) 1fr` below that, one column under 768px (`packages/web/src/routes/prompts.tsx:121-205`, `packages/web/src/library/list-states.tsx:5-8`, `packages/web/src/styles/shell.css:719-724`, `packages/web/src/styles/shell.css:981-984`) | `ListDetail` (`packages/web/src/components/kit/layout.tsx:98`) |
| Rows | `List label="Prompts"`; each `ListRow` (actions beside the title from `2xl`, under it below) has an `InlineName` title, meta `<Kind> · <n> keyword(s) · updated <date>`, and `LibraryRowActions` (`packages/web/src/routes/prompts.tsx:127-178`, `packages/web/src/routes/prompts.tsx:241-243`) | `List`, `ListRow` (`packages/web/src/components/kit/list-row.tsx:13-77`) |
| Detail | `LibraryItemDetail` for the selected prompt (the first listed when none is picked) (`packages/web/src/routes/prompts.tsx:74`, `packages/web/src/routes/prompts.tsx:181-204`) | see below |

**Row title (`InlineName`)**: the name is a `RowSelect` button that selects the row, followed by a pencil icon button "Rename <name>". Rename swaps in an autofocused `Input` (max 200), primary "Save name" (reads "Saving…" while pending), quiet "Cancel" and InfoTip `library.inline-rename`; Enter saves, Escape cancels. A saved rename raises a success toast `Renamed "<old>" to "<new>".` with an Undo action that renames back (`packages/web/src/library/inline-name.tsx:20-148`, `packages/web/src/routes/prompts.tsx:57-62`).

**Row actions (`LibraryRowActions`)**, all visible, in this order (`packages/web/src/library/row-actions.tsx:6-63`, `packages/web/src/routes/prompts.tsx:142-174`):
1. Edit: quiet small ButtonLink to `/prompts/$promptId`.
2. Duplicate: quiet small ButtonLink to `/prompts/new?kind=<kind>&from=<id>`; the editor opens the copy named `<name> copy`.
3. Use in Play: quiet small button; picks the prompt in the open Play draft and opens Play on its field. Disabled with the title "Play is starting a run from its draft. Wait for it to start, then try again." while Play is starting a run (`packages/web/src/router.tsx:470-491`).
4. History: icon button (history icon) opening the `HistoryDrawer`.
5. Delete: icon button (trash icon) opening the confirm dialog.

**Detail (`LibraryItemDetail`)** (`packages/web/src/library/item-detail.tsx:14-180`):
- `SectionHead` with the prompt name, kicker `<Kind> prompt`, meta `Updated <date>`, and small ButtonLink "Edit prompt" (`packages/web/src/routes/prompts.tsx:183-200`).
- Body text in a `bg-sunken rounded-media` mono block, max 420px tall, scrolling (`packages/web/src/library/item-detail.tsx:42-44`).
- Keywords as `Code` chips `{{slot}}`, or "No keywords. It runs as written." (`packages/web/src/library/item-detail.tsx:45-55`).
- "Used by" (InfoTip `library.used-by`, meta counts `<n> templates, <n> schedules, <n> projects`): rows linking to Templates, to the schedule on `/calendar?tab=schedules`, and to each project with its revision count; or "Nothing uses it yet." (`packages/web/src/library/item-detail.tsx:63-130`).
- "History" (InfoTip `library.history`, meta `<n> versions · latest <author> · <when>`) with small "Compare versions" opening the drawer, and a word diff of the last two versions, or "Only one version so far." (`packages/web/src/library/item-detail.tsx:132-180`).

**History drawer (`HistoryDrawer`)**: a non-modal right-hand `Drawer` titled `History of <name>`, up to 1080px wide; "Compare" with two `Select`s (Older, Newer; option text `Version <n> (current) · <when>`) over `DiffColumns`, a rename note `Renamed from "<a>" to "<b>".` when the names differ; "Versions" list with "Current" on the latest and a small "Restore" on each older one; a `StatusSlot` reporting `Restored version <n> as a new version.` or the error. Escape or the close button returns focus to the opener (`packages/web/src/library/history-drawer.tsx:46-185`, `packages/web/src/components/kit/drawer.tsx:5-57`).

Ctrl+K on every Library tab: "New prompt" (starts on the tab's kind), "New intro or outro", "New document theme", "Open prompts", "Open intros and outros", "Open templates", "Open document themes" (`packages/web/src/routes/library.tsx:37-109`); and "Search prompts" on this tab (`packages/web/src/routes/prompts.tsx:44`).

## States
| State | Trigger | Rendered |
|---|---|---|
| Loading | prompts query pending | `ListSkeleton`: three `sl-row` placeholders with two `bg-sunken` bars each, `aria-busy="true"`, label "Prompts, loading" (`packages/web/src/routes/prompts.tsx:112-115`, `packages/web/src/library/list-states.tsx:10-25`) |
| Load error | prompts query fails | `LoadError` danger `Callout` "The prompts couldn't be loaded." with the server message and small "Try again" that refetches (`packages/web/src/routes/prompts.tsx:104-110`, `packages/web/src/library/list-states.tsx:27-50`) |
| Empty kind | no prompt of the kind | `EmptyState` `No <kind> prompts yet` with "A prompt is text with {{keywords}}; each keyword becomes a field on Play."; no own action, New prompt stays in the toolbar (`packages/web/src/routes/prompts.tsx:116-119`) |
| No search match | search filters out every row | `No <kind> prompts match "<query>".` in the list column; the search matches name or body, case-insensitive (`packages/web/src/routes/prompts.tsx:65-73`, `packages/web/src/routes/prompts.tsx:124-125`) |
| Selected row | row picked, or first row by default | `ListRow selected` sets `aria-current` and `data-selected` (`packages/web/src/routes/prompts.tsx:140`, `packages/web/src/components/kit/list-row.tsx:55-58`) |
| Rename invalid | empty name | inline `role="alert"`: "Write a name first, or press Cancel to keep the old one." (`packages/web/src/library/inline-name.tsx:56-58`, `packages/web/src/library/inline-name.tsx:141-145`) |
| Rename refused | server returns field errors | `The name wasn't saved. <field messages>` (`packages/web/src/library/inline-name.tsx:12-15`) |
| Rename unreachable | request throws | `The name wasn't saved: <reason> Check that Slopify is running, then press Save name again.` (`packages/web/src/library/inline-name.tsx:42-48`) |
| Detail sub-errors | used-by or history read fails | small `text-danger` lines `What uses it couldn't be read: <msg>` / `The history couldn't be read: <msg>` (`packages/web/src/library/item-detail.tsx:81-85`, `packages/web/src/library/item-detail.tsx:163-167`) |
| Drawer loading | history pending | "Loading the versions…"; with fewer than two, "No versions to compare." (`packages/web/src/library/history-drawer.tsx:130-133`) |
| Restoring | restore in flight | every Restore disabled with tooltip "Restoring a version" (`packages/web/src/library/history-drawer.tsx:161-172`) |
| Delete confirm | Delete pressed | `ConfirmDialog` `Delete "<name>"?`, "Moves it to the trash for 30 days (Settings → Trash). Projects that used it keep their text.", "Cancel" (focused) and destructive "Delete prompt" (`packages/web/src/routes/prompts.tsx:224-236`, `packages/web/src/components/kit/dialog.tsx:60-108`) |
| Delete failed | `removePrompt` rejects | danger `Callout` "The prompt wasn't deleted." with the message (`packages/web/src/routes/prompts.tsx:208-212`) |

The prompts query does not poll; it refreshes on invalidation after delete, rename and restore (`packages/web/src/queries.ts:109-111`, `packages/web/src/routes/prompts.tsx:49-62`, `packages/web/src/library/history-drawer.tsx:69-77`).

## Motion
- Confirm dialog: `dialog-in` 200ms, off under reduced motion (`packages/web/src/styles/index.css:89`, `packages/web/src/components/ui/dialog.tsx:39`).
- Rename toasts: `sl-enter` 200ms, off under reduced motion (`packages/web/src/components/kit/toast.tsx:91`, `packages/web/src/styles/shell.css:165-172`).
- The drawer has no entry animation in `packages/web/src/components/kit/drawer.tsx`.

## Copy
- Library header, tab names and toolbar labels as listed in Composition (`packages/web/src/routes/library.tsx:14-29`, `packages/web/src/routes/prompts.tsx:82-100`).
- Accessible names carry the prompt name: `Edit <name>`, `Duplicate <name>`, `Use <name> in Play`, `History of <name>`, `Delete <name>`, `Rename <name>`, `Actions for <name>`, `Compare versions of <name>` (`packages/web/src/routes/prompts.tsx:148`, `packages/web/src/routes/prompts.tsx:161`, `packages/web/src/library/row-actions.tsx:36-58`, `packages/web/src/library/inline-name.tsx:99`, `packages/web/src/library/item-detail.tsx:159`).
- Kind help: "What the prompt is for, which decides where Play offers it." followed by one clause per kind (`packages/web/src/help/entries/library.ts:8-12`).
- Errors say what failed, the reason, and the next press ("Try again", "press Save name again") (`packages/web/src/library/list-states.tsx:40-44`, `packages/web/src/library/inline-name.tsx:46`).

## Not in play
- Row overflow menus: absent; actions are always visible (`packages/web/src/library/row-actions.tsx:6-9`).
- The kind switch is a `Select`, not a toggle group, on this screen (`packages/web/src/routes/prompts.tsx:90-99`).
- Search and selection persistence: component state only, lost on leaving; only `kind` lives in the URL (`packages/web/src/routes/prompts.tsx:42-45`).
- Sorting controls and pagination: absent; order is the list endpoint's, by name (`packages/web/src/routes/prompts.tsx:24`).
- Bulk selection and bulk delete: absent.
- Offline and permission-denied states: not rendered.
