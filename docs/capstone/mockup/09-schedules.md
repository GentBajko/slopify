---
absorbed_from:
  - features/2026-09-13-scheduled-jobs@2026-09-13
screen: schedules
journeys:
  - J8-unattended-runs
generated_date: '2026-09-13'
generated_at_commit: 7bdb84e3f57e
capstone_version: 5.2.0
paths_covered:
  - :(top)packages/app/src/slices/schedules/**
  - :(top)packages/app/src/main.ts
  - :(top)packages/app/src/edge/http/schedules.ts
  - :(top)packages/web/src/routes/schedules.tsx
  - :(top)packages/web/src/schedules/**
content_hash: 3472462e3d97
---

# 09 Schedules

`rule: logic (S25-scheduled-jobs)`

Schedules is the local control room for one-off and recurring project creation from immutable template revisions.

## Layout

```text
Slopify navigation

Schedules
Run a saved template while Slopify is open.

┌ New schedule ────────────────────────────────────────────────┐
│ Name                 Template                               │
│ Cadence / date       Time / weekdays                        │
│ Timezone             Missed run policy                      │
│ Spend ceiling        Keyword variants                       │
│                                             [Save schedule] │
└──────────────────────────────────────────────────────────────┘

Saved schedules
┌ Name · status · recurrence · next occurrence ───────────────┐
│ [Pause/Resume] [Cancel] [History] [Delete when available]   │
│   occurrence · status · project links/reason                │
└──────────────────────────────────────────────────────────────┘
```

A list of schedules sits beside a detail pane, which shows the picked schedule with its run history or, when opened, the creation form. Each row keeps its controls with the saved schedule identity (`packages/web/src/schedules/view.tsx:262-335`, `packages/web/src/schedules/schedule-row.tsx:34-155`, `packages/web/src/schedules/schedule-detail.tsx:146-153`).

## Elements

| Element | Action and destination |
|---|---|
| Name / Template | Names the schedule and selects an existing template head/version |
| Once / Daily / Weekly | Reveals a date-time, daily local time, or local time plus weekday choices |
| Timezone | Chooses the wall-clock timezone used for recurrence |
| Missed run | Chooses Skip or Run once |
| Spend ceiling in cents | Optionally limits estimated admission cost |
| Keyword variants | Parses one `Title | key=value` variant per line, up to 49 |
| Save schedule | Persists the schedule; it does not run immediately |
| Pause / Resume / Cancel | Changes schedule lifecycle state |
| History | Expands retained occurrence status, timestamps, project links and failure reason |
| Delete | Removes a completed or canceled schedule from the displayed list |

The form validates the selected template, weekly day selection and spend ceiling (typed in US dollars, stored as cents) before sending its create request (`packages/web/src/schedules/form.tsx:176-194`, `:222-226`).

## States

- **No templates:** a link sends the user to Templates before schedule creation.
- **Empty:** the saved-schedule rail explains that the first job may be one-off or recurring.
- **Active:** the card shows next occurrence and Pause/Cancel/History.
- **Paused:** the card retains its next occurrence and exposes Resume/Cancel/History.
- **Completed/canceled:** no future occurrence is active and Delete is available.
- **Loading/error/saved:** the screen shows local query status, an inline error, or “Schedule saved” status.
- **History running/succeeded/failed/skipped:** each occurrence shows its admission result; succeeded means project admission succeeded, and linked projects may still be generating.

The list refreshes every 30 seconds, while the local server checks due schedules every 15 seconds and once at startup (`packages/web/src/schedules/api.ts:64`, `packages/app/src/main.ts:981-983`, `:998`).
