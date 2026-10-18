---
generated_at_commit: d6a72d6428ff
generated_date: 2026-10-18
capstone_version: 8.0.0
content_hash: 3b7c91d04e5a
paths_covered:
  - ":(top)packages/web/src/template-studio"
  - ":(top)packages/web/src/router.tsx"
  - ":(top)packages/web/src/routes/templates.tsx"
  - ":(top)packages/web/src/routes/settings-sections.ts"
---

# Template Studio

## Mode & job
Configure surface at `/templates/$templateId`: one template set up section by section, in the order a run makes them, with each section's few visible settings beside a live sample and a priced Save. Nothing changes for a schedule until the person presses Mark ready (`packages/web/src/template-studio/page.tsx:37-38`, `packages/web/src/template-studio/ready-gate.tsx:29-31`).

- Entry: Library → Templates, the row's secondary "Open studio" button; a template's row says "To change the settings, press Open studio." (`packages/web/src/routes/templates.tsx:296-310`, `packages/web/src/templates/row-parts.tsx:69`).
- Route: a child of the root route, not of the Library layout, so the Library header and tabs are not drawn and the rail lights no item beyond what the path matches (`packages/web/src/router.tsx:376-406`). `?section=` names the section (any other value opens the first, `subject`); `?compareProvider=` and `?compareModel=` carry a model that Settings → Models offers to compare (`packages/web/src/router.tsx:378-399`, `packages/web/src/template-studio/compare-on-sample.tsx:53`).
- One address serves every kind of template: when the project-template studio query fails and the id is a design template's, the page redirects (replace) to `/design-templates/$templateId` (26-designs) (`packages/web/src/template-studio/page.tsx:53-62`).
- The page tells the in-app assistant which template and section is open (27-assistant) (`packages/web/src/template-studio/page.tsx:51`).
- The sections, in order: Subject & research, Script, Voice, Pictures, Video & captions, Thumbnail & title, Shorts, Document (PDF), Reviews & checkpoints, Upload pack, Schedule (`packages/app/src/slices/template-studio/model.ts:6-32`).
- Costs and the daily budget are set in Settings → Template studio (`packages/web/src/routes/settings-sections.ts:31-32`, `packages/web/src/template-studio/settings-panel.tsx`).

## Composition
| Region | What renders | Kit / tokens |
|---|---|---|
| Header | `PageHeader row`: crumb "Templates" back to `/templates`, the template name, meta "Version N · <gate words>", and three actions: the "Sample topic: <topic>" quiet button, Export pack, Mark ready (`packages/web/src/template-studio/page.tsx:168-191`) | `PageHeader`, `Button` |
| Phone panes | Below 768 px a `Tabs` row "Studio panes" (Sections, Settings, Sample) shows one of the three columns; the other two get `max-md:hidden` (`packages/web/src/template-studio/page.tsx:164`, `packages/web/src/template-studio/page.tsx:192-203`) | `Tabs` |
| Left column | `StudioRail` "Template sections": one `RailLink` per section with a lamp for its sample state and the state word for screen readers; the link keeps `?section=` and does not reset scroll (`packages/web/src/template-studio/section-rail.tsx:43-108`) | `Rail`, `Lamp` |
| Centre column | Section "<label> settings": a `SectionHead` with the label, then the section's visible controls (a few `Switch`, `Segmented` or `Field` controls: Research; Script and Expected length; Level the volume, Soften breaths, Soften S sounds; Pictures and Scenes from the script; Format, Captions, Motion, Seconds per picture; Thumbnail and Thumbnails per video; Make shorts and Shorts per video; PDF document; a reviews summary; Write the YouTube description, chapters and tags) (`packages/web/src/template-studio/page.tsx:224-229`, `packages/web/src/template-studio/visible.tsx:15-265`) | `Field`, `Switch`, `Segmented` |
| Made with | One line "Made with <provider> · <model>" per section, or "Nothing chosen to make it with yet" (`packages/web/src/template-studio/made-with.tsx:11-32`) | plain text |
| Compare models | For Script, Voice and Pictures: a "Compare models" form (provider and model pickers, up to two models, "Compare · <price>") and a "Compared models" list of what each model made, cost and took beside the one in use, with "Use this model" and Discard (`packages/web/src/template-studio/page.tsx:235-253`, `packages/web/src/template-studio/bakeoff.tsx:184-310`, `packages/web/src/template-studio/bakeoff.tsx:408-478`) | `Field`, `Fold`, `InfoTip`, `MediaGrid` |
| Fine-tune | A `Fold` "Fine-tune <section>" holding every other setting in Play's own editors, bound to the template; it opens by itself after "Made with" changes something (`packages/web/src/template-studio/page.tsx:254-260`, `packages/web/src/template-studio/fine-tune.tsx:25-27`) | `Fold` |
| Prompt anatomy | The section's prompt as the sample sent it, with marks for "Your words", "Your keywords", "Filled by Slopify" and "Added by a setting"; "This section sends no prompt." when there is none (`packages/web/src/template-studio/anatomy.tsx:24-27`, `packages/web/src/template-studio/anatomy.tsx:90`) | plain text, `Fold` |
| Right column | `Workspace` aside "Sample and checks": the Sample panel, "Samples from the pack" when the template came from a pack, and Checks (`packages/web/src/template-studio/page.tsx:216-222`) | `Workspace` |
| Sample panel | `SectionHead` "Sample" with the state `Status` and, where it applies, "Make sample · <price>" (paid sections) or "Make samples" (free ones); the state's own sentence; then the section's body: the 30-second video in the template's frame (Video & captions), before and after audio with LUFS (Voice), an inline PDF and "Open the PDF sample" (Document), the next runs table and monthly cost (Schedule), "Where a run stops" steps (Reviews), or the paid sample's script excerpt with a wide reading drawer, narration, pictures, thumbnail with title, video, short or upload text (`packages/web/src/template-studio/sample-panel.tsx:42-193`, `packages/web/src/template-studio/paid-sample.tsx:34-110`) | `Player`, `AudioPlayer`, `MediaGrid`, `DataTable`, `Steps`, `Drawer`, `ReadingView` |
| Say it as | On Voice: "Names to check" with a "Play <name>" button, a "Say <name> as" field and a Save priced as "Save · re-voice N lines · <price>"; saved into Library → Narration aliases (`packages/web/src/template-studio/say-it-as.tsx:81-260`) | `Field`, `InfoTip` |
| Earlier samples | A `Fold` "Earlier samples · N" listing each older version as Queued, Being made, Made, Failed, Saved without a sample or Waiting, with its date (`packages/web/src/template-studio/paid-sample.tsx:293-314`) | `Fold` |
| Checks | `SectionHead` "Checks" with meta "All pass" or "N to fix"; one `Status` row per check with its sentence and, for a failing one, a `TextLink` to where it is fixed (`packages/web/src/template-studio/checks-list.tsx:11-62`) | `SectionHead`, `Status`, `TextLink` |
| Action bar | `ActionBar` with the status slot, an "Accept N steps with no known price" switch when needed, "Save without a sample" and the primary Save labelled by `priceLabel`: "Save · plan usage", "Save · free", "Save · no paid change", "Save · about $X", "Save · pricing…" (`packages/web/src/template-studio/save-bar.tsx:21-26`, `packages/web/src/template-studio/save-bar.tsx:131-173`) | `ActionBar`, `StatusSlot`, `Switch` |
| Sample topic drawer | Opens from the header: Topic choice (typed, "Next queued topic", "The fixed topic"), a price on "Use topic · <price>", the unknown-price switch; changing the topic remakes every paid sample, so it is priced first (`packages/web/src/template-studio/topic.tsx:12-153`) | `Drawer`, `Field`, `Segmented` |

Header actions: Export pack is disabled until a version is marked ready ("Mark a version ready first: a pack carries the version you checked") and its label names the checked version; it carries an InfoTip (`packages/web/src/template-studio/pack.tsx:28-73`). Mark ready opens a `ConfirmDialog` "Mark version N ready?" whose consequence says that schedules start running this version from their next run (and what they ran until now), or, the first time, that a version saved later waits until Mark ready is pressed (`packages/web/src/template-studio/ready-gate.tsx:50-95`).

Header meta words (`gateWords`): "Ready", "Ready, carried from an earlier version", "Saved before the studio: schedules run it", "Not checked in the studio" with " · schedules run version N" when an older one is the ready one, and "Not checked in the studio: schedules run the newest version" for a template that was never gated (`packages/web/src/template-studio/page.tsx:87-103`). Library → Templates and the schedule detail show the same states through `gate-words.ts` (`packages/web/src/routes/templates.tsx`, `packages/web/src/schedules/schedule-detail.tsx`, `packages/web/src/template-studio/gate-words.ts:12-59`).

## States
| State | Trigger | Rendered |
|---|---|---|
| Loading | studio query pending, or failed while a design-template lookup is in flight | `StudioSkeleton`: `role="status"`, label "Loading the template studio", a header bar and three grey columns in the studio's grid (`packages/web/src/template-studio/page.tsx:63`, `packages/web/src/template-studio/page.tsx:269-280`) |
| Load error | studio and design lookups both fail | `PageHeader` "Template studio" with crumb, then a danger `role="alert"` line "The studio didn't open: <message>" (`packages/web/src/template-studio/page.tsx:64-75`) |
| Section state | each section's sample | Lamp and word: Current, Making, Waiting, Needs a fix, No current sample, Off, Provided (`packages/web/src/template-studio/section-rail.tsx:7-25`) |
| Needs a fix | a sample step failed | the sentence under the Sample head turns `text-danger` and carries the step's own words (`packages/web/src/template-studio/sample-panel.tsx:91-98`) |
| Dirty | document differs from the saved one | Unsaved changes status; `UnsavedLeaveGuard` asks before leaving ("your template changes"); Save buttons enable (`packages/web/src/template-studio/page.tsx:148`, `packages/web/src/template-studio/page.tsx:167`, `packages/web/src/template-studio/save-bar.tsx:128-129`) |
| Pricing | an edit, 400 ms after the last keystroke | Save reads "Save · pricing…" and is disabled with "Pricing the sample" (`packages/web/src/template-studio/save-bar.tsx:19`, `packages/web/src/template-studio/save-bar.tsx:101-103`) |
| No sample possible | the quote has a problem | warning "<problem> Save without a sample keeps the change."; primary Save disabled "No sample can be made of this setup" (`packages/web/src/template-studio/save-bar.tsx:108-122`) |
| Over budget | quote does not fit today's budget or the CLI-plan setting | warning slot with the budget lead and a link "Settings → Template studio", or press Save without a sample (`packages/web/src/template-studio/save-bar.tsx:134-143`, `packages/web/src/template-studio/budget-words.ts:22-23`) |
| Unknown price | steps with no known price | switch "Accept N steps with no known price"; Save stays disabled until on (`packages/web/src/template-studio/save-bar.tsx:112-113`, `packages/web/src/template-studio/save-bar.tsx:151-157`) |
| Save refused | server refuses | error "The template wasn't saved: <reason>"; a new price from the server replaces the button's, ready to accept with one more press (`packages/web/src/template-studio/save-bar.tsx:80-85`) |
| Free samples | a free sample is stale, or the schedule cost is unpriced | asked for once per version, by themselves; failure reads "The samples weren't asked for: <reason> Press Make samples again." (`packages/web/src/template-studio/page.tsx:124-147`) |
| Mark ready blocked | version already ready, unsaved edits, checks loading or failing, a section sample not current | disabled with the reason: "This version is marked ready: schedules run it", "Save your changes first: Mark ready marks a saved version", "N checks fail: fix them under Checks first", "Look over a current sample of <sections> first" (`packages/web/src/template-studio/ready-gate.tsx:13-27`) |
| Marked ready | gate is `ready` | button reads "Marked ready" (`packages/web/src/template-studio/ready-gate.tsx:82`) |
| Files note | a file-adding control is used | info "Files are added to each video in Play: the template keeps only that the video provides them." (`packages/web/src/template-studio/page.tsx:150-157`) |
| Bake-off | compare started, running, finished, template saved since | "Being made on copies of the sample. Your template doesn't change." / "Made on copies of the sample. Your template doesn't change until you use a model and Save." / "Made for version N; the template was saved since."; Compare disabled "Save first: models are compared on the saved version's sample" while dirty (`packages/web/src/template-studio/bakeoff.tsx:190-204`, `packages/web/src/template-studio/bakeoff.tsx:303`) |
| Checks load error | checks query fails | "The checks didn't load: <message> Reload the page to look again." (`packages/web/src/template-studio/checks-list.tsx:30-33`) |

Settings → Template studio (a section in the "Production defaults" group): "Daily sample budget" (a dollar field, 0.00 to 1,000.00; at 0.00 no sample spends money; help says what was spent today), a "Samples may use my CLI plans" switch whose help says that such usage has no dollar price and so is not limited by the budget, and "Samples for all templates" with a priced "Make samples for all" button (`packages/web/src/routes/settings-sections.ts:105`, `packages/web/src/template-studio/settings-panel.tsx:23-245`).

## Motion
- No motion authored for the studio. The side-panel assistant narrows the main area and drops the aside under the settings with `.sl-app--side-panel` (`packages/web/src/styles/shell.css:669-679`). Toasts, lamps and drawers use the shared kit animation.

## Copy
- Header and meta: "Version N · <gate words>"; "Sample topic: <topic>"; "Mark ready"/"Marked ready"; "Export pack"/"Export pack (version N)" (`packages/web/src/template-studio/page.tsx:172`, `packages/web/src/template-studio/pack.tsx:70-71`).
- Failure sentences follow the "what failed, why, press this button" form: "The pack wasn't made: <reason> Press Export pack again.", "The sample wasn't asked for: <reason> Press Make sample again.", "The topic wasn't changed: <reason>", "Nothing was started: <reason> Press Compare again." (`packages/web/src/template-studio/pack.tsx:53`, `packages/web/src/template-studio/paid-sample.tsx:227`, `packages/web/src/template-studio/topic.tsx:84`, `packages/web/src/template-studio/bakeoff.tsx:395`).
- Import: "Imported <name>. No schedule runs it until you look over its samples and press Mark ready." (`packages/web/src/template-studio/pack.tsx:87`). The import button on Library → Templates reads "Import template pack" / "Importing…" (`packages/web/src/template-studio/pack.tsx:140`).
- Pack samples: "Samples from the pack", meta "Made by whoever exported it. Your own samples replace these once you press Save." (`packages/web/src/template-studio/pack.tsx:164-168`).
- InfoTip ids: `template-studio.export-pack`, `template-studio.compare-models`, `template-studio.say-it-as`, `template-studio.sample-topic`, `templates.import-pack`.

## Not in play
- Editing a prompt's text: absent; the studio shows prompt anatomy but a prompt is edited in the Library (05-prompt-editor).
- Choosing a different template version to mark ready: only the saved current version can be marked; a past version is not selectable here (`packages/web/src/template-studio/ready-gate.tsx:12-27`).
- Adding files to a sample: absent; files belong to each video in Play (`packages/web/src/template-studio/page.tsx:150-157`).
- A paid sample for Subject & research, Reviews, Upload pack and Schedule beyond what the shared paid sample makes: those sections show a state and, for Reviews and Schedule, a table or steps rather than a made output (`packages/web/src/template-studio/sample-panel.tsx:174-189`).
- Stopping sample work already going: a Save never stops it (the Bake-off Discard waits until a running one finishes) (`packages/web/src/template-studio/bakeoff.tsx:204`).
- A per-section Save: absent; there is one Save for the whole template.
- Undo of Mark ready: absent; saving a newer version leaves the ready one running until the new one is marked.
