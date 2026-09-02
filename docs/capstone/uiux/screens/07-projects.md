---
mockup: mockup/07-projects.md
scenarios: [S9, S14]
logic: [logic/01-pipeline-lifecycle.md, logic/14-storage-and-downloads.md]
implements: [Q13, Q18]
assumed: []
generated_date: 2026-09-02
capstone_version: 5.2.0
---

# 07 Projects

## Mode & job

Operate. Job: see what is running and open a project.

## Composition

Page title "Projects", "New run" at right (accent outline, not fill). A rundown sheet: one row per project, newest first: lamp, title (Barlow 600), prompt name and format in `--ink2`, started time, the state word at right (RUNNING in run-text, DONE in done, FAILED in red, CANCELED in amber), and an overflow with Delete. Running rows carry the thin meter under the row averaging stage progress. Rows share borders; the sheet is the whole page.

## States

- Empty: a teaching row: "No projects yet. Set up a run on Play." with a link.
- Populated: as composed; the project status word derives per `logic/01` §Q9.
- Delete: confirmation dialog; disabled with the tooltip "Cancel the run first" while running (`logic/14` §Q117).
- Loading: skeleton rows.
- Narrow: prompt and time stack under the title.

## Motion

The running row's lamp pulses; the meter width transitions 250 ms. Nothing else.

## Copy

State words uppercase; "New run"; "Delete".
