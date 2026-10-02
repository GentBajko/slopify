---
generated_at_commit: e9226a34aa8a
generated_date: 2026-10-02
capstone_version: 7.0.1
content_hash: 4b2ad23edee0
paths_covered:
  - ":(top)packages/web/src/routes/calendar.tsx"
  - ":(top)packages/web/src/calendar/**"
  - ":(top)packages/web/src/schedules/**"
  - ":(top)packages/web/src/router.tsx"
---

# Calendar and schedules

## Mode & job

Operate surface at `/calendar`, a top-level destination with two tabs: **Coming weeks** (the next four weeks of scheduled runs, projects and the batch queue, with drag-to-reschedule and held topic suggestions) and **Schedules** (every schedule as a list beside the picked one's detail, and the create/edit form) (`packages/web/src/routes/calendar.tsx:56-66`, `calendar.tsx:82-99`). Only the Schedules tab and the picked schedule are in the URL: `/calendar?tab=schedules&schedule=<id>`; schedule IDs must match `^[0-9A-Za-z-]{1,64}$` (`packages/web/src/router.tsx:160-181`, `router.tsx:203-228`). The old `/schedules` and `/schedules/$scheduleId` addresses redirect there with `replace` (`router.tsx:183-201`). There is no `routes/schedules.tsx`. Saving a schedule creates no project; the local scheduler starts runs while Slopify is open (`packages/web/src/schedules/view.tsx:314-320`).

## Composition

**Page frame.** `data-tour="calendar"` wrapper (tutorial step 25) (`calendar.tsx:255`). Kit `PageHeader` titled "Calendar" with meta `<channel or "Every channel"> · N scheduled runs in the next 4 weeks · N topics queued`; on the weeks tab its actions are a kit `Segmented` "Calendar view" (Weeks / List) and the primary "Add to calendar" button (`calendar.tsx:256-279`). Kit `Tabs` "Coming weeks" / "Schedules", the latter badged with the count of undeleted schedules (`calendar.tsx:280-294`). The weeks tab filters runs and projects to the current sidebar channel via `useCurrentChannel` and the template/project channel maps (`calendar.tsx:102`, `calendar.tsx:120-142`).

**Coming weeks tab** (`calendar.tsx:298-422`), top to bottom:

1. Kit `StatusSlot` for move results and load errors (`calendar.tsx:299-304`).
2. Kit `Board split="aside"`: left `BoardColumn` "Needs you" (projects with `needs` set, then those ready to upload, as `ListRow`s with a state `Status` and an action: `PrepareUpload` for ready videos, else a secondary `ButtonLink` "Open to fix" / "Open to continue" / "Open to review"); right `BoardColumn as="aside"` "Suggested topics" (`calendar.tsx:305-323`, `calendar.tsx:651-681`, `packages/web/src/calendar/attention.ts:29-77`).
3. Full-width "Coming weeks" section. **Weeks view**: a hint line, then one `.sl-cal-week` grid per week, seven `DayCell`s each (`calendar.tsx:324-360`). A day is a `section` labelled with the full date; kicker "Today · Wed 30" or "Wed 30"; its `RunChip`s; its first three projects (link + `Status`) and a quiet "+N more" / "Show fewer" toggle (`calendar.tsx:428-527`). A `RunChip` is an `article` showing time, topic title (non-bold ink-2 when the run has no queued topic), schedule name and a `Status`: "Paused", "Needs a topic" (held source), "Prepared" (info; a project already made for the topic) or "Queued", then `PrepareRun` in its compact form (`calendar.tsx:529-590`). `PrepareRun` (`calendar.tsx:593-651`): for a prepared run, a quiet small `ButtonLink` "Open" (list: "Open prepared") to that project; for a queued topic, a small "Prepare" button (quiet on chips, secondary in the list; "Preparing…" while pending; its click does not start a drag) that asks the schedule to make the topic's project now, running everything but the video, which renders on its day (`packages/web/src/schedules/api.ts:150-160`); a failure shows a `role="alert"` danger label beside it; success refreshes the calendar and projects. **List view**: hint line with InfoTip, then per day an `h3` `SectionHead` and a `List` of run rows (meta `time · schedule · template · Paused`) with `PrepareRun`, small icon buttons "Move <title> earlier/later" and a "Move to…" select of other live schedules, followed by that day's project rows (`calendar.tsx:683-786`).
4. "Batch queue" section when projects wait in the queue: rows link to the project, meta "N in line", and a `Status` "Paused" / "Running now" / "Waiting its turn" (`calendar.tsx:381-420`).

Layout: `.sl-cal-week` is a seven-column grid on `--color-surface` with `--radius-media` and a `--color-line` border; days have 150px min height; today tints `--color-accent-tint`; a drag-over day gets a 2px dashed `--color-focus` outline; movable chips show a grab cursor; below 1180px weeks stack to one column (`packages/web/src/styles/shell.css:785-849`).

**Suggested topics aside** (`packages/web/src/calendar/suggestions.tsx`). One block per live schedule whose topic generation is not off (`suggestions.tsx:36-41`). Each: `SectionHead` ("Suggested topics" with the schedule as kicker for the first, the schedule name after), meta "From the series brief · not made or queued before", and either secondary "Queue all N" or an InfoTip plus quiet "Suggest topics now" (`suggestions.tsx:113-138`); a danger `TopicFailure` callout with fix-it actions when the last generation failed (`suggestions.tsx:139-146`, `packages/web/src/schedules/topic-failure.tsx:22-50`); rows with the topic, its keyword values line, quiet "Queue" and an X icon "Reject <title>" (`suggestions.tsx:159-189`); a `Callout` "Keeps at least N topics queued." stating hold or queue behaviour (`suggestions.tsx:190-196`).

**Add to calendar dialog** (`packages/web/src/calendar/add-topics.tsx:91-156`). Kit `Dialog` with a "Schedule" select (`<name> · N queued`, live active/paused schedules) and a "Topics, one per line" textarea; footer secondary "Keep the calendar as it is" and primary "Add N topics". Lines append to the end of that schedule's queue via a full `updateSchedule` with `baseVersion` (`add-topics.tsx:43-63`).

**Schedules tab** (`packages/web/src/schedules/view.tsx:177-370`). A toolbar line "Runs a saved template on this machine at a local time." with InfoTip, then a `ButtonRow` of an "All channels" / per-channel `Select` and primary "New schedule" (`view.tsx:179-224`). A `StatusSlot` (`view.tsx:225-227`). Kit `ListDetail` with a 320-460px list column at ≥768px (`view.tsx:228-230`):

- **List**: "Saved schedules" `ListRow`s, selectable. Title is the name; meta is a `Status` word (Active/Paused/Completed/Canceled/Deleted) then cadence ("One time", "Daily at HH:MM", "Weekly at HH:MM"), "Next: <date> · “<next project title>”" or "No future run", and "N waiting for you" when topics are held. Actions: quiet Edit, Pause or Resume, Delete. A `RetiredModelRow` follows each row (`view.tsx:249-267`, `view.tsx:373-503`). Deleted schedules sit in a `details` "Deleted schedules · N" with a Trash note; their rows have no actions (`view.tsx:268-293`).
- **Detail** (picked, else the first live schedule): `SectionHead` with status kicker, name, "N topics waiting for you" meta and quiet "Cancel schedule"; a two-column `dl` of When, Timezone, Next run, Topics, Missed runs, Overlap ("Skip"), Spend ceiling; `InlineTopics` for live schedules; `TopicGenerationPanel`; a `Rule`; "Run history" rows `<status> · <date>` with the error, "Project N" links or "No projects" (`view.tsx:505-647`).
- **Form** replaces the detail for New schedule / Edit, under a `SectionHead` "New schedule" or "Edit schedule" (`view.tsx:296-329`).

**Inline topics** (`packages/web/src/schedules/inline-topics.tsx:125-183`): `h3` "Queued topics · N" with meta "Each topic becomes the next project's title." or "Each topic fills {{kw}}; the next run takes the first."; rows with an inline title input (Enter saves, Escape reverts), move up/down and remove icon buttons; an add form with "New topic" input (max 200) and "Add topic" (`inline-topics.tsx:186-245`). Each change saves immediately with a success toast carrying Undo (`inline-topics.tsx:36-81`).

**Topic generation panel** (`packages/web/src/schedules/held-topics.tsx:43-274`, live schedules with generation on): `h3` "Topic generation" with a status meta ("Generating topics now…", "Topics last generated <date>.", "No topics generated yet.") plus "Keeps at least N queued[ or waiting]." and a "Generate topics now" button; the `TopicFailure` callout; a "That didn't work." danger callout for action errors. In hold mode, "Topics waiting · N" with primary "Approve all" and rows offering Approve, Edit (title input plus a field per other template keyword, placeholder = every-run value) and Reject.

**Schedule form** (`packages/web/src/schedules/form.tsx:249-422`): an error `Callout` "The schedule wasn't saved."; a two-column fieldset (≥700px) of Name, Template, Cadence (Every day / Selected weekdays / One time), Run at (`datetime-local`) or Local time (`time`), Weekdays checkboxes (weekly only), Timezone (placeholder "Europe/Tirane"), Missed run ("Skip if Slopify was closed" / "Run once when Slopify reopens"), "Spend ceiling (cents, optional)"; then `TopicFields` and `GenerationFields`; then a sticky footer (lifted 68px above the phone bottom nav) with primary Save and quiet Cancel. `TopicFields` (`packages/web/src/schedules/topic-queue.tsx:147-519`): legend "Topics (optional)", a `Segmented` "How to write the topics" (One per line / Table / YAML / JSON) that converts between modes, quiet "Copy as YAML" and "Export as YAML", then a textarea (lines, placeholder "Pyramids / Sphinxes / Obelisks"), a `sl-table` with a column per per-topic keyword, "Add topic" and "Set a keyword per topic…", or a YAML/JSON textarea; a danger callout "These topics can't be saved yet." listing up to 8 problems; "Project titles, in order:" preview up to 20; "Each topic fills" select and "<keyword> (every run)" fields. `GenerationFields` (`form.tsx:424-549`): legend "Topic generation", "Series brief (optional)" textarea, "New topics" select (Off: add topics yourself / Generate and queue directly / Generate and hold for approval), "Keep at least this many queued" (1-100), a "Use the template's LLM" checkbox, else Provider and Model.

## States

| State | Trigger | Treatment | Source |
|---|---|---|---|
| Calendar loading | Calendar query pending | "Loading the calendar…" | `calendar.tsx:326-327` |
| Load error | Calendar or schedules query fails | Error text in the weeks `StatusSlot` | `calendar.tsx:250`, `calendar.tsx:299-304` |
| Nothing needs you | No attention projects | "Nothing needs you right now." | `calendar.tsx:307-308` |
| List empty | No runs or projects in range | "Nothing is planned for the next 4 weeks…" with a Schedules tab link | `calendar.tsx:702-712` |
| Move refused | Drop on a run without a queued topic, a day without a run, or past the queue's end; Alt+arrow at either end | Error in `StatusSlot` naming the reason | `packages/web/src/calendar/plan.ts:93-125`, `calendar.tsx:193-206` |
| Moving | Move/transfer mutation pending | Chips not draggable; list buttons and select disabled | `calendar.tsx:346`, `calendar.tsx:544`, `calendar.tsx:741-759` |
| Prepare | Prepare pressed on a queued topic | "Preparing…" disabled; error label (`role="alert"`) with the server message or "This run has no topic to prepare yet."; then the run shows "Prepared" and "Open" | `calendar.tsx:603-650` |
| Moved / failed | Reply ok / not ok / thrown | "Moved." info; server message; "The topic wasn't moved: … Reload the calendar and try again." | `calendar.tsx:150-167` |
| No suggesting schedule | No live schedule with generation on | "No schedule suggests its own topics yet…" + "Open schedules" link | `suggestions.tsx:44-56` |
| Suggesting | `generatingSince` set | Button "Suggesting…", disabled with reason; "Slopify is asking for new topics…" | `suggestions.tsx:127-135`, `suggestions.tsx:152-156` |
| Suggestion action fails | Mutation not ok or throws | Error toast | `suggestions.tsx:85-99` |
| Add dialog, no schedule | No live schedule | "Topics go on a schedule, and there is none yet. Create a schedule first."; Add disabled "Create a schedule first." | `add-topics.tsx:104-130` |
| Add dialog conflict / error | Stale version / thrown | Field error; text kept | `add-topics.tsx:64-82` |
| No templates | Template list empty | Toolbar links "Library → Templates"; New schedule disabled with reason; the New schedule intent toasts an error | `view.tsx:130`, `view.tsx:151-162`, `view.tsx:181-188`, `view.tsx:210-219` |
| No schedules | Empty list | `EmptyState` "No schedules yet" / "No active schedules" / "No schedules run this channel's templates" with matching guidance | `view.tsx:232-248` |
| Row actions | Status-driven | Edit enabled for active/paused; Pause for active; Resume for paused; Delete for canceled/completed; all disabled while any action, form or save is open, each with a `disabledReason` | `view.tsx:423-500`, `view.tsx:176` |
| Cancel / Delete confirm | Detail's Cancel schedule; row Delete | `ConfirmDialog` "Cancel schedule?" / "Delete schedule?", consequence text, "Keep schedule" | `view.tsx:341-368` |
| History | Detail open | "Loading history…"; error "…It tries again every 30 seconds."; "No runs yet."; refetch every 30 s | `view.tsx:519-527`, `view.tsx:600-644` |
| Inline topic conflict / failure | Stale version / thrown | `role="alert"` text; list refreshed | `inline-topics.tsx:47-76` |
| Form validation | Missing template, topic problems, >queueMax, brief too long, half-set LLM, no weekday, bad timezone, bad spend | Callout text naming the fix | `form.tsx:145-196` |
| Form saving / uncertain | Request in flight / transport failed after building the request | Fieldset disabled; "Saving…"; "Retry save" resends the same request identity | `form.tsx:177-246`, `form.tsx:257-259`, `form.tsx:402-417` |
| Saved | Create/update ok | Toast "Schedule saved. It will run automatically while Slopify is open." or "Schedule updated."; form closes | `view.tsx:314-323` |

## Motion

Drag and drop uses native HTML5 events with `dropEffect = "move"` and a dashed outline on the day under the pointer (`calendar.tsx:459-475`, `calendar.tsx:562-570`). Keyboard move: focus a chip and press Alt+←/↑ or Alt+→/↓ (`calendar.tsx:546-555`). Day cells transition background over 120ms (`shell.css:801`). No other authored animation; the form replaces the detail in place and the weeks/list choice is remembered in `localStorage` under `slopify.calendar.view` (`calendar.tsx:72-80`, `calendar.tsx:207-215`).

## Copy

Primary labels: Calendar, Coming weeks, Schedules, Weeks, List, Add to calendar, Needs you, Suggested topics, Batch queue, New schedule, Edit schedule, Save schedule, Save changes, Cancel editing, Edit, Pause, Resume, Delete, Cancel schedule, Generate topics now, Approve all, Queue all N (`calendar.tsx:256-294`, `view.tsx:210-222`, `form.tsx:402-417`). Hints: "Drag a topic to another day to change when it runs, or onto another schedule's run to move it there. With the keyboard: focus a topic and press Alt+← or Alt+→." (`calendar.tsx:330-333`); "Move a topic earlier, later or to another schedule from its row." (`calendar.tsx:718-721`). Error copy states what failed and what to do next, e.g. "Pick both a provider and a model for topic generation, or choose Use the template's LLM." (`form.tsx:168-170`). Command palette entries: Add to calendar, Show the schedules, Show the calendar as weeks / as a list, New schedule, Pause/Resume schedule, Queue all suggested topics (`calendar.tsx:217-244`, `view.tsx:143-149`, `view.tsx:649-671`, `suggestions.tsx:102-109`).

## Not in play

No month or day view; the window is fixed at four weeks from this week's Monday for the life of the page (`calendar.tsx:56`, `calendar.tsx:103-104`). No template editing; templates are saved from a project (see `14-templates.md`). No remote worker status. Runs happen only while Slopify is running. Deleted schedules restore from Settings → Trash, not here (`view.tsx:273-276`).
