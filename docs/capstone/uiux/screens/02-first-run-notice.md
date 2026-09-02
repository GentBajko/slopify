---
mockup: mockup/02-first-run-notice.md
scenarios: [S12]
logic: [logic/16-telemetry.md]
implements: [Q4, Q13, Q18]
assumed: []
generated_date: 2026-09-02
capstone_version: 5.2.0
---

# 02 First-run notice

## Mode & job

Operate. Job: disclose the telemetry once, plainly, and get out of the way.

## Composition

A Dialog (Radix) over the Settings screen on the first launch, 480 px wide, `--panel`, 6 px radius, portal-rendered. Title "Anonymous usage stats" (Barlow 700, 18 px). Body: one sentence on why ("These numbers power the live counters on slopify.stream."), then the tracked list exactly as `logic/16` steps 3-4 define it, as a two-column engraved-label list (Tracked / Never tracked), then the app-version line. One button, "Got it", full width in the accent with `--accent-ink` text. No close icon, no secondary action (§Q18, notice has one action per mockup §Q26).

## States

- First launch on this machine: shown; dismissing creates the machine ID and lands on Settings with no key saved (`logic/16` §Q127; mockup assumption confirmed).
- Later launches: never shown.
- Keyboard: focus starts on "Got it"; Esc is disabled here since the notice must be acknowledged (`logic/16` §Q127).

## Motion

Dialog fade and 4 px rise, 200 ms; reduced motion cuts.

## Copy

Title "Anonymous usage stats"; button "Got it"; the tracked and never-tracked lists use the counters' own names; the sentence "Nothing you write, upload, or paste ever leaves your machine." closes the body.
