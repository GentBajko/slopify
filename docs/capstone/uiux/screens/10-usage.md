---
mockup: none (added by logic §Q119; see mockup/README.md Amendments)
scenarios: [S12]
logic: [logic/16-telemetry.md]
implements: [Q13, Q15, Q18]
assumed:
  - the whole screen, since no mockup exists
  - the per-stage token table beneath the totals
generated_date: 2026-09-02
capstone_version: 5.2.0
---

# 10 Usage

## Mode & job

Operate. Job: show this install's own numbers, the same ones the marketing page aggregates.

## Composition

Page title "Usage" with the line "This machine only. The same counters, anonymised, feed slopify.stream." The tally board from 01, reused: five counters (videos made, audio hours, images made, tokens used, projects) in tabular Barlow 700 at 32 px with engraved labels, on a `--panel` sheet. Beneath, a rundown table "Tokens by stage": Stage, Provider · model, Tokens in, Tokens out, sorted by tokens out (`logic/16` §Q128, §Q132). Machine ID shown as a small engraved line at the bottom with the app version.

## States

- Fresh install: counters at 0 with the teaching line "Numbers appear after your first run."
- Populated: as composed; totals equal the sum of the local event log (`logic/16` §Q132).
- Loading: skeleton board and rows.

## Motion

None beyond the shared 150 ms fades.

## Copy

Counter labels as on the marketing page; "Tokens by stage"; "Machine ID".
