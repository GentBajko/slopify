---
scenario: designs
screens:
- 09-schedules
- 03-project
- 08-settings
depends_on:
- 14-storage-and-downloads
- 18-cost-review-batch
- 24-project-templates
- 25-scheduled-jobs
- 26-document
- 30-channels-and-cast
- 37-run-cost-and-eta
- 39-notifications-and-live-events
- 40-trash-and-scheduled-backups
- 45-mcp-agent-access
generated_at_commit: d6a72d6428ff
generated_date: 2026-10-18
capstone_version: 7.0.1
content_hash: 52d4b1e8c673
paths_covered:
  - ":(top)packages/app/src/slices/designs/**"
  - ":(top)packages/app/src/slices/trash/designs.ts"
  - ":(top)packages/app/src/slices/schedules/by-date.ts"
  - ":(top)packages/app/src/slices/schedules/design-run.ts"
  - ":(top)packages/app/src/slices/schedules/design-agenda.ts"
  - ":(top)packages/app/src/slices/schedules/design-check.ts"
  - ":(top)packages/app/src/slices/schedules/next-run.ts"
  - ":(top)packages/app/src/edge/http/designs.ts"
  - ":(top)packages/app/src/edge/http/design-templates.ts"
  - ":(top)packages/app/src/edge/mcp/tools-designs.ts"
  - ":(top)packages/app/src/kernel/db/migrations/0070-designs.sql"
  - ":(top)packages/app/src/kernel/db/migrations/0071-design-usage.sql"
  - ":(top)packages/app/src/kernel/db/migrations/0072-design-templates.sql"
  - ":(top)packages/app/src/kernel/db/migrations/0073-schedule-design-kind.sql"
  - ":(top)packages/app/src/main.ts"
  - ":(top)packages/web/src/designs/**"
---

# 52 Designs

Designs are pictures and printed or social pieces that are not videos. **An edit** is an uploaded picture changed step by step ("make the sky darker"); each step is one version of the picture. **A designed piece** (a poster, flyer, brochure or social image) is artwork the AI draws, or a picture of the person's own, with the text laid out by Slopify itself, so every letter is spelled as typed, in one or more formats. A **design template** keeps a designed piece's settings with fields (`{{Event}}`, `{{Date}}`) to make again by hand or from a **design schedule**, which makes one piece per dated row ahead of its date. A design is its own record, not a project: it is linked to a project only by "Keep in project". Paths starting `slices/` or `edge/` are under `packages/app/src/`; web paths are under `packages/web/src/`; routes are under `/api`.

## Trigger & preconditions

| Behavior | Trigger | Preconditions |
|---|---|---|
| Start an edit | Library → Designs → Edit a picture (the file picker, PNG or JPEG), or Create's "Or start from a picture"; a project's Designs panel does the same with the project linked (`web/src/designs/start.tsx:30-87`, `:119`, `web/src/designs/project-designs.tsx:22`); `POST /api/designs/pictures` then `POST /api/designs {kind: "edit", fromStepSha}`; agents' `upload_design_picture`, `create_design` (`edge/http/designs.ts:93-117`, `edge/mcp/tools-designs.ts:19-31`) | A PNG or JPEG of at most 10 MB (`castImageMaxBytes`); the channel and project, when named, exist |
| Start a designed piece | Library → Designs → the poster button (a blank document named "New poster" with the AI drawing the artwork) (`web/src/designs/start.tsx:88-99`); `POST /api/designs {kind: "design", document}` | The settings parse against the design schema (`slices/designs/schema.ts:85-110`) |
| Edit the picture | Design page → Change the design → What to change → Edit · price; `POST /api/designs/:id/edit` (202); agents' `edit_design_picture` (`slices/designs/runner.ts:112-185`) | The version to edit is ready; an image provider is set up; the price shown is not exceeded (Step 4) |
| Make the artwork | Design page → Describe the artwork → Make artwork; `POST /api/designs/:id/artwork` (202) (`runner.ts:186-241`) | The design has a document whose picture is "Made by the AI", every field its prompt uses has a value |
| Try again | A failed version's Try again; `POST /api/designs/:id/steps/:stepId/retry` (202) (`runner.ts:242-286`) | The version failed; paid again, at the price shown |
| Continue from a version | A version's Continue from here; `PUT /api/designs/:id/head` (`slices/designs/service.ts:346-373`) | The version is ready. Free |
| Download a finished piece | Formats → Download PNG / PDF per format; `GET /api/designs/:id/files/<format>.png|pdf`; agents' `get_design_file` (`edge/http/designs.ts:189-203`) | A format ticked for the design, artwork made, every field filled |
| Save a design | The page saves free changes a moment after the last keystroke; `PUT /api/designs/:id {baseUpdatedAt, ...}` (`slices/designs/service.ts:300-344`) | `baseUpdatedAt` is the `updatedAt` last read, else 409 |
| Turn an edit into a designed piece | Formats → Turn into a designed piece (`web/src/designs/design-panels.tsx:120`) | Saving a `document` on an edit sets its kind to `design` (`service.ts:332-335`) |
| Delete a design | `DELETE /api/designs/:id` → Settings → Trash for 30 days (`edge/http/designs.ts:128-139`, `slices/trash/designs.ts:10-17`) | Not a template's hidden sample |
| Create, save, mark ready, make from a design template | Library → Designs → Templates, then the template's studio (`design-templates/$templateId`): Save, Make sample, Mark ready, Make a piece; `POST/GET/PUT/DELETE /api/design-templates...` (`edge/http/design-templates.ts:90-235`, `web/src/router.tsx:232-270`, `web/src/designs/editor/template-editor.tsx:46`) | Per route below |
| A design schedule | The template studio's Schedule section: Start the schedule / Save schedule; `POST /api/schedules` with `templateKind: "design"` and a `by-date` cadence (`web/src/designs/editor/schedule-rows.tsx:49-293`, `slices/schedules/design-check.ts:14-64`) | The saved template names its date field; every row has a real date (Step 14) |

## Steps

### The record (`kernel/db/migrations/0070-designs.sql`, `slices/designs/service.ts`)

1. **A design** (`designs`): `kind` edit or design, a name (1-200), the channel its paid calls count under on Home, an optional project (cleared if the project is deleted), the template, version, schedule and run it came from, the `document` (settings) and `values` (the field values), the version it shows (`head_step_id`), and `sample_of` for a template editor's hidden sample. Every list leaves samples out (`slices/designs/repo.ts:28`, `:117`).
2. **Versions** (`design_steps`): kind `upload`, `edit` or `generate`, an instruction, the provider and model, the inputs kept so Try again asks the same (cast, aspect, prompt), a state `making`, `ready` or `failed`, the picture's hash in `image_blobs` (backed up), and its size. Versions chain by `parent_id`; `UNIQUE(design_id, n)`; a ready version must have a hash.
3. **Create** (`createDesign`, `service.ts:187-289`) is idempotent on `mutationId` (a repeat with the same body returns the design; a different body → 409 "This request id was already used for a different change. Reload the page and try again."). It checks the channel and project, requires settings for a designed piece and a starting picture for an edit, then in one transaction inserts the design and its first version (`upload`, ready) and sets it as the head. The staged upload is released afterwards. Pictures are read for type and size (`slices/designs/pictures.ts`, `picture-size.ts`): only PNG or JPEG, up to 10 MB. Emits `design.changed`.

### Paid pictures (`slices/designs/runner.ts`, `calls.ts`, `quote.ts`)

4. **Quote, then acknowledge.** `POST /:id/quote` and `/:id/artwork/quote` price one edit or the artwork and record nothing (`runner.ts:84-111`, `slices/designs/quote.ts:7-28`). An edit sends pictures, so its price is a range. A paid call starts only when its current high price is no more than the `acknowledgedHigh` the person saw plus half a cent, and a price nobody knows only after `acknowledgedUnknown` (`costChanged`, `quote.ts:32-38`); otherwise 409 `cost-changed` with the new quote and "The price changed since you looked: … Check the new price on the button and press it again." (`:40-44`).
5. **Start** (`edit`, `artwork`, `retry`): the request is replayed by `mutationId` (a repeat finds its version); the cast members are loaded; a version is stored as `making` with the same inputs it will be asked with, and the call is started in the background, so the request answers 202 at once. With no image provider the request is refused 409 "No image provider is set up. Add one in Settings → Providers, then press the button again." Retry restarts a failed version and is paid again, even for one a restart stopped that may already have been charged (`runner.ts:269`).
6. **The call** (`createDesignCalls`, `calls.ts:26-139`): at most two at once (`maxConcurrentDesignCalls`); the source picture of an edit is sent as stored, shrunk to a JPEG by ffmpeg when over the cast-image limit (`renderer.shrink`: at most 4096 pixels on the long side, `render-args.ts:33-46`); the call goes through the standalone image attempt wrapper, owner kind `design`, so it is metered on the design (`main.ts:834-840`, migration `0071-design-usage.sql`). The answer must be a usable PNG or JPEG within the backup's size limit; it is stored and the version becomes `ready` and the design's head in one transaction; a failure settles it `failed` with a sentence (`failedSentence`, `:143-150`): a model that cannot do this or a refused key says the fix (Made with … · change, Settings → Providers), anything else offers Try again. Either way `design.changed` goes out on the global stream and the page refreshes (`web/src/components/shell.tsx:274`).
7. **Restart**: at boot `designRunner.recover()` settles every version still `making` as failed "Slopify stopped while this picture was being made. Press Try again." (`runner.ts:287-300`, `main.ts:841`); shutdown waits up to 60 s for calls already sent (`main.ts:206`, `:1157`).

### Fields, artwork and text (`fields.ts`, `artwork.ts`, `layout.ts`, `check-text.ts`)

8. **Fields** are the `{{names}}` in the picture prompt, the text blocks and the brochure, in the order they first appear; the person fills every one (`fields.ts:39-44`). A name Slopify keeps for videos (the reserved prefix or a filled keyword) is refused with a rename suggestion, a malformed `{{` is refused, and a schedule's date field that no text uses is refused (`fieldProblems`, `:52-78`). A field counts as filled only with something other than spaces; values are inserted verbatim and never read as fields (`:80-121`).
9. **Artwork request** (`artworkRequest`, `artwork.ts:26-67`): the prompt with its fields filled. With "Let the AI draw the text" (`aiText`) the text is spelled out word for word in the prompt and Slopify draws none; otherwise "Leave room for a title and details to be set over the picture; draw no text, letters or logos." One artwork serves every format: the provider shape every chosen format is closest to, or square when they pull different ways (`artworkAspect`, `frames.ts:25-31`). A design whose picture is the person's own ("picture") has no artwork to make.
10. **Text layout** (`layoutText`, `layout.ts:244-334`): the text blocks (a headline, subhead, details and small line, each with its font and colour; up to 8, 500 characters each) are placed in a safe area by preset (top title, bottom band, centered, left column) with an optional soft scrim or band behind them, as one ASS script. Lines are wrapped by the font's own advance widths (estimated when the font cannot be read) and shrunk by 8% steps until they fit, never below 2.4% of the short side; a number stays on one line with its unit or currency; a short word is never cut. Text is never dropped: a piece too full sets `overflow`.
11. **Checks before drawing** (`checkText`, `check-text.ts:23-72`): every letter of every block is in its font (else the sentence names the missing characters and says to choose or upload another font), every block's text appears exactly as typed in the laid-out lines, and the text fits at the smallest readable size ("The text doesn't fit on Poster A4, even at the smallest readable size. Shorten it or choose a placement with more room under Text.").

### Drawing and downloading (`render.ts`, `pdf-*.ts`)

12. **Render** (`createDesignRenderer`, `render.ts:71-250`), one at a time on a queue: the head version is cover-cropped around the format's focus point to the format's pixel frame (A4 2480x3508, A3 3508x4961, Flyer A5 1748x2480, Brochure cover A4, Square 1080x1080, Portrait 1080x1350, Story 1080x1920, Wide 1920x1080, `frames.ts:13-23`) and the text layer is set over it by libass in a child ffmpeg, never on the server's thread. The file is a cache under `<data dir>/design-renders/<design id>/<format>-<hash>.png`, named by a hash of the renderer version (2), the artwork, format, focus, filled text and fonts, so the same piece is drawn once; one drawing per format is kept (`dropOlderDrawings`); the cache is never backed up and is deleted with the design (`deleteRenders`, `:266-272`).
    - Screen formats (square, portrait, story, wide) download as PNG only; print formats (A4, A3, flyer, brochure) download as PDF, with the PNG also available except a brochure (`:204-215`).
    - **PDF**: a poster is the drawn PNG filling one page at its size, no bleed or crop marks (`pdf-pages.ts:12-21`); a brochure is the document theme's PDF with the designed cover on its title page and the brochure's pages from its title and markdown body (`:24-38`). Both are drawn by jsPDF in a forked worker (`pdf-runner.ts:10-82`), so the synchronous work never holds up the server: bytes travel over IPC, a cancel kills the worker, 5 minutes is the limit ("Making the PDF took longer than 5 minutes, so it was stopped. Press Download PDF again."). The worker accepts only the two job shapes (`pdf-job.ts:29-43`, `pdf-worker.ts`).
    - The file's name is the first non-empty headline with `-<format>` (`render-input.ts:79-93`).
    - `prepare` refuses with a sentence: no document ("This picture has no formats yet. Press Turn into a designed piece…"), the format not ticked, no artwork yet, or fields missing (`render-input.ts:23-77`).

### Design templates (`templates.ts`, `template-checks.ts`, `gate.ts`, `template-make.ts`)

13. **Versions.** A template is `design_templates` plus `design_template_revisions` (`0072-design-templates.sql`). Create makes version 1; a Save on the version it was made on becomes the next version, one made on an older version is refused 409 with the current template ("This template was saved in another tab or by an agent. Reload it to see that version, then make your change again."), and saving exactly what the head holds is a no-op (`templates.ts:474-557`). A version is `unchecked` until Mark ready passes. Schedules and "Make" without a version use these: a schedule makes from the newest version marked ready, never an unchecked one (`runnableDesignVersion`, `gate.ts:26-44`).
14. **Sections and samples.** The studio has four sections: Picture, Text layout, Formats and Schedule (`sections.ts:8-26`). A Save is compared with the version before it; only a changed Picture section (or a changed sample value its prompt uses) costs money, because the sample's one paid step is the artwork (`designAffectedSections`, `sampleNeedsPicture`, `:30-56`). The page shows the cost on Save only then ("Save · $0.04"), and "Save without a sample" saves only.
15. **The editor's sample** (`createDesignSamples`, `sample.ts:84-305`): one job per template (`design_template_samples`, states queued, making, done, failed, held). After a Save that changes the picture the sample is queued; a Save that changes only text, formats or the schedule redraws the same artwork for free and at once (`redraw`, `:230-244`). A newer Save replaces a queued job and never stops a picture being made (the newer job waits). The sample is a hidden design (`sample_of`) made from the template with the sample values (`makeFromTemplate`). A sample is **held**, without spending, and says why, when its picture runs on a CLI plan and samples may not use plans (Settings → Template studio → Samples may use my CLI plans), when any price is unknown, when it now costs more than the price the person saw (x1.25 plus $0.05), or when it would take today's sample spending over the daily budget counting what other samples queued or making will cost (`holdOf`, `:117-136`). Make sample then starts it on the person's say at the price shown (`request`, `:259-280`). Earlier samples of a template are kept until the day they were made is over, so today's spend still counts them, then removed with their renders (`sweep`, `oldSamples`). At boot `designSamples.recover()` settles what stopped and starts what waits (`main.ts:861`).
16. **Daily budget**: `designs.dailySampleBudget`, in dollars, default $1, 0-1000 (`slices/designs/budget.ts:10-22`). It counts what design samples cost since local midnight (`sampleSpentToday`, `sample-repo.ts`). It is set in Settings → Template studio → Designed pieces: daily sample budget, beside the project templates' Daily sample budget (default $2), through the same `GET`/`PUT /api/template-studio/settings` (`designDailyBudget`, each field left out kept; the answer's `designToday` says what was spent and is left, `designBudgetRoom`, `budget.ts`), and so through the MCP tools `get_template_studio_settings` and `update_template_studio_settings`, which the in-app assistant asks the person before calling (`slices/template-studio/budget.ts`, `edge/http/template-studio.ts`, `packages/web/src/template-studio/settings-panel.tsx`). The same page's Samples may use my CLI plans switch decides design samples' plan steps (`main.ts:858`, `holdOf`).
17. **Mark ready** (`markTemplateReady`, `templates.ts:561-607`): the version's checks run and are kept; it is marked only when all pass, else 409 `not-ready` with the failed checks' own sentences. The free checks are fields written as `{{Name}}`, a sample value for every field, and dates written YYYY-MM-DD (`template-checks.ts:198-233`). `main.ts` adds the ones that need this computer (`gate.ts:53-153`): the image provider is ready (a keyed provider has its key, a CLI is installed) or the template's own picture is saved with it; the schedule's date field is used; the fonts have every letter of the sample values (unless the AI draws the text); the sample values fit on every format. And the version's own sample, made (`sampleCheck`, `:157-173`): "Version N has no sample yet. Make its sample, look it over beside the settings, then press Mark ready." After a Save or Mark ready, active design schedules of the template recompute their next run (`refreshDesignSchedules`, `slices/schedules/next-run.ts:67-99`, `main.ts` `templateChanged`).
18. **Make a piece** (`makeFromTemplate`, `template-make.ts:310-396`): checks the version's fields and values, the price against `acknowledgedHigh`, creates a design with the template's settings and these values (its id derived from the request id so a repeat finds it), records the template, version, schedule and run on it, and starts the artwork (the only paid step). A template that keeps its own picture makes no paid call and the piece is ready at once. Quote: `POST /api/design-templates/:id/quote` with no body prices one piece from the newest version; with `{document}` it prices what saving that document would cost the sample and names the sections it changes (`edge/http/design-templates.ts:152-185`).

### Design schedules (`slices/schedules/by-date.ts`, `design-check.ts`, `design-run.ts`, `next-run.ts`, `design-agenda.ts`)

19. **What it is.** A schedule with `template_kind = 'design'` has the cadence `by-date` (`time` only) and a table of rows `{title, values}` instead of topics; `schedule_runs.design_ids_json` lists the designs a run made (`0073-schedule-design-kind.sql`). A schedule cannot switch between making videos and making designed pieces (`slices/schedules/service.ts:120`).
20. **Save checks** (`checkDesign`, `design-check.ts:14-64`): the cadence is by-date, topic generation is off, there is no topic keyword and no release days ("A design schedule makes each row's piece ahead of its date: it has no cadence, topic generation or release days. Choose Ahead of each date."); the template has a date field set in its Schedule section; no row or every-row value names a field the template does not use; and every row has a real date in the date field, written YYYY-MM-DD. Up to five problems are listed, then "And N more like these."
21. **When.** Each row's piece is made `daysBefore` days (0-90) before its date at `time` in the schedule's time zone; a row whose day to make it has passed while its date is still to come is made at once; a row whose date is over is due at once too, so the scheduler can skip it and say so (`designOccurrences`, `by-date.ts:33-63`). The schedule's `next_run_at` is the soonest (`nextRunOf`, `next-run.ts:48-63`); a design schedule with no row still to come stays active and waits for rows (`service.ts:164`). The calendar lists one run per row still to make, named by the row's title; a row whose date is over is not shown (`upcomingDesignRuns`, `design-agenda.ts:8-50`).
22. **A due run** (`claimDesignRun`, `design-run.ts:24-155`), in one transaction, never reaching `execute` and never waiting on a provider: it takes the row due soonest and, in order:
    - date over → removes the row and records a skipped run "Skipped: <row> on <date> is already over.";
    - missed (Slopify closed, more than 60 s late) with Missed run "Skip" → a skipped run that says to try again at the same time tomorrow or set Run once when Slopify reopens; the row stays;
    - no ready version → a skipped run "Not started: <template> has no version marked ready. Open it in Library → Designs → Templates and press Mark ready."; a missing field value → a failed run naming the fields; a price over the schedule's spend limit, or an unknown price while a limit is set → a failed run;
    - otherwise makes the piece (`makeFromTemplate` with the ready version, name = the row's title, values = the row), records a succeeded run with the design id and the quote, and removes the row.
    A run that cannot start keeps its row and tries again at the same time next day; marking a version ready tries again at once. None of this reaches needs_attention: it shows on the schedule's runs. The finished pieces are ordinary designs to download.

## Branches

- **Edit versus designed piece**: an edit has no document; saving one turns it into a designed piece. A designed piece's picture is either "Made by the AI" (artwork made once, paid) or its own picture (an upload or an edit's result, or a template's saved picture) which is free.
- **aiText**: on, the AI draws the text into the artwork and Slopify's text layer, the font checks and the text-fit check are off (a warning on the page, `design-panels.tsx:24`); off, Slopify draws the text.
- **Formats**: one to eight; a brochure needs its title and pages (`brochure` document key) or the settings are refused "A brochure needs its pages…".
- **Project link**: a design made inside a project's Designs panel carries the project; "Keep in project" links or unlinks later; a deleted project only clears the link.
- **Cost knowledge**: a known price, a range (edits), a price on a CLI plan ($0), or unknown (the button says so and needs the person to accept it).

## Unhappy paths

- Not a PNG or JPEG, or over 10 MB → 400 "This file is not a PNG or JPEG picture Slopify can read. Upload a PNG or JPEG file." / "This picture is larger than 10 MB. Save it smaller (for example as a JPEG) and upload it again." (`slices/designs/pictures.ts:122-139`, `edge/http/designs.ts:99-117`).
- Unknown design → 404 "This design no longer exists. Open Library → Designs to choose another."; a stale `baseUpdatedAt` → 409 "This design changed in another tab or by an agent. Reload it to see the change, then make yours again." with the current design; a reused request id → 409.
- A version to edit that is still making or failed → 409 "The version to edit has no picture yet. Wait for it to finish, or continue from another version."; Try again on a version that did not fail → 409 "This version didn't fail, so there is nothing to try again."
- The price rose, or became unknown → 409 with the new quote (`reason: cost-changed`).
- An edit whose source picture is no longer kept settles failed "The version this edit starts from is no longer kept. Continue from another version, then press Edit."; a provider answer that is not a usable picture settles failed "The provider answered with something that is not a usable PNG or JPEG picture."
- A font the block chose is gone, a letter missing from a font, text that does not fit, or text not placeable exactly as typed → the render is refused with the sentence naming the block and the fix (Step 11).
- The PDF worker times out, is cancelled, dies or answers with something unreadable → the download fails with that sentence.
- A template Save on an older version → 409 with the current template; Mark ready with failing checks → 409 listing them; a design schedule that cannot save → 400 with up to five problems (Step 20).
- Designs unavailable (the dependencies absent) → 503 "Designs aren't available in this copy of Slopify. Restart Slopify; if it keeps happening, reinstall it." (`edge/http/designs.ts:77-82`).
- Statuses by refusal reason: `edge/http/designs.ts:42-57`.

## State transitions

- Design version: `making` → `ready` | `failed`; `failed` → `making` (Try again); a restart settles `making` → `failed`.
- Design: live → trashed (`deleted_at`) → live (Restore) or removed after 30 days with its versions (cascade) and every drawn file; the pictures stay in `image_blobs` (`slices/trash/designs.ts:10-80`).
- Design template version: `unchecked` → `ready` (Mark ready, never back); template: live → trashed → live or removed with its hidden samples (`trash/designs.ts:68-80`).
- Template sample: queued → making → done | failed; queued → held → queued (Make sample).
- Design schedule row: waiting → made (row removed, run succeeded) | skipped (date over, row removed) | kept (run skipped or failed, same time tomorrow).

## Invariants

- A paid step starts only on the price the person saw or accepted; a quote records nothing and starts nothing.
- A design's calls are metered on the design (`standalone_usage.owner_kind = 'design'`) under the design's channel, so Home's This week counts them; a template's samples are the designs with `sample_of` and are what the daily budget sums.
- A schedule makes only from a version marked ready; editing a template never changes what a schedule makes until the new version passes its checks.
- Text is never dropped or changed by the layout; a piece is drawn only when every letter is in its font and the text fits.
- Server threads never run the drawing or the PDF: ffmpeg runs as a child process and jsPDF in a forked worker.
- The render cache is not backed up and is rebuilt on demand; designs, versions, pictures, templates, revisions and sample records are backed up (`slices/storage/backup-format.ts:115-120`).
- A design schedule creates no project, no video and no upload; it is never part of Home's autopilot forecast (51-autopilot-health-and-topic-scoring.md).

## Outcomes & side effects

- Tables: `designs`, `design_steps` (`0070-designs.sql`); `standalone_usage` widened to the owner kind `design` (`0071-design-usage.sql`); `design_templates`, `design_template_revisions`, `design_template_samples` (`0072-design-templates.sql`); `schedules.template_kind` and `schedule_runs.design_ids_json` (`0073-schedule-design-kind.sql`).
- Files: renders under `<data dir>/design-renders/<design id>/`; the PDF worker is a forked child.
- Events: `design.changed {designId}` and `design-template.sample {templateId}` on the global stream; the page refreshes its designs or templates (`web/src/events.ts:103-104`, `:172`, `web/src/components/shell.tsx:274`).
- Agents: 23 tools in `edge/mcp/tools-designs.ts`, the routes themselves called as the agent; every paid tool takes the quote's `acknowledgedHigh`; deleting asks for confirmation; marking a template ready says schedules start making pieces from it.
- Boot and shutdown: `designRunner.recover()`, `designSamples.recover()` and the PDF/ffmpeg children (`main.ts:824-863`, `:1157`).

## Recorded differences from the feature spec

- No feature spec was groomed; the intent is in `changelog.d/2026-10-18-template-studio.md` and `2026-10-18-studio-fixes.md`.
- The Template studio changelog's "Daily sample budget ($2.00 by default)" is the project templates' budget; design samples have their own `designs.dailySampleBudget`, default $1, set in Settings → Template studio → Designed pieces: daily sample budget.
- `slices/designs/studio-kind.ts` describes a seam for the project Template studio and design templates to share; the design template editor uses its own sections and checks directly today, and project and design templates are separate lists (Library → Templates shows both).
- A sample is held for "Samples may use my CLI plans" only for the artwork on a CLI plan; the user-set daily budget never applies to the person's own press of Make sample, which starts it at the price shown.

## Dimensions not in play

- D1 Authority: one local user; agents act through the same routes as the person, recorded "by agent" (45-mcp-agent-access.md).
- D5 Money: the artwork and picture edits are paid (Step 4); samples have a daily budget; schedules respect their own spend limit.
- D7 Time: a design schedule makes a piece ahead of a date, at a time of day, in the schedule's time zone.
- D13 Notification: none of its own; no run notice for a design.
- D15 Record: every version of a design's picture is kept until the design is removed; renders are a cache.
