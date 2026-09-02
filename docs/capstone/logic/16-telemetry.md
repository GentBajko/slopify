---
scenario: telemetry
mockup_row: S12
screens: [01-marketing-page, 02-first-run-notice, 08-project]
depends_on: [01-pipeline-lifecycle, 12-reruns-and-edits, 13-cancel, 14-storage-and-downloads]
implements: [Q119, Q127, Q128, Q129, Q130, Q131, Q132, Q133, Q134]
generated_date: 2026-09-02
capstone_version: 5.2.0
source: logic-interview.md
---

# 16 Telemetry

Anonymous usage events from every install, the local Usage page, and the marketing page's live aggregates. Rules cite `logic-interview.md §Q<n>` and the mockup interview for what it settled.

## Trigger & preconditions

- Triggers: dismissal of the first-run notice (install event); a project created; a stage completing (`done`); app start and each new event (delivery flush); a Usage page view; a marketing page view.
- Preconditions: a machine ID exists for every event except the install event that creates it (§Q127). No opt-out exists (mockup §Q26).
- Actor: none; the user only dismisses the notice (D1 not in play, §Q134).

## Steps

1. First run: the notice (`mockup/02-first-run-notice.md`) is shown when no machine ID exists; it lists exactly the counters of step 3 and the never-list of step 4; dismissing it creates a random UUID stored in the data directory and marks the machine seen (§Q127; mockup §Q26). No reset control; deleting the data directory makes a new install (§Q127).
2. Events: one install event; one event per project created; one event per stage completing: research, article, each intro/outro text, audio per segment (body, intro, outro), images, thumbnail, video (§Q130). Each event carries its own ID, the machine ID, the app version, and its counters (§Q129, §Q134).
3. Counters (§Q128, §Q131): tokens in and out as the provider reports them, 0 when unreported, with provider and model names, per stage; audio seconds from the measured duration per segment; images made (stored images) and thumbnails made; videos rendered (completed renders); projects created. Aborted calls count nothing (scenario 13 §Q112); regenerations count again (scenario 12); deleting a project changes nothing (§Q131).
4. Never in a payload: API keys, prompt bodies, keyword values, titles, article or research text, files, filenames, OS, locale, hardware (§Q128, §Q129).
5. Delivery: every event is appended to a local event log and queued; the queue is flushed to the collector on app start and after each new event; the queue is unbounded; delivery never blocks or fails a pipeline and never shows an error (§Q130). The collector deduplicates by event ID, so a re-sent event is never double-counted (§Q134).
6. Usage page (`for: uiux`, §Q119): this install's all-time totals per counter of step 3, computed from the local log, independent of delivery (§Q132). The log is kept forever (§Q134).
7. Marketing page (`mockup/01-marketing-page.md`): aggregate counters refreshed every 5 s; when the collector is unreachable, dashes with "live stats unavailable" (§Q133; mockup §Q27).

## Branches

- Machine ID present → events flow; absent → only the notice, then the install event (§Q127).
- Collector reachable → flush succeeds and the queue empties; unreachable → events stay queued (§Q130).

## Unhappy paths

- Collector unreachable for any length of time → silent queueing; no pipeline effect (§Q130).
- App killed with events queued → they remain in the local log and flush at next start (§Q130).
- Provider reports no token usage → 0 recorded, never estimated (§Q131).
- Event re-sent after an ambiguous failure → deduplicated by ID at the collector (§Q134).

## State transitions

- Machine: unseen → seen (notice dismissed, ID created) (§Q127).
- Event: logged → queued → delivered (§Q130).

## Invariants

- A payload never contains anything on the never-list (§Q128, §Q129).
- Telemetry never changes a pipeline outcome (§Q130).
- Usage page totals equal the sum of the local event log (§Q132).

## Outcomes & side effects

- Every install contributes to the marketing page's aggregates (mockup §Q25, §Q27).
- The local event log grows with use and is never pruned (§Q134).
- The collector service itself is `architecture`'s and `stack`'s.

## Dimensions not in play

- D1 authority: no actor beyond dismissing the notice (§Q134).
- D5 money: nothing charged (§Q134).
- D6 limits: unbounded queue and log (§Q134).
- D13 notification: nobody is told beyond the public aggregates (§Q134).
