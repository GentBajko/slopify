---
mockup: mockup/04-prompts.md
scenarios: [S15]
logic: [logic/15-prompt-management.md, logic/03-placeholder-substitution.md]
implements: [Q13, Q18]
assumed: []
generated_date: 2026-09-02
capstone_version: 5.2.0
---

# 04 Prompts

## Mode & job

Operate. Job: find and open a prompt by kind.

## Composition

Page title "Prompts"; a segmented switch Article / Image / Thumbnail (Toggle Group) at left, "New prompt" at right as a `--panel2` button with a plus icon. Below, a rundown table sorted by name (`logic/15` §Q124): Name (Barlow 600), Slots (each `{{name}}` as a small engraved chip), Edit, and an overflow with Duplicate and Delete. Rows share borders.

## States

- Empty kind: a teaching row: "No article prompts yet. A prompt is text with {{keywords}}; each keyword becomes a field on Play." with "New prompt" repeated inline.
- Delete: confirmation dialog ("Projects that used it keep their text.") per `03-experience.md`.
- Deleting a prompt selected on an open Play tab: that selection clears when Play is next shown (`logic/15` §Q126).
- Loading: skeleton rows.
- Narrow: the Slots column collapses under the name.

## Motion

Switch marker slide 150 ms. Nothing else.

## Copy

"New prompt", "Edit", "Duplicate", "Delete"; kind names as on the switch.
