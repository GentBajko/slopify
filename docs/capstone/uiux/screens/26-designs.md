---
generated_at_commit: d6a72d6428ff
generated_date: 2026-10-18
capstone_version: 8.0.0
content_hash: 7e20d5a1c4b8
paths_covered:
  - ":(top)packages/web/src/designs"
  - ":(top)packages/web/src/router.tsx"
  - ":(top)packages/web/src/routes/library.tsx"
  - ":(top)packages/web/src/routes/project.tsx"
  - ":(top)packages/web/src/play/output-picker.tsx"
---

# Designs

## Mode & job
Three connected surfaces for pictures that are not projects: the Library's Designs tab (a gallery of edited pictures and designed pieces, and a list of design templates), one design's editor (edit a picture with an image model, or lay real-font text over an AI-drawn artwork, and download it in several sizes), and a design template's studio (a poster with fields such as `{{Event}}`, made again by hand or ahead of each date by a schedule) (`packages/web/src/designs/designs-route.tsx:27-29`, `packages/web/src/designs/design-page.tsx:34-39`, `packages/web/src/designs/editor/template-editor.tsx:64`).

Routes (`packages/web/src/router.tsx:226-273`):
- `/designs?tab=` (child of the Library layout; `tab` is `templates`, otherwise Designs), the "Designs" Library tab under Setups (`packages/web/src/routes/library.tsx:19-23`).
- `/designs/$designId` and `/design-templates/$templateId` (children of the root route, so no Library header or tabs). The shell's Library item matches `/designs` and `/design-templates`, so Library stays lit on the gallery and on both editors (`packages/web/src/components/shell.tsx:117-125`, tested in `shell.test.ts`).
- Starts: the gallery toolbar, the Create output picker's quiet line "Or start from a picture: Edit a picture · Design a poster" and a project's overflow menu item "Designs (N)…" (`packages/web/src/designs/start.tsx:117-139`, `packages/web/src/play/output-picker.tsx:62`, `packages/web/src/routes/project.tsx:561-566`).
- A change to a design or a design template reaches the page through the shell's live events (`design.changed` and the template event) which invalidate the lists (`packages/web/src/components/shell.tsx:271-275`).

## Composition
### Gallery (`/designs`)
| Region | What renders | Kit / tokens |
|---|---|---|
| Tabs | "Designs" and "Templates" (`Tabs` label "Designs"), the address keeps `?tab=templates` (`packages/web/src/designs/designs-route.tsx:47-57`, `packages/web/src/router.tsx:226-248`) | `Tabs` |
| Toolbar | `LibraryToolbar`: a `text-small` line, then the start buttons. Designs tab: secondary "Design a poster", primary "Edit a picture". Templates tab: primary "New design template" (`packages/web/src/designs/designs-route.tsx:58-82`) | `LibraryToolbar`, `Button` |
| Designs | `MediaGrid list` of square `MediaFrame` tiles: the newest version's picture, name, meta "Picture edit" or "Designed piece", a "Making" badge while a version is being made, an always-shown trash `IconButton` "Delete <name>", the whole tile opens `/designs/$designId` (`packages/web/src/designs/designs-route.tsx:117-161`) | `MediaGrid`, `MediaFrame`, `Badge` |
| Templates | `List` of `ListRow`s: a name link, meta "Version N" plus " · made ahead of each date" for a scheduled one, a lead badge "Not ready" or "Ready · vN", and actions "Open studio" (secondary link) and "Delete" (quiet) (`packages/web/src/designs/designs-route.tsx:167-230`) | `List`, `ListRow`, `Badge` |

The same template list is shown on Library → Templates beside project templates (`packages/web/src/designs/designs-route.tsx:165-166`). Picking a picture opens a hidden file input accepting PNG and JPEG (`packages/web/src/designs/start.tsx:99-112`).

### Design editor (`/designs/$designId`)
| Region | What renders | Kit / tokens |
|---|---|---|
| Header | `PageHeader` with crumb "Designs", the name, meta "Picture edit · N versions" or "Designed piece · N versions" (`packages/web/src/designs/design-page.tsx:291-299`) | `PageHeader` |
| Picture | Left column: a "Show" segmented Before/After (Before disabled without an earlier version), a format switch (the piece is drawn with its text in the chosen format once a picture exists), and the picture or "No picture yet" / "Making the artwork…" (`packages/web/src/designs/design-picture.tsx:50-130`) | `Segmented`, `MediaFrame` |
| Versions | Under the picture: `SectionHead` "Versions", meta "Every version is kept. The next edit starts from the one marked current."; one row per version "Version N · <kind> · current" with Continue from here and, for a failed one, its error and Try again (`packages/web/src/designs/design-picture.tsx:151-195`) | `SectionHead`, `List` |
| Tabs | Right column `Tabs` "Change the design": Edit, Text, Formats (`packages/web/src/designs/design-page.tsx:306-320`) | `Tabs` |
| Edit tab | "What to change" textarea (4000 chars; help "Everything you don't mention stays as it is.") and a Made-with provider/model line; for a design with no artwork yet, "Describe the artwork" (help "No words: Slopify adds the text.") instead (`packages/web/src/designs/design-page.tsx:322-366`) | `Field`, `Textarea` |
| Text tab | Text panel: "Add your own text on top" lines (each with role, size, font and colour under "Fine-tune lines · size, font and colour"), "Where the text sits", "Behind the text", Fields for `{{name}}` values, and a "Let the AI draw the text" switch with a waiting callout "The AI may misspell names, dates and prices. Check every word before you print." (`packages/web/src/designs/design-panels.tsx:25-76`, `packages/web/src/designs/text-fields.tsx:61-207`) | `Field`, `Fold`, `Callout`, `Switch` |
| Formats tab | "Posters, flyers and social sizes", brochure title and pages (Markdown, fields filled in), "Fine-tune crops", a Download group with PNG and PDF links per format, and "Keep in project" (help "Linked only: nothing is added to the project's video.") (`packages/web/src/designs/design-panels.tsx:119-163`, `packages/web/src/designs/formats-fields.tsx:52-111`) | `SectionHead`, `FileLink`, `Field` |
| Action bar | `StatusSlot` and, on the Edit tab only, the primary `Edit · <price>` (`Make artwork · <price>` while there is no artwork yet); Text and Formats save by themselves (`packages/web/src/designs/design-page.tsx:397-433`) | `ActionBar`, `StatusSlot` |

### Design template studio (`/design-templates/$templateId`)
| Region | What renders | Kit / tokens |
|---|---|---|
| Header | `PageHeader` with crumb "Design templates" (to `/designs?tab=templates`), the name ("Untitled template" when empty), meta "Version N · ready" / "not marked ready" / "version M is ready" (`packages/web/src/designs/editor/template-editor.tsx:171-187`) | `PageHeader` |
| Rail | `StudioRail` with Picture, Text layout, Formats, Schedule (`designSections`); the section is kept in the URL hash; the picture's lamp follows its sample, a failing check marks its section "Needs a fix" (`packages/app/src/slices/designs/sections.ts:9-16`, `packages/web/src/designs/editor/template-editor.tsx:139-156`, `packages/web/src/designs/editor/template-editor.tsx:188-198`) | `Workspace`, `StudioRail` |
| Section | Picture: Template name, Artwork source, "Describe the artwork" or "The picture every piece uses". Text layout: "Sample values" and "More · the AI draws the text: on/off". Formats. Schedule: "Each piece's date is in", "Days ahead", "At", rows (one per piece, per field), "Spend ceiling per piece (US$, optional)", "Missed run" (`packages/web/src/designs/editor/sections.tsx:25-200`, `packages/web/src/designs/editor/schedule-rows.tsx:169-253`) | `Field`, `Fold`, `Callout` |
| Aside | "Sample": the one paid sample (the artwork) with a format switch, and a danger callout "Not ready yet" listing each failing check with a button that opens its section (`packages/web/src/designs/editor/sample-panel.tsx:32-100`, `packages/web/src/designs/editor/template-editor.tsx:199-229`) | `Callout`, `MediaFrame` |
| Action bar | quiet "Save without a sample", "Make a piece", "Mark ready", primary `Save · <price>` ("Save · free" when only text, formats or the schedule changed, because only the picture is paid) (`packages/web/src/designs/editor/template-editor.tsx:157-163`, `packages/web/src/designs/editor/template-editor.tsx:250-312`) | `ActionBar` |
| Make a piece | `Drawer`: one input per field prefilled from the sample values, a quote, a switch to accept unknown prices, then the paid artwork; the piece opens as a design (`packages/web/src/designs/editor/make-piece.tsx:19-60`) | `Drawer`, `Field`, `Switch` |

### Project designs
A project's "Designs (N)…" menu item opens the `Designs` drawer: a list of the designs kept with the project (thumbnail, name link, kind), the footer starting a poster or picture edit in that project, and the empty text "A poster or picture made here is kept with the project. To keep one you already made, open it and choose this project under Formats → Keep in project." The item is disabled for the bundled sample project (`packages/web/src/designs/project-designs.tsx:25-95`, `packages/web/src/routes/project.tsx:561-566`).

## States
| State | Trigger | Rendered |
|---|---|---|
| Gallery loading | query pending | `LoadingBlock` "Loading your designs" (two rows) / "Loading your design templates" (`packages/web/src/designs/designs-route.tsx:109-110`, `packages/web/src/designs/designs-route.tsx:184`) |
| Gallery load error | query fails | `LoadFailed` "Your designs" / "Your design templates" with Retry in place (`packages/web/src/designs/designs-route.tsx:100-108`, `packages/web/src/designs/designs-route.tsx:175-183`) |
| Empty | no designs / no templates | `EmptyState` "No designs yet": "Edit a picture of your own, or design a poster: both start from the buttons above." / "No design templates yet": "Make a poster template once, then make it again for every event, by hand or from a schedule." (`packages/web/src/designs/designs-route.tsx:111-116`, `packages/web/src/designs/designs-route.tsx:185-190`) |
| Start failing | upload, create or template create refused | the toolbar line is replaced by the server's message; start buttons disabled while busy (`packages/web/src/designs/designs-route.tsx:76-81`, `packages/web/src/designs/start.tsx:41-51`) |
| Editor load error | design query fails | `LoadFailed` "The design" with fix "Open Library → Designs and choose it again." (`packages/web/src/designs/design-page.tsx:52-61`); the template editor says "Open Library → Designs → Templates and choose it again." (`packages/web/src/designs/editor/template-editor.tsx:49-58`) |
| Making | a version is being made | status "Making version N with <model>…"; the Edit button disabled "Wait for the picture being made." (`packages/web/src/designs/design-page.tsx:253-274`) |
| Edit blocked | no description, unsaved text, no picture, no instruction | disabled with "Describe the artwork under Edit first.", "Wait for your change to be saved.", "There is no picture to edit yet.", "Write what to change first." (`packages/web/src/designs/design-page.tsx:254-266`) |
| Autosave | Text or Formats edit | saved 600 ms after the last keystroke, one save at a time; status "Saving…" then "Saved." (`packages/web/src/designs/design-page.tsx:110-144`) |
| Price changed | the cost moved since the quote | error with the server's sentence; the button shows the new price, one more press accepts it (`packages/web/src/designs/design-page.tsx:98-108`) |
| Failed version | a step failed | error status with a Try again button; the first press shows "Trying version N again asks the provider again, and is paid again: <price>. Press Try again to make it." and the second pays it (`packages/web/src/designs/design-page.tsx:203-241`, `packages/web/src/designs/design-page.tsx:275-287`) |
| Template saved | Save succeeds | success "Saved as version N." plus any refusal sentence for the sample (`packages/web/src/designs/editor/template-editor.tsx:107-116`) |
| Mark ready refused | checks fail | error with the message and the "Not ready yet" callout (`packages/web/src/designs/editor/template-editor.tsx:122-137`) |
| Mark ready blocked | unsaved edits, already ready, no sample | disabled: "Save first: a version is marked ready as saved.", "This version is already ready.", "Make this version's sample first: Mark ready needs a current sample to look over." (`packages/web/src/designs/editor/template-editor.tsx:275-293`) |
| Make a piece blocked | unsaved edits | disabled "Save first: a piece is made from the saved version." (`packages/web/src/designs/editor/template-editor.tsx:267-270`) |

## Motion
- None authored; the picture, Before/After switch and tiles change without transitions (`packages/web/src/designs/design-picture.tsx:50-130`). Toasts and drawers use the shared kit animation.

## Copy
- Names: "Edit a picture", "Design a poster", "New design template"; new items are named "New poster" and "New poster template" until renamed (`packages/web/src/designs/start.tsx:77`, `packages/web/src/designs/start.tsx:89`).
- Kinds: "Picture edit" and "Designed piece" (`packages/web/src/designs/designs-route.tsx:132`).
- Paid buttons carry their price: `Edit · <price>`, `Make artwork · <price>`, `Save · <price>`; the price words come from `priceWords` (`packages/web/src/designs/design-page.tsx:428`, `packages/web/src/designs/api.ts`).
- InfoTip ids: `library.design.artwork`, `library.design.change`, `library.design.show`, `library.design.text-position`, `library.design.scrim`, `library.design.line-style`, `library.design.brochure`, `library.design.template-name`, `library.design.source`, `library.design.date-field`, `library.design.days-ahead`, `library.design.time`.

## Not in play
- Naming a design in the editor header: absent; a picture edit takes the file name and a poster is "New poster" (`packages/web/src/designs/start.tsx:24-28`, `packages/web/src/designs/start.tsx:77`).
- Undoing a version: absent; every version is kept and the next edit continues from the current one (`packages/web/src/designs/design-picture.tsx:156`).
- Deleting with a confirmation dialog: absent; Delete on a tile or row acts at once (`packages/web/src/designs/designs-route.tsx:139-147`, `packages/web/src/designs/designs-route.tsx:220-228`).
- Adding the design to a project's video: absent; "Keep in project" only links it (`packages/web/src/designs/design-panels.tsx:163`).
- A rail item lit for Designs: absent (`packages/web/src/components/shell.tsx:103-117`).
- Marking a design template ready without its own current sample: absent (`packages/web/src/designs/editor/template-editor.tsx:165-167`).
