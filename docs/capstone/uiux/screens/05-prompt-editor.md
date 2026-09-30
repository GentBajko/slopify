---
generated_at_commit: 54f5cb4c1dab
generated_date: 2026-09-30
capstone_version: 7.0.1
content_hash: 4ffc08d53d2f
paths_covered:
  - ":(top)packages/web/src/routes/prompt-editor.tsx"
  - ":(top)packages/web/src/library/editor-frame.tsx"
  - ":(top)packages/web/src/components/editor-actions.tsx"
  - ":(top)packages/web/src/components/editor-states.tsx"
  - ":(top)packages/web/src/components/slot-body.tsx"
  - ":(top)packages/web/src/components/detected-slots.tsx"
  - ":(top)packages/web/src/components/labelled-switch.tsx"
  - ":(top)packages/web/src/components/saved-tick.tsx"
  - ":(top)packages/web/src/lib/draft-lint.ts"
  - ":(top)packages/web/src/lib/form-drafts.tsx"
  - ":(top)packages/web/src/lib/narration-starter.ts"
---

# Prompt editor

## Mode & job
Operate surface for creating, duplicating, editing and deleting one prompt: a name, a kind and a body whose `{{slots}}` are shown as they are typed; Save obeys the shared lint so the editor refuses exactly what the server would, with the same sentence (`packages/web/src/routes/prompt-editor.tsx:38-40`). Routes: `/prompts/new?kind=<kind>` (with `&from=<id>` when Duplicate opened it) and `/prompts/$promptId`; both are outside the Library layout, so no Library header or tabs render, and each remounts per kind/source or per id (`packages/web/src/router.tsx:263-277`, `packages/web/src/router.tsx:487-518`). Saving, deleting and leaving land on `/prompts?kind=<the prompt's kind>` (`packages/web/src/router.tsx:518-522`). The rail keeps Library lit for `/prompts` paths (`packages/web/src/components/shell.tsx:104-112`).

## Composition
| Region | What renders | Kit / tokens |
|---|---|---|
| Header | `PageHeader` with crumb "Library › Prompts" (Prompts links to `/prompts?kind=<draft kind>`), title "New prompt" or "Edit prompt", meta `<Kind> prompt` (`packages/web/src/routes/prompt-editor.tsx:161-171`, `packages/web/src/library/editor-frame.tsx:11-20`) | `PageHeader` (`packages/web/src/components/kit/layout.tsx:9`), `ChevronRightIcon` |
| Grid | One column; from `lg` the form beside a 360px aside (`packages/web/src/routes/prompt-editor.tsx:173-176`) | `editorSurface` (`pt-1`, no box) (`packages/web/src/library/editor-frame.tsx:5-8`) |
| Name + Kind row | `Field` "Name" (InfoTip `library.prompt.name`, inline error when the name has problems) beside `LabelledSwitch` "Kind" (a toggle group of all eight kinds, InfoTip `library.prompt.kind`), wrapping (`packages/web/src/routes/prompt-editor.tsx:178-206`, `packages/web/src/components/labelled-switch.tsx:13-56`) | `Field`, `Input` (`packages/web/src/components/kit/field.tsx:28`, `packages/web/src/components/kit/field.tsx:109`), Radix `ToggleGroup` |
| Body label row | "Body" label with a per-kind InfoTip (`library.prompt.body.<kind>`); for Narration Preparation a quiet small "Use Documentary Starter", for YouTube Description and Shorts "Use Built-in Starter", each with InfoTip `library.prompt.starter`, on the label's own row so switching Kind never moves the body (`packages/web/src/routes/prompt-editor.tsx:208-239`, `packages/web/src/routes/prompt-editor.tsx:352-374`) | `sl-field__label`, `Button` quiet small |
| Body | `SlotBody`: a 24-row `Textarea` (min 520px, resizable, max 75ch wide) with transparent glyphs over a `bg-sunken` mirror that paints each malformed `{{` in `text-danger` with a 2px underline; spellcheck off; `aria-describedby` points at the lint list (`packages/web/src/routes/prompt-editor.tsx:240-248`, `packages/web/src/components/slot-body.tsx:6-91`) | `Textarea` (`packages/web/src/components/kit/field.tsx:114`) |
| Photorealistic (Image only) | Saved Image prompt: `Switch` "Draws photorealistic pictures" (InfoTip `library.prompt.photorealistic`) that applies at once, apart from Save; unsaved: the line "Save this Image prompt first, then choose whether it draws photorealistic pictures." (`packages/web/src/routes/prompt-editor.tsx:108-115`, `packages/web/src/routes/prompt-editor.tsx:251-278`) | `Switch` (`packages/web/src/components/kit/switch.tsx:8`) |
| Action bar | `EditorActions`, sticky at the viewport bottom (above the phone tab bar under `md`), `border-t border-line bg-ground`: destructive "Delete" at left (kept in place but hidden and unfocusable for a new prompt), one `StatusSlot`, secondary ButtonLink "Cancel" to `/prompts?kind=<kind>` (discards the in-memory draft), primary "Save" (`packages/web/src/routes/prompt-editor.tsx:280-312`, `packages/web/src/components/editor-actions.tsx:9-90`) | `Button`, `StatusSlot` (`packages/web/src/components/kit/action-bar.tsx:16`) |
| Aside | `DetectedSlots`: `SectionHead` "Detected slots" (InfoTip `library.slots`), a `SlotChip` per slot, and a lint block headed `1 slot error` / `<n> slot errors` listing each message in `text-danger`; sticky from `lg` (`packages/web/src/routes/prompt-editor.tsx:315-317`, `packages/web/src/components/detected-slots.tsx:8-54`, `packages/web/src/library/editor-frame.tsx:9`) | `SectionHead`, `SlotChip` |

Draft handling: edits live in `FormDraftsProvider` (mounted in the shell) keyed by `["new", kind, from]` or `["prompt", id]`, so an unsaved draft survives navigating away and back within the session and is gone on reload (`packages/web/src/routes/prompt-editor.tsx:61-64`, `packages/web/src/lib/form-drafts.tsx:18-49`, `packages/web/src/components/shell.tsx:168`). A duplicate starts as `<name> copy` with the source's kind and body (`packages/web/src/routes/prompt-editor.tsx:71-80`). Ctrl+S / Cmd+S saves from anywhere in the editor via the "Save" command (group This editor) (`packages/web/src/components/editor-actions.tsx:38-50`).

Starters: the documentary delivery cues (`packages/web/src/lib/narration-starter.ts:1`), and the built-in wording a project uses when it picks no Description or Shorts prompt (`packages/app/src/slices/youtube/model.ts:27`, `packages/app/src/slices/shorts/model.ts:114`). A starter fills an empty body directly; over nonempty text it asks first (`packages/web/src/routes/prompt-editor.tsx:227-232`).

## States
| State | Trigger | Rendered |
|---|---|---|
| Loading | editing or duplicating and the prompts list is in flight | `EditorSkeleton`: the two-column outline, a `bg-surface` sheet with a 32px bar and a 520px block, and a short aside bar (`packages/web/src/routes/prompt-editor.tsx:150-152`, `packages/web/src/components/editor-states.tsx:10-22`) |
| Load error | prompts query fails | `EditorProblem`: danger `Callout` "This can't be opened." with the error, and "Back to Prompts" link (`packages/web/src/routes/prompt-editor.tsx:147-149`, `packages/web/src/routes/prompt-editor.tsx:376-388`, `packages/web/src/library/editor-frame.tsx:22-39`) |
| Gone | the id (or `from`) is not in the list | same frame with "That prompt is gone. It may have been deleted in another tab." (`packages/web/src/routes/prompt-editor.tsx:153-157`) |
| Held Save | any lint or server refusal | Save stays focusable with `aria-disabled` and `aria-describedby` to the status slot, which shows the first problem's sentence; Ctrl+S raises an error toast `Not saved yet: <reason>` (`packages/web/src/routes/prompt-editor.tsx:128-129`, `packages/web/src/components/editor-actions.tsx:36-87`, `packages/web/src/lib/draft-lint.ts:39-51`) |
| Lint messages | shared lint | "Enter a name.", "Keep the name to <max> characters or fewer.", "Enter the text.", "The text is too long. Keep it to <max> characters or fewer.", and per slot at `line L, column C`: never closed / has no name / contains a brace (`packages/app/src/slices/library/lint.ts:19-68`) |
| Untouched fields | empty name or body | no red mark on the field; the requirement shows only as the held-Save sentence (`packages/web/src/routes/prompt-editor.tsx:131-136`) |
| Name taken | server refusal (409 field error) | stays on the Name field and holds Save until Name is edited; switching Kind clears it (`packages/web/src/routes/prompt-editor.tsx:84-88`, `packages/web/src/routes/prompt-editor.tsx:121-126`, `packages/web/src/routes/prompt-editor.tsx:195-205`) |
| Saving | save in flight | Save held (`packages/web/src/components/editor-actions.tsx:36`) |
| Saved | save succeeds | status slot shows the `SavedTick` ("Saved", check icon, `text-accent-ink`); after 2 s the editor returns to the list (`packages/web/src/components/saved-tick.tsx:4-37`, `packages/web/src/routes/prompt-editor.tsx:117-119`) |
| Save / delete failed | mutation rejects | the error messages joined in the status slot, `role="alert"` (`packages/web/src/routes/prompt-editor.tsx:305-307`, `packages/web/src/components/editor-actions.tsx:52-70`, `packages/web/src/components/kit/action-bar.tsx:32`) |
| Photorealistic failed | switch mutation rejects | `Couldn't change Draws photorealistic pictures: <msg> Press the switch again.` (`packages/web/src/routes/prompt-editor.tsx:272-276`) |
| Replace body confirm | starter over nonempty body | `ConfirmDialog` tone primary "Replace this prompt body?", "The starter replaces the text in this editor. Nothing is saved until you choose Save.", "Cancel" / "Use starter" (`packages/web/src/routes/prompt-editor.tsx:320-332`) |
| Delete confirm | Delete pressed | `ConfirmDialog` `Delete "<name>"?`, "Moves it to the trash for 30 days (Settings → Trash). Projects that used it keep their text.", "Cancel" (focused) / destructive "Delete prompt", pending-disabled; success returns to the list (`packages/web/src/routes/prompt-editor.tsx:98-106`, `packages/web/src/routes/prompt-editor.tsx:333-347`) |

The editor carries `data-tour` hooks (`prompt-editor`, `prompt-name`, `prompt-body`, `prompt-save`, `prompt-slots`) and reports tutorial progress and a `prompt-saved` event (`packages/web/src/routes/prompt-editor.tsx:93`, `packages/web/src/routes/prompt-editor.tsx:137-145`, `packages/web/src/routes/prompt-editor.tsx:174-315`).

## Motion
- Saved tick fades in with `tick-in` over 150 ms, off under reduced motion (`packages/web/src/components/saved-tick.tsx:4-5`, `packages/web/src/components/saved-tick.tsx:32`, `packages/web/src/styles/index.css:190-194`).
- Confirm dialogs enter with `dialog-in` 200ms, off under reduced motion (`packages/web/src/styles/index.css:89`, `packages/web/src/components/ui/dialog.tsx:39`).
- No other authored motion in `packages/web/src/routes/prompt-editor.tsx`.

## Copy
- Title "New prompt" / "Edit prompt"; meta `<Kind> prompt`; crumb "Library › Prompts" (`packages/web/src/routes/prompt-editor.tsx:161-171`).
- Field labels "Name", "Kind", "Body"; switch "Draws photorealistic pictures" (`packages/web/src/routes/prompt-editor.tsx:181`, `packages/web/src/routes/prompt-editor.tsx:198`, `packages/web/src/routes/prompt-editor.tsx:214`, `packages/web/src/routes/prompt-editor.tsx:262`).
- Starter buttons "Use Documentary Starter" / "Use Built-in Starter" (`packages/web/src/routes/prompt-editor.tsx:369-372`).
- Slot aside: "Slots appear here as you type {{name}}." while the body is empty; "No slots. This prompt runs as written." otherwise (`packages/web/src/components/detected-slots.tsx:16`, `packages/web/src/components/detected-slots.tsx:34-38`).
- Action bar: "Delete", "Cancel", "Save" (`packages/web/src/components/editor-actions.tsx:66-86`, `packages/web/src/routes/prompt-editor.tsx:302`).
- Lint sentences say what is wrong, where (line and column), and the fix (`packages/app/src/slices/library/lint.ts:50-60`).

## Not in play
- Leave-with-unsaved-changes prompt: absent; the draft is kept in memory instead (`packages/web/src/lib/form-drafts.tsx:18-49`).
- Autosave: absent; Save is explicit, apart from the photorealistic switch (`packages/web/src/routes/prompt-editor.tsx:108-115`).
- Version history and Used by: not on this screen; they are on the Prompts tab (`packages/web/src/library/item-detail.tsx:57-58`).
- Draft persistence across reloads: absent; drafts are React state in the shell (`packages/web/src/lib/form-drafts.tsx:18-19`).
- `EditorNotice` and `backLink` from `packages/web/src/components/editor-states.tsx:26-44`: not used here; the prompt editor uses `EditorProblem`.
- Offline and permission-denied states: not rendered.
