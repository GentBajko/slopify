---
mockup: mockup/05-prompt-editor.md
scenarios: [S1, S15]
logic: [logic/03-placeholder-substitution.md, logic/15-prompt-management.md]
implements: [Q13, Q15, Q18]
assumed: []
generated_date: 2026-09-02
capstone_version: 5.2.0
---

# 05 Prompt editor

## Mode & job

Operate. Job: write a template and see its slots before saving.

## Composition

Back link "< Prompts"; a two-column sheet at 1440 px: left, Name input and Kind segmented switch on one row, then the Body textarea in Barlow 14 px at a 75 ch measure, minimum 24 rows, resizable; right, sticky, a "Detected slots" panel listing every `{{name}}` as a chip in order of appearance, updating as the user types, and a lint list beneath. Footer row: Delete at left (secondary), Cancel and Save at right; Save is the only accent fill.

## States

- New: empty body, kind preselected from the tab that opened it; Save disabled until name and body are non-empty (`logic/15` §Q122).
- Editing: fields filled; Save enabled.
- Lint error: the offending `{{` is underlined in `--red` inside the textarea (a highlighted overlay behind the text), the lint list names it ("Unclosed slot at line 12"), Save disabled with a hint "Fix 1 slot error to save" (`logic/03` §Q20, §Q27).
- Name collision within kind: inline error under Name, Save disabled (`logic/15` §Q122).
- Body with no slots: the slots panel reads "No slots. This prompt runs as written."
- Delete: confirmation dialog.
- Saved: "Saved" tick, then navigate back to 04.

## Motion

Chips appear with a 150 ms fade as slots are typed; reduced motion cuts.

## Copy

Labels "Name", "Kind", "Body", "Detected slots"; buttons "Save", "Cancel", "Delete". Lint messages name the problem and the line.
