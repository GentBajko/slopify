---
scenario: telemetry
mockup_row: S12
screens: [01-marketing-page, 02-first-run-notice, 08-project]
depends_on: [01-pipeline-lifecycle, 12-reruns-and-edits, 13-cancel, 14-storage-and-downloads]
generated_date: 2026-09-02
capstone_version: 5.2.0
---

# 16 Telemetry

Anonymous usage events from every install, the local Usage page, and the marketing page's live aggregates.

## Trigger & preconditions

- Triggers: dismissal of the first-run notice (install event); a project created; a stage completing (`done`); app start and each new event (delivery flush); a Usage page view; a marketing page view.
- Preconditions: a machine ID exists for every event except the install event that creates it. No opt-out exists.
- Actor: none; the user only dismisses the notice.

## Steps

1. First run: the notice (`mockup/02-first-run-notice.md`) is shown when no machine ID exists; it lists exactly the counters of step 3 and the never-list of step 4; dismissing it creates a random UUID stored in the data directory and marks the machine seen. No reset control; deleting the data directory makes a new install.
2. Events: one install event; one event per project created; one event per stage completing: research, article, each intro/outro text, audio per segment (body, intro, outro), images, thumbnail, video. Each event carries its own ID, the machine ID, the app version, and its counters.
3. Counters: tokens in and out as the provider reports them, 0 when unreported, with provider and model names, per stage; audio seconds from the measured duration per segment; images made (stored images) and thumbnails made; videos rendered (completed renders); projects created. Aborted calls count nothing (scenario 13); regenerations count again (scenario 12); deleting a project changes nothing.
4. Never in a payload: API keys, prompt bodies, keyword values, titles, article or research text, files, filenames, OS, locale, hardware.
5. Delivery: every event is appended to a local event log and queued; the queue is flushed to the collector on app start and after each new event; the queue is unbounded; delivery never blocks or fails a pipeline and never shows an error. The collector deduplicates by event ID, so a re-sent event is never double-counted.
6. Usage page (`for: uiux`): this install's all-time totals per counter of step 3, computed from the local log, independent of delivery. The log is kept forever.
7. Marketing page (`mockup/01-marketing-page.md`): aggregate counters refreshed every 5 s; when the collector is unreachable, dashes with "live stats unavailable".

## Branches

- Machine ID present → events flow; absent → only the notice, then the install event.
- Collector reachable → flush succeeds and the queue empties; unreachable → events stay queued.

## Unhappy paths

- Collector unreachable for any length of time → silent queueing; no pipeline effect.
- App killed with events queued → they remain in the local log and flush at next start.
- Provider reports no token usage → 0 recorded, never estimated.
- Event re-sent after an ambiguous failure → deduplicated by ID at the collector.

## State transitions

- Machine: unseen → seen (notice dismissed, ID created).
- Event: logged → queued → delivered.

## Invariants

- A payload never contains anything on the never-list.
- Telemetry never changes a pipeline outcome.
- Usage page totals equal the sum of the local event log.

## Outcomes & side effects

- Every install contributes to the marketing page's aggregates.
- The local event log grows with use and is never pruned.
- The collector service itself is `architecture`'s and `stack`'s.

## Dimensions not in play

- D1 authority: no actor beyond dismissing the notice.
- D5 money: nothing charged.
- D6 limits: unbounded queue and log.
- D13 notification: nobody is told beyond the public aggregates.
