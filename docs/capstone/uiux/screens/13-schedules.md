---
generated_at_commit: 7bdb84e3f57e
generated_date: '2026-09-25'
capstone_version: 5.2.0
content_hash: f5f52c3eb762
paths_covered:
  - :(top)packages/web/src/routes/library.tsx
  - :(top)packages/web/src/routes/schedules.tsx
  - :(top)packages/web/src/schedules/**
  - :(top)packages/web/src/router.tsx
---

# Schedules

## Mode & job

Operate surface, the Library's Schedules tab at `/schedules`, for binding an immutable saved-template version to a local one-off, daily or weekly cadence. It creates no work during form entry; the local scheduler creates future projects while Slopify is running (`packages/web/src/router.tsx`, `packages/web/src/routes/schedules.tsx`).

## Composition

The Library page bar and tab links sit above the tab. Its LibraryToolbar holds one line ("Runs a saved template on this machine at a local time.") with the schedule policy explanation behind an InfoTip, and New schedule at right. One StatusSlot follows for list and action errors (`packages/web/src/routes/schedules.tsx`).

Saved schedules are rows in one bordered list. Each row shows a lamp, the name, cadence · timezone · topics left (or Template as saved) · next run (or No future run), a fixed-width status word, the missed-run/overlap/spend policy behind an InfoTip, then Edit, History and a More menu holding Pause or Resume, Cancel and Delete. Items that do not apply are disabled, not removed. History expands in place under the row. Deleted schedules sit in a collapsed "Deleted schedules · N" disclosure; their rows keep History but show no Edit or More menu (`packages/web/src/routes/schedules.tsx`).

New schedule and Edit open the form in a Drawer titled New schedule or Edit schedule (`packages/web/src/schedules/form.tsx`). Fields cover name, template version, cadence, date/time or weekdays, IANA timezone (help behind an InfoTip), missed-run policy, optional whole-cent spend ceiling and an optional Topics box (help behind an InfoTip): one topic per line, an "Each topic fills" select listing the selected template's keywords (defaulting to the one the project title uses), one field per other keyword labelled "<keyword> (every run)" prefilled from the template, and a "Next project:" line showing the title the next run will get, with a note when the title does not use the chosen keyword. A sticky row at the drawer's bottom holds Save schedule / Save changes and Cancel / Cancel editing.

## States

An empty template list disables New schedule and the toolbar line links to Templates. Form validation names missing template, empty weekly weekdays, invalid one-off time and invalid spend ceiling inline. Query/mutation failures retain form input and use alerts; uncertain transport outcomes expose Retry save with the same request identity. Successful create/update is a toast and closes the drawer. No schedules yet teaches that the first schedule may be one-off or recurring (`packages/web/src/routes/schedules.tsx`, `packages/web/src/schedules/form.tsx`).

Active schedules enable Pause; paused schedules enable Resume; active or paused schedules enable Edit and Cancel; canceled or completed schedules enable Delete. Cancel and Delete open confirmations. History loads only when opened, then renders loading, error, empty and run rows with outcome or refusal text and project links (`packages/web/src/routes/schedules.tsx`).

## Motion

The drawer enters with the 150 ms tick-in; History opens and closes without authored animation. Mutation-pending state disables every schedule action and changes the form action to Saving…. Edit conflicts retain input and direct the user to reopen the latest version (`packages/web/src/routes/schedules.tsx`, `packages/web/src/schedules/form.tsx`).

## Copy

Primary labels are Schedules, New schedule, Edit schedule, Save schedule, Save changes, Edit, History, Pause, Resume, Cancel and Delete. Help text (behind InfoTips) states that schedules pin the selected template version, exclude uploaded media, run only while Slopify is open and always include the base template run (`packages/web/src/routes/schedules.tsx`, `packages/web/src/schedules/form.tsx`).

## Not in play

The screen has no template editor, project output viewer, calendar grid or remote worker status. Template creation lives on the Templates tab; created project work appears on Projects (`packages/web/src/router.tsx`, `packages/web/src/routes/schedules.tsx`).
