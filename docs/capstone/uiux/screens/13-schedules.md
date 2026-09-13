---
generated_at_commit: 7bdb84e3f57e
generated_date: '2026-09-13'
capstone_version: 5.2.0
content_hash: f5f52c3eb762
paths_covered:
  - :(top)packages/web/src/routes/schedules.tsx
  - :(top)packages/web/src/schedules/**
  - :(top)packages/web/src/router.tsx
---

# Schedules

## Mode & job

Operate surface at `/schedules` for binding an immutable saved-template version to a local one-off, daily or weekly cadence. It creates no work during form entry; the local scheduler creates future projects while Slopify is running (`packages/web/src/router.tsx:61-65`, `packages/web/src/routes/schedules.tsx:68-84`, `packages/web/src/routes/schedules.tsx:215-365`).

## Composition

The 1200 px page begins with a CalendarClock glyph, title and a short local-execution explanation. A bordered New schedule panel uses two columns from the medium breakpoint and one column below it. Fields cover name, template version, cadence, date/time or weekdays, IANA timezone, missed-run policy, optional whole-cent spend ceiling and up to 49 keyword variants. Create uses Save schedule; Edit reuses the same form with Save changes and Cancel editing (`packages/web/src/routes/schedules.tsx:66-126`, `packages/web/src/routes/schedules.tsx:215-365`).

Saved schedules follow as stacked bordered panels. Each shows name, cadence, timezone, variant count, next local occurrence and status. Contextual actions expose Edit, Pause or Resume, confirmed Cancel, History and confirmed Delete when terminal. History is collapsed by default and expands in place (`packages/web/src/routes/schedules.tsx:370-505`).

## States

An empty template list links to Templates and disables saving. Form validation names missing template, empty weekly weekdays, invalid one-off time and invalid spend ceiling inline. Query/mutation failures retain form input and use alerts; uncertain transport outcomes expose Retry save with the same request identity; successful create/update uses a status sentence. No schedules yet teaches that the first schedule may be one-off or recurring (`packages/web/src/routes/schedules.tsx:80-126`, `packages/web/src/routes/schedules.tsx:163-207`).

Active schedules expose Pause; paused schedules expose Resume and Cancel. Canceled schedules have no future run and can be deleted. History loads only when opened, then renders loading, error, empty and run rows with outcome or refusal text (`packages/web/src/routes/schedules.tsx:402-505`).

## Motion

History opens and closes without authored animation. Mutation-pending state disables every schedule action and changes the form action to Saving…. Edit conflicts retain input and direct the user to reopen the latest version (`packages/web/src/routes/schedules.tsx:361-365`, `packages/web/src/routes/schedules.tsx:415-478`).

## Copy

Primary labels are Schedules, New schedule, Edit schedule, Save schedule and Save changes. Help text states that schedules pin the selected template version, exclude uploaded media, run only while Slopify is open and always include the base template run (`packages/web/src/routes/schedules.tsx:68-77`, `packages/web/src/routes/schedules.tsx:218-224`, `packages/web/src/routes/schedules.tsx:346-365`).

## Not in play

The screen has no template editor, project output viewer, calendar grid or remote worker status. Template creation lives at `/templates`; created project work appears on Projects (`packages/web/src/router.tsx:43-65`, `packages/web/src/routes/schedules.tsx:88-95`).
