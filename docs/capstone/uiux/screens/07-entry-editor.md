---
generated_at_commit: e9226a34aa8a
generated_date: 2026-10-02
capstone_version: 7.0.1
content_hash: fc5be7bc4331
paths_covered:
  - ":(top)packages/web/src/routes/entry-editor.tsx"
  - ":(top)packages/web/src/library/editor-frame.tsx"
  - ":(top)packages/web/src/components/editor-actions.tsx"
  - ":(top)packages/web/src/components/editor-states.tsx"
  - ":(top)packages/web/src/components/slot-body.tsx"
  - ":(top)packages/web/src/components/detected-slots.tsx"
  - ":(top)packages/web/src/components/labelled-switch.tsx"
  - ":(top)packages/web/src/components/saved-tick.tsx"
  - ":(top)packages/web/src/lib/draft-lint.ts"
  - ":(top)packages/web/src/lib/entry-options.ts"
  - ":(top)packages/web/src/router.tsx"
---

# Entry editor

## Mode & job

Operate surface for creating, duplicating, editing and deleting one intro/outro entry. Routes: `/entries/new?category=&from=` (new, or a copy of `from`) and `/entries/$entryId` (edit), both top-level routes outside the Library tabs (`packages/web/src/router.tsx:289`, `:299`). Saving, deleting and Cancel all return to `/entries?category=<draft category>` (`packages/web/src/router.tsx:588`). The shell's Library nav item stays lit (`packages/web/src/components/shell.tsx:111`). Every Save rule is the shared `draftProblems` lint, which runs the server's own `lintEntry` (`packages/web/src/lib/draft-lint.ts:3`, `:39`).

## Composition

- Header: kit `PageHeader` with crumb "Library › Intros & Outros" (`EditorCrumb`, chevron icon; the link keeps the draft's category), title "New entry" or "Edit entry", meta "Intro" / "Outro" (`packages/web/src/routes/entry-editor.tsx:135`, `packages/web/src/library/editor-frame.tsx:12`).
- Body grid: one column; from `lg` a fluid form column plus a 360 px aside (`packages/web/src/routes/entry-editor.tsx:147`). The form sits on the page with no box (`editorSurface = "pt-1"`); the aside is sticky at `lg:top-16` (`packages/web/src/library/editor-frame.tsx:8`).
- Form row: kit `Field` "Name" (InfoTip `library.entry.name`) growing from 200 px, then `LabelledSwitch` "Category" (Intro / Outro) and `LabelledSwitch` "Mode" (Text / LLM), each with an InfoTip (`packages/web/src/routes/entry-editor.tsx:151`, `:168`, `:177`).
- Mode hint: one right-aligned small line under the row, "Text is narrated as written." or "LLM is an instruction whose answer is narrated.", linked to the Mode switch by `aria-describedby` (`packages/web/src/routes/entry-editor.tsx:191`, `packages/web/src/lib/entry-options.ts:35`).
- Body: label "Body" with InfoTip `library.entry.body`, then `SlotBody`, a textarea over a mirror that marks malformed `{{` in place (`packages/web/src/routes/entry-editor.tsx:195`, `packages/web/src/components/slot-body.tsx:6`).
- Save bar: `EditorActions`, sticky at the viewport bottom (raised above the phone bottom nav), `border-t`, ground background: destructive "Delete" at left (kept in place but hidden and unfocusable before the row exists), one `StatusSlot`, secondary `ButtonLink` "Cancel", primary "Save" (`packages/web/src/components/editor-actions.tsx:53`, `packages/web/src/routes/entry-editor.tsx:213`).
- Aside: `DetectedSlots`: small `SectionHead` "Detected slots" (InfoTip `library.slots`), `SlotChip`s for each `{{name}}`, and the lint list below a hairline (`packages/web/src/components/detected-slots.tsx:8`).
- Delete dialog: kit `ConfirmDialog` (`packages/web/src/routes/entry-editor.tsx:250`).

Keyboard: Ctrl+S (Cmd+S) runs Save through the command palette's `editor.save` command, advertised by `aria-keyshortcuts` on Save (`packages/web/src/components/editor-actions.tsx:40`, `packages/web/src/lib/shortcuts.ts:21`).

## States

| State | Trigger | Rendering | Source |
|---|---|---|---|
| Loading | editing or duplicating while the entries list is in flight | `EditorSkeleton`: a bordered sheet with a 64-wide bar and a 520 px block, plus an aside bar | `packages/web/src/routes/entry-editor.tsx:122`, `packages/web/src/components/editor-states.tsx:10` |
| List unreadable | entries query error | `EditorProblem`: danger `Callout` "This can't be opened." with the error, then the underlined link "Back to Intros & Outros" | `packages/web/src/routes/entry-editor.tsx:119`, `packages/web/src/library/editor-frame.tsx:24` |
| Entry gone | id not in the list | same frame with "That entry is gone. It may have been deleted in another tab." | `packages/web/src/routes/entry-editor.tsx:125` |
| New | no id, no `from` | blank name and body, mode Text, category from the URL | `packages/web/src/routes/entry-editor.tsx:68` |
| Duplicate | `from` set | source's category, mode and body; name `<name> copy`; Delete hidden | `packages/web/src/routes/entry-editor.tsx:74`, `:214` |
| Save held | lint finds a problem | Save stays focusable with `aria-disabled`; the first problem sentence sits in the `StatusSlot` and Save points `aria-describedby` at it; Ctrl+S shows a toast "Not saved yet: <reason>" | `packages/web/src/components/editor-actions.tsx:36`, `:48`, `:74` |
| Untouched field | empty body or name | no red field mark; the requirement is only the sentence beside Save | `packages/web/src/routes/entry-editor.tsx:114` |
| Name problem | name lint or server refusal on `name` | `Field` error text; a refusal stands until that field (or Category) is edited | `packages/web/src/routes/entry-editor.tsx:104`, `:154` |
| Slot errors | body lint | `SlotBody` `aria-invalid`, marks in the text, and in the aside a danger kicker "1 slot error" / "<n> slot errors" with each message | `packages/web/src/routes/entry-editor.tsx:205`, `packages/web/src/components/detected-slots.tsx:40` |
| No slots | body without slots | "No slots. This text is narrated as written." / "No slots. This instruction runs as written."; empty body shows "Slots appear here as you type {{name}}." | `packages/web/src/lib/entry-options.ts:47`, `packages/web/src/components/detected-slots.tsx:34` |
| Saving | save mutation pending | Save held | `packages/web/src/routes/entry-editor.tsx:223` |
| Saved | save ok | `SavedTick` "Saved" in the status slot for 2 s, then the editor leaves to the list | `packages/web/src/components/saved-tick.tsx:6`, `:12`, `packages/web/src/routes/entry-editor.tsx:100` |
| Save or delete failed | mutation error | error text in the status slot, tone error | `packages/web/src/routes/entry-editor.tsx:230`, `packages/web/src/components/editor-actions.tsx:68` |
| Delete confirm | Delete pressed | `Delete "<name>"?`, "Moves it to the trash for 30 days (Settings → Trash). Projects that used it keep their text.", confirm "Delete intro" / "Delete outro"; success returns to the list | `packages/web/src/routes/entry-editor.tsx:250`, `:91` |

## Motion

The Saved tick fades in over 150 ms (`animate-tick-in`), none under reduced motion (`packages/web/src/components/saved-tick.tsx:32`, `packages/web/src/styles/index.css:90`). Nothing else on the route animates (`packages/web/src/routes/entry-editor.tsx`).

## Copy

Title "New entry" / "Edit entry"; field labels "Name", "Category", "Mode", "Body"; aside "Detected slots"; bar "Delete", "Cancel", "Save" (`packages/web/src/routes/entry-editor.tsx:143`, `packages/web/src/components/editor-actions.tsx:66`). Lint sentences are the server's own messages (`packages/web/src/lib/draft-lint.ts:6`). Problem copy says what failed and gives the way back ("This can't be opened.", "Back to Intros & Outros") (`packages/web/src/library/editor-frame.tsx:33`, `packages/web/src/routes/entry-editor.tsx:280`).

## Not in play

- No unsaved-changes guard: Cancel and the crumb leave without asking (`packages/web/src/routes/entry-editor.tsx:226`).
- No version history or preview of the narrated result in the editor; history lives on the Intros & Outros tab (`packages/web/src/routes/entries.tsx:212`).
- No autosave; the draft exists only in component state until Save (`packages/web/src/routes/entry-editor.tsx:60`).
