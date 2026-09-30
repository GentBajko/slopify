---
generated_at_commit: 54f5cb4c1dab
generated_date: 2026-09-30
capstone_version: 7.0.1
content_hash: 7747fec89cca
paths_covered:
  - ":(top)packages/web/src/routes/document-themes.tsx"
  - ":(top)packages/web/src/routes/document-theme-editor.tsx"
  - ":(top)packages/web/src/components/document-theme-picker.tsx"
  - ":(top)packages/web/src/lib/document-theme-fields.ts"
---

# Document themes

## Mode & job
Two surfaces. `/document-themes` is the Library's "Documents" tab: a manage surface listing the looks a project's PDF can take, your saved themes above the built-ins, with the selected one's colours, fonts and page beside the list (`packages/web/src/routes/document-themes.tsx:23-26`, `packages/web/src/routes/library.tsx:14-20`). `/document-themes/new?from=<built-in name | saved id>` and `/document-themes/$themeId` are an edit surface: every PDF setting in collapsible groups beside a live preview of a sample article drawn by the server's own renderer (`packages/web/src/routes/document-theme-editor.tsx:41-54`, `packages/web/src/router.tsx:316-333`).

- The list route is a child of the pathless Library layout (`_library`), so it renders under the "Library" `PageHeader` and the `TabLinks` row "Prompts, Intros & Outros, Templates, Documents, Aliases" (`packages/web/src/router.tsx:98-102`, `packages/web/src/router.tsx:310-314`, `packages/web/src/routes/library.tsx:22-34`).
- The two editor routes hang off the root route, so they render without the Library header and tabs (`packages/web/src/router.tsx:321-333`). `?from=` is validated as a string or dropped (`packages/web/src/router.tsx:324-325`).
- Leaving the editor (after save, after delete) navigates to `/document-themes` (`packages/web/src/router.tsx:562-579`).
- The rail's Library item (book icon) lights for `/document-themes` (`packages/web/src/components/shell.tsx:104-117`).
- Ctrl+K on every Library tab carries "New document theme" (opens `/document-themes/new?from=plain`) and "Open document themes" (group Library) (`packages/web/src/routes/library.tsx:63-71`, `packages/web/src/routes/library.tsx:98-106`).
- Themes are consumed elsewhere through `DocumentThemePicker`: Play's Document stage rail ("Theme" field with an "Edit themes" link to `/document-themes`) and Edit project's "Document theme" field (`packages/web/src/play/stage-rails.tsx:442-458`, `packages/web/src/project/revision-form.tsx:346-355`). The channel Brand tab lists the same built-ins and saved themes as its document-theme choices (`packages/web/src/channels/brand-tab.tsx:49`, `packages/web/src/channels/brand-tab.tsx:106-107`).

## Composition

### List (`/document-themes`)
| Region | What renders | Kit / tokens |
|---|---|---|
| Toolbar | Line "How a project's PDF looks. Pick one on the Document row in Play or in Edit project." and primary ButtonLink "New theme" to `/document-themes/new?from=plain` (`packages/web/src/routes/document-themes.tsx:58-68`) | `LibraryToolbar` (`packages/web/src/routes/library.tsx:112-130`), `ButtonLink` (`packages/web/src/components/kit/link.tsx:38`) |
| List/detail frame | List column beside a detail column; `minmax(280px,380px) 1fr` by default, two equal columns from 1180px, one column at 767px and below (`packages/web/src/routes/document-themes.tsx:83-85`, `packages/web/src/library/list-states.tsx:7`, `packages/web/src/styles/shell.css:719-724`, `packages/web/src/styles/shell.css:978-984`) | `ListDetail` (`packages/web/src/components/kit/layout.tsx:98-113`) |
| Your themes | `SectionHead` h3 "Your themes" with InfoTip `library.themes.yours`, then `List label="Your themes"` (`packages/web/src/routes/document-themes.tsx:87-141`) | `SectionHead`, `List`, `ListRow` (`packages/web/src/components/kit/list-row.tsx:13-77`) |
| Built in | `SectionHead` h3 "Built in" with InfoTip `library.themes.built-in`, then `List label="Built-in themes"` (`packages/web/src/routes/document-themes.tsx:143-174`) | same |
| Detail | `ThemeDetail`: `SectionHead` with kicker ("Your theme" / "Built in"), the theme name, a meta line and one small action; a `dl` of four colour pairs (Headings, Text, Muted, Header and page numbers: a 16px round swatch plus the mono hex), three font pairs (Body, Headings, Drop cap: `<family>, <style>`) and Page (`A4`/`Letter`, `parchment` or `flat #hex` background) (`packages/web/src/routes/document-themes.tsx:177-211`, `packages/web/src/routes/document-themes.tsx:248-315`) | `SectionHead`, `border-line`, `font-mono text-small`, `text-ink-2` labels |

Rows (`packages/web/src/routes/document-themes.tsx:100-172`):
- Lead: three 12px round swatches (heading, text, muted colours), `aria-hidden` (`packages/web/src/routes/document-themes.tsx:317-334`).
- Title: the saved theme's name or the built-in's label; clicking the row selects it for the detail column (`onSelect`, `aria-current="true"` when selected) (`packages/web/src/components/kit/list-row.tsx:56-66`).
- Meta: `<A4|Letter> · <body family> body`, plus ` · updated <medium date>` for saved themes (`packages/web/src/routes/document-themes.tsx:106`, `packages/web/src/routes/document-themes.tsx:236-242`, `packages/web/src/library/item-detail.tsx:195-200`).
- Saved-theme actions, all visible in a `role="group"` named `Actions for <name>`: quiet small "Edit" link to `/document-themes/$themeId`, quiet small "Duplicate" link to `/document-themes/new?from=<id>`, icon-only Delete (trash) named `Delete <name>` (`packages/web/src/routes/document-themes.tsx:109-136`, `packages/web/src/library/row-actions.tsx:10-63`).
- Built-in action: quiet small "Copy" link (`aria-label="Copy <label>"`) to `/document-themes/new?from=<name>` (`packages/web/src/routes/document-themes.tsx:160-170`).
- Row grid: one column, action beside the title from Tailwind `2xl` (`packages/web/src/library/list-states.tsx:8`).

Detail selection: the picked row; with nothing picked (or the picked one gone) the first saved theme, else the first built-in (`packages/web/src/routes/document-themes.tsx:41-54`). Saved detail meta `Updated <date>` with small "Edit theme" link; built-in meta "Built-in themes can't be changed. Copy one to make it yours." with small "Copy theme" link (`packages/web/src/routes/document-themes.tsx:178-209`).

Built-ins come from the server with their values: only `plain` ("Plain") is offered; the retired `dicemaster` is never listed (`packages/app/src/edge/http/document-themes.ts:36-45`, `packages/app/src/slices/document/model.ts:6-24`).

### Editor (`/document-themes/new`, `/document-themes/$themeId`)
| Region | What renders | Kit / tokens |
|---|---|---|
| Page header | Crumb "Library › Documents" (link to `/document-themes`), title "New document theme" or "Edit document theme", meta "How a project's PDF looks" (`packages/web/src/routes/document-theme-editor.tsx:145-153`, `packages/web/src/library/editor-frame.tsx:12-20`) | `PageHeader`, `EditorCrumb` |
| Two-column grid | Form column beside the preview; `1fr minmax(320px,440px)` from Tailwind `lg`, one column below (`packages/web/src/routes/document-theme-editor.tsx:154`) | Tailwind grid, gap-6 |
| Name | `Field` "Name" with tip `library.theme.name`, `Input`; name problems shown as the field error (`packages/web/src/routes/document-theme-editor.tsx:156-169`) | `Field`, `Input` (`packages/web/src/components/kit/field.tsx:28`, `packages/web/src/components/kit/field.tsx:109`) |
| Setting groups | One native `<details>` per `themeGroups` entry, top hairline, `summary` in `text-title-3` with a 14px chevron; fields in one column, two from `sm` (`packages/web/src/routes/document-theme-editor.tsx:171-209`) | `border-line`, `ChevronRightIcon` |
| Save bar | Sticky bottom bar: destructive "Delete" (hidden but space kept on a new theme), a `StatusSlot`, secondary "Cancel" link to `/document-themes`, primary "Save" (`packages/web/src/routes/document-theme-editor.tsx:211-234`, `packages/web/src/components/editor-actions.tsx:16-90`) | `EditorActions`, `StatusSlot` (`packages/web/src/components/kit/action-bar.tsx:16-48`) |
| Preview aside | Sticky at `lg` (`top-16`); `SectionHead` small "Preview" with InfoTip `library.theme.preview` and, once a PDF exists, a secondary small `FileLink` "Open full size" (external-link icon, new tab); a `bg-sunken` scroll box (min 320px, max `100vh-220px`) with `PdfPages`; a `role="status"` line below (`packages/web/src/routes/document-theme-editor.tsx:417-447`, `packages/web/src/library/editor-frame.tsx:9`) | `SectionHead`, `FileLink` (`packages/web/src/components/kit/link.tsx:45`), `PdfPages` (`packages/web/src/components/pdf-pages.tsx:6-57`) |

The 13 groups, in order: Page, Colours, Fonts, Text sizes, Spacing, Drop caps, Title page, Branding, Contents page, Header and footer, Sources page, Closing page, PDF details (`packages/web/src/lib/document-theme-fields.ts:88-330`). Page and Colours start open; any group holding a problem is forced open (`packages/web/src/routes/document-theme-editor.tsx:174`). Every setting carries its own InfoTip keyed by path (`packages/web/src/routes/document-theme-editor.tsx:259-347`).

Setting controls by `field.kind` (`packages/web/src/routes/document-theme-editor.tsx:495-743`):

| Kind | Control |
|---|---|
| toggle | Checkbox with the label beside it, full row |
| number | Number `Input` (w-28, `min`/`max` from `rangeOf`, `step`) plus a unit word, e.g. mm |
| color | Native colour input (`<label> colour`) plus a mono hex `Input`; 3- and 6-digit hex accepted, anything else shows black in the swatch |
| text / optional-text | `Input`; optional-text stores `null` when emptied |
| choice | `Select` of the field's options (e.g. Paper size: A4, US Letter; Background: Parchment texture, Flat colour) (`packages/web/src/lib/document-theme-fields.ts:92-118`) |
| face | Family `Select` (Cinzel, Literata, Times, Helvetica, Courier), style `Select` limited to the family's real styles (Cinzel has no italics), letter-spacing number input titled "Letter spacing (mm)"; switching family keeps the style only if the new family has it (`packages/web/src/lib/document-theme-fields.ts:332-360`) |
| lines | `Textarea` of 8 rows, one entry per line, full row |
| link | Checkbox; when on, "Link text" (default "Visit the website") and "Link address" (placeholder `https://`) inputs side by side from `sm` |

Help text renders under a control as `sl-field__help`; a problem as `sl-field__error`, both wired through `aria-describedby`, with `aria-invalid` on the control (`packages/web/src/routes/document-theme-editor.tsx:469-493`).

What a draft starts from: an existing theme's name and values; a new theme copies the saved theme whose id is `from`, else the built-in named `from` (default `plain`), else the first built-in, named `<label or name> copy` (`packages/web/src/routes/document-theme-editor.tsx:65-84`).

`DocumentThemePicker` (used by Play and Edit project) is a `Picker` with optgroups "Built in" (Plain, plus "DiceMaster (retired, this project's look)" only while a project is on it) and "Your themes"; a project whose copy differs from the Library theme (or whose theme was deleted) gets "<name> (this project's copy)" and the Library one reads "<name> (current version)". Picking a saved theme copies its id, name and values into the project (`packages/web/src/components/document-theme-picker.tsx:13-100`).

## States
| State | Trigger | Rendered |
|---|---|---|
| List loading | `listing.data` undefined, no error | `ListSkeleton` "Document themes": three `sl-row` items with two `bg-sunken` bars, `aria-busy` (`packages/web/src/routes/document-themes.tsx:78-81`, `packages/web/src/library/list-states.tsx:12-25`) |
| List load error | `listing.error` set | Danger `Callout` "The document themes couldn't be loaded." with the message and small "Try again" (refetch) (`packages/web/src/routes/document-themes.tsx:70-76`, `packages/web/src/library/list-states.tsx:28-50`) |
| No saved themes | `themes` empty | Line "No themes of your own yet. Copy a built-in below to start one."; the detail shows the first built-in (`packages/web/src/routes/document-themes.tsx:94-97`, `packages/web/src/routes/document-themes.tsx:54`) |
| Delete confirm (list or editor) | Delete pressed | `ConfirmDialog` `Delete "<name>"?`, consequence "Projects that used it keep their own copy of its settings.", "Cancel" (focused) and "Delete theme"; confirm disabled "Working on it" while pending (`packages/web/src/routes/document-themes.tsx:221-231`, `packages/web/src/routes/document-theme-editor.tsx:240-252`, `packages/web/src/components/kit/dialog.tsx:60-108`) |
| Delete failed (list) | `removeDocumentTheme` rejects | Danger `Callout` "The theme wasn't deleted." with the message, under the list (`packages/web/src/routes/document-themes.tsx:215-219`) |
| Editor loading | list query in flight | `EditorSkeleton`: a bordered sheet with a title bar and a 520px block beside a short aside bar (`packages/web/src/routes/document-theme-editor.tsx:127`, `packages/web/src/components/editor-states.tsx:10-24`) |
| Editor load error | list query failed | `EditorProblem`: danger `Callout` "This can't be opened." with the error message and the link "Back to Documents" (`packages/web/src/routes/document-theme-editor.tsx:126`, `packages/web/src/routes/document-theme-editor.tsx:772-778`, `packages/web/src/library/editor-frame.tsx:24-40`) |
| Theme gone | `$themeId` not in the list | Same frame: "That theme is gone. It may have been deleted in another tab." (`packages/web/src/routes/document-theme-editor.tsx:128-129`) |
| Save held | empty name, or any problem | Save is `aria-disabled`; the status slot reads "Give the theme a name." or "Fix the highlighted settings first."; Ctrl+S toasts `Not saved yet: <reason>` (`packages/web/src/routes/document-theme-editor.tsx:135-140`, `packages/web/src/components/editor-actions.tsx:36-50`) |
| Invalid value | `documentThemeSchema` or `documentThemeNameProblems` fail as typed | The field's error line, its group forced open; the preview pauses (`packages/web/src/routes/document-theme-editor.tsx:107-124`, `packages/web/src/routes/document-theme-editor.tsx:237`) |
| Save refused | server returns field errors | Errors merged into the field problems; editing that field clears its refusal (`packages/web/src/routes/document-theme-editor.tsx:86-96`, `packages/web/src/routes/document-theme-editor.tsx:131-134`) |
| Save or delete failed | request rejects | The messages joined in the status slot, `role="alert"`, danger tone (`packages/web/src/routes/document-theme-editor.tsx:228-230`, `packages/web/src/components/editor-actions.tsx:52-70`) |
| Saved | save succeeds | Status slot shows the "Saved" tick; after 2 s the editor returns to `/document-themes` (`packages/web/src/routes/document-theme-editor.tsx:93-105`, `packages/web/src/components/saved-tick.tsx:6-37`) |
| Preview busy | 450 ms after the last valid change | Status "Updating…"; the last good pages stay up (`packages/web/src/routes/document-theme-editor.tsx:357-389`, `packages/web/src/routes/document-theme-editor.tsx:408-415`) |
| Preview paused | values fail validation | Status "Paused until the highlighted settings are fixed." (`packages/web/src/routes/document-theme-editor.tsx:409-410`) |
| Preview failed | preview request or pdf.js draw fails | Status in `text-danger`: `The preview couldn't be made: <message>` (`packages/web/src/routes/document-theme-editor.tsx:399-406`, `packages/web/src/routes/document-theme-editor.tsx:413-414`) |
| Preview idle | pages drawn | Status "A sample article with this theme. Your projects use their own text and thumbnail." (`packages/web/src/routes/document-theme-editor.tsx:415`) |

## Motion
- Group chevrons rotate 90° on open (`transition-transform`, none under reduced motion); opening a group smooth-scrolls it to the nearest edge on the next frame so it clears the Save bar (`packages/web/src/routes/document-theme-editor.tsx:180-192`).
- The Saved tick fades in with `tick-in` (150ms ease-out), off under reduced motion (`packages/web/src/components/saved-tick.tsx:32`, `packages/web/src/styles/index.css:90`).
- New preview pages are drawn off screen and swapped in together, so the preview never flashes empty and keeps its scroll position (`packages/web/src/components/pdf-pages.tsx:3-5`, `packages/web/src/components/pdf-pages.tsx:30-47`).
- The confirm dialog enters with `dialog-in` (200ms ease-out), off under reduced motion (`packages/web/src/styles/index.css:89`, `packages/web/src/components/ui/dialog.tsx:39`).

## Copy
- Tab and headings: "Documents", "Your themes", "Built in", "Preview", group titles as in Composition (`packages/web/src/routes/library.tsx:18`, `packages/web/src/routes/document-themes.tsx:89-145`).
- Buttons and links: "New theme", "Edit", "Duplicate", "Copy", "Edit theme", "Copy theme", "Delete", "Cancel", "Save", "Delete theme", "Open full size", "Back to Documents", "Edit themes" (Play) (`packages/web/src/routes/document-themes.tsx:61-225`, `packages/web/src/routes/document-theme-editor.tsx:429-774`, `packages/web/src/play/stage-rails.tsx:455-457`).
- Name limits: "Give the theme a name.", `Keep the name under 80 characters.` (`packages/app/src/slices/document/model.ts:69-83`).
- Preview label for assistive tech: "The sample article laid out with this theme" (`packages/web/src/routes/document-theme-editor.tsx:436`).

## Not in play
- Search, sorting and reordering of themes: absent (`packages/web/src/routes/document-themes.tsx:100-172`).
- Editing a built-in: not possible; built-ins offer Copy only (`packages/web/src/routes/document-themes.tsx:160-170`).
- History or version restore for themes: absent; `LibraryRowActions` is given no `onHistory` (`packages/web/src/routes/document-themes.tsx:110-135`).
- Undo after delete and a trash for themes: absent; the delete goes straight to `DELETE /document-themes/:id` (`packages/web/src/api.ts:878-883`).
- Unsaved-changes guard on leaving the editor: absent (`packages/web/src/routes/document-theme-editor.tsx:143-254`).
- Pushing theme edits into existing projects: absent; projects keep their copied values until the theme is picked again (`packages/web/src/components/document-theme-picker.tsx:13-18`).
