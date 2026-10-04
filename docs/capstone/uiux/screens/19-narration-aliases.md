---
generated_at_commit: 54f5cb4c1dab
generated_date: 2026-09-30
capstone_version: 7.0.1
content_hash: c8e64a2b8dd4
paths_covered:
  - ":(top)packages/web/src/routes/narration-aliases.tsx"
  - ":(top)packages/web/src/play/narration-aliases.tsx"
---

# Narration aliases

## Mode & job
An edit surface at `/narration-aliases`, the Library's "Aliases" tab: one ordered list of words the narrator says differently from how they are written ("Dr." as "Doctor"), edited in place and saved as a whole (`packages/web/src/routes/narration-aliases.tsx:25-28`, `packages/web/src/routes/library.tsx:14-20`). Only what the voice and Narration Preparation receive changes; the article, transcript and captions keep the written form (`packages/app/src/kernel/ports/narration-aliases.ts:1-6`).

- The route is a child of the pathless Library layout, so it renders under the "Library" `PageHeader` and the `TabLinks` row (`packages/web/src/router.tsx:98-102`, `packages/web/src/router.tsx:304-308`, `packages/web/src/routes/library.tsx:22-34`).
- The rail's Library item lights for `/narration-aliases` (`packages/web/src/components/shell.tsx:104-117`).
- No Ctrl+K command opens this tab or adds an alias; the Library commands cover prompts, entries, templates and document themes only (`packages/web/src/routes/library.tsx:39-108`).
- The list is used through the "Use narration aliases" checkbox (`NarrationAliasesToggle`, InfoTip `play.narration-aliases`) on Play's audio controls and in Edit project (`packages/web/src/play/narration-aliases.tsx:4-40`, `packages/web/src/play/media-rails.tsx:206-211`, `packages/web/src/project/revision-providers.tsx:293`). A project copies the list when it starts; in Edit project turning the box on copies the list, and a note under it reads `<n> alias(es) copied from Library → Narration aliases.` or "No aliases are copied yet. Add some in Library → Narration aliases." beside a quiet "Update from Library" button ("Copying…" while busy) (`packages/web/src/project/revision-providers.tsx:94-145`).

## Composition
| Region | What renders | Kit / tokens |
|---|---|---|
| Toolbar | Line "Words the narrator says differently, like Dr. as Doctor." with InfoTip `library.aliases`; secondary "Add alias" button (plus icon), disabled until the list has loaded (`packages/web/src/routes/narration-aliases.tsx:93-105`) | `LibraryToolbar` (`packages/web/src/routes/library.tsx:112-130`), `Button`, `InfoTip` |
| Board | `Board split="aside"`: a fluid "Aliases" column beside a 360px aside; one column below 1024px (`packages/web/src/routes/narration-aliases.tsx:113-147`, `packages/web/src/styles/shell.css:869-871`, `packages/web/src/styles/shell.css:882-891`) | `Board`, `BoardColumn` (`packages/web/src/components/kit/board.tsx:15-58`) |
| Column header line | Four labels, each with its InfoTip, once above the rows: Written (`library.aliases.written`), Say it as (`library.aliases.spoken`), Whole word (`library.aliases.whole-word`), Match case (`library.aliases.match-case`) (`packages/web/src/routes/narration-aliases.tsx:187-206`) | `text-small text-ink-2`, `helpScope` |
| Alias rows | `List label="Narration aliases"` of `ListRow`s (`packages/web/src/routes/narration-aliases.tsx:207-286`) | `List`, `ListRow` (`packages/web/src/components/kit/list-row.tsx:13-77`) |
| Aside "How aliases are used" | `SectionHead` "How they are used" and three `text-small text-ink-2` paragraphs: the narrator reads the alias while the article, captions and PDF keep the written word; a project copies the list when it starts and keeps its copy until refreshed in Edit project; what Whole word and Match case do (`packages/web/src/routes/narration-aliases.tsx:129-146`) | `BoardColumn as="aside"`, `SectionHead` |
| Action bar | Sticky bottom bar: a `StatusSlot` and primary "Save aliases" ("Saving…" while pending) (`packages/web/src/routes/narration-aliases.tsx:149-167`) | `ActionBar`, `StatusSlot` (`packages/web/src/components/kit/action-bar.tsx:16-73`) |

Each row (`packages/web/src/routes/narration-aliases.tsx:208-284`):
- Title `Alias <n>` (1-based position).
- Meta: "Not filled in yet" while either side is blank, else `Says <written> as <spoken>` plus ` · whole word` and ` · match case` when on.
- Action: small icon-only Remove (trash) named `Remove alias <n>`.
- Body: a grid, one column by default and `1fr 1fr auto auto` from `md`: "Written" `Input` (placeholder "Dr.", `maxLength` 200), "Say it as" `Input` (placeholder "Doctor", `maxLength` 500), "Whole word" checkbox, "Match case" checkbox; checkbox labels grow to 44px tall below 1100px. The row's error line spans the grid in `text-danger`, linked to the Written input by `aria-describedby`; both inputs carry `aria-invalid` (`packages/web/src/routes/narration-aliases.tsx:235-281`).

New rows start blank with Whole word on and Match case off (`packages/web/src/routes/narration-aliases.tsx:23`, `packages/web/src/routes/narration-aliases.tsx:80-84`). The saved list fills the editor once; after that the local rows are the source until Save (`packages/web/src/routes/narration-aliases.tsx:42-46`). Save sends every row, blank ones included, and the server replaces the whole table in one transaction (`packages/web/src/routes/narration-aliases.tsx:154-162`, `packages/app/src/slices/narration/aliases-library.ts:40-65`).

Server checks, reported as row sentences (`packages/app/src/slices/narration/aliases-schema.ts:10-62`):

| Rule | Message |
|---|---|
| More than 1000 rows | `Keep at most 1000 aliases; remove some, then Save.` |
| Written blank | `Alias <n>: write the word or phrase as it appears in the article.` |
| Spoken blank | `Alias <n>: write how the narrator should say it.` |
| Too long (200 / 500) | `Alias <n>: keep the written form under 200 characters and the spoken form under 500.` |
| Duplicate written form (whitespace-collapsed; case-folded unless Match case) | `Alias <n>: alias <m> already covers the same written form; keep one of them.` |

## States
| State | Trigger | Rendered |
|---|---|---|
| Loading | `rows` undefined | The Aliases column renders nothing; "Add alias" and "Save aliases" are disabled; no skeleton (`packages/web/src/routes/narration-aliases.tsx:95`, `packages/web/src/routes/narration-aliases.tsx:115`, `packages/web/src/routes/narration-aliases.tsx:153`) |
| Load error | `listing.error` set | Danger `Callout` "Couldn't load the aliases" with `<message> Reload the page to try again.`; no retry button; the rows never fill, so Add and Save stay disabled (`packages/web/src/routes/narration-aliases.tsx:107-111`) |
| Empty | loaded list has no rows | `EmptyState` "No aliases yet", "Use Add alias to say a word differently from how it is written." (`packages/web/src/routes/narration-aliases.tsx:115-118`, `packages/web/src/components/kit/empty-state.tsx:6-24`) |
| Editing | any row change, add or remove | Status slot cleared; remove also clears every row error (`packages/web/src/routes/narration-aliases.tsx:76-89`) |
| Saving | mutation pending | Save disabled, label "Saving…" (`packages/web/src/routes/narration-aliases.tsx:153-165`) |
| Refused | server returns field problems | Row errors placed by the `aliases.<index>` in each field; status slot `Not saved: <all messages>` in error tone (`role="alert"`) (`packages/web/src/routes/narration-aliases.tsx:50-62`, `packages/web/src/components/kit/action-bar.tsx:32`) |
| Saved | server accepts | Rows re-keyed from the saved list; status slot in success tone: "Saved. New projects use these aliases; a project you already started keeps its copy until you refresh it in Edit project."; the aliases query is invalidated (`packages/web/src/routes/narration-aliases.tsx:64-70`) |
| Save failed | request rejects | Status slot `Couldn't save the aliases: <message>` in error tone (`packages/web/src/routes/narration-aliases.tsx:72-73`) |

## Motion
None of its own: no enter, reorder or save animation is defined in `packages/web/src/routes/narration-aliases.tsx`. The status slot keeps a fixed height, so a message arriving or leaving never moves the bar's controls (`packages/web/src/components/kit/action-bar.tsx:13-15`, `packages/web/src/components/kit/action-bar.tsx:35`).

## Copy
- Tab and headings: "Aliases", "How they are used", "No aliases yet" (`packages/web/src/routes/library.tsx:19`, `packages/web/src/routes/narration-aliases.tsx:116-131`).
- Buttons: "Add alias", "Save aliases" / "Saving…", `Remove alias <n>` (`packages/web/src/routes/narration-aliases.tsx:97-227`).
- Field labels and placeholders: "Written" ("Dr."), "Say it as" ("Doctor"), "Whole word", "Match case" (`packages/web/src/routes/narration-aliases.tsx:236-275`).
- Help bodies state the limits (up to 1000 aliases, 200 and 500 characters), that spaces in a written form match any spacing, that the leftmost then longer match wins, and that an alias wins over a Pronunciation Glossary entry (`packages/web/src/help/entries/library.ts:120-144`).

## Not in play
- Reordering rows: absent; position is the order rows were added (`packages/web/src/routes/narration-aliases.tsx:80-84`).
- Search or filtering: absent (`packages/web/src/routes/narration-aliases.tsx:113-128`).
- A preview or "listen" of an alias: absent.
- Client-side validation before Save: absent beyond input `maxLength`; every rule is checked by the server (`packages/web/src/routes/narration-aliases.tsx:242`, `packages/web/src/routes/narration-aliases.tsx:254`).
- Unsaved-changes guard on leaving and a dirty indicator: absent; Save is enabled whenever the list is loaded and no save is pending (`packages/web/src/routes/narration-aliases.tsx:153`).
- Confirm on row remove and undo: absent; a removed row is gone from the editor at once and from storage on the next Save (`packages/web/src/routes/narration-aliases.tsx:85-89`).
- Import or export of the list: absent.
