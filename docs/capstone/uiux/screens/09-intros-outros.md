---
mockup: none (added by logic §Q90-§Q98; see mockup/README.md Amendments)
scenarios: [S15]
logic: [logic/15-prompt-management.md, logic/07-article-writing.md, logic/08-narration.md]
implements: [Q13, Q18]
assumed:
  - the whole screen, since no mockup exists; it mirrors 04 and 05 with a category and a mode
generated_date: 2026-09-02
capstone_version: 5.2.0
---

# 09 Intros and outros

## Mode & job

Operate. Job: keep a library of narrated openers and closers and open one to edit.

## Composition

Mirrors 04 Prompts: page title "Intros & Outros"; segmented switch Intro / Outro; "New entry" at right. Rundown table sorted by name: Name, Mode (an engraved chip: TEXT or LLM), Slots (chips), Edit, overflow with Duplicate and Delete. The editor mirrors 05 with Category (Intro / Outro) and Mode (Text / LLM) switches on the first row; under Mode a one-line hint: Text is narrated as written; LLM is an instruction whose answer is narrated (`logic/07` §Q97).

## States

- Empty: teaching row: "No intros yet. An intro is narrated before the body in the run's voice." (`logic/08` §Q93).
- Lint, collision, delete: as 04 and 05.
- Loading: skeleton rows.

## Motion

As 04 and 05.

## Copy

"New entry", "Intro", "Outro", "Text", "LLM", "Body"; hint sentences as above.
