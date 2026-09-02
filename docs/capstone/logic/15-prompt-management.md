---
scenario: prompt-management
mockup_row: S15
screens: [04-prompts, 05-prompt-editor, 06-play, 08-project]
depends_on: [03-placeholder-substitution, 04-run-admission]
implements: [Q91, Q98, Q121, Q122, Q123, Q124, Q125, Q126]
generated_date: 2026-09-02
capstone_version: 5.2.0
source: logic-interview.md
---

# 15 Prompt management

Creating, editing, duplicating, and deleting prompts and intro/outro entries, and how none of it reaches existing projects. Rules cite `logic-interview.md §Q<n>`.

## Trigger & preconditions

- Trigger: New, Edit, Save, Cancel, Duplicate, Delete on `mockup/04-prompts.md` and `05-prompt-editor.md`, and the same actions on the intro/outro library (§Q91, §Q121).
- Preconditions: none.
- Actor: the single local user (D1 not in play, §Q126).

## Steps

1. Entities: prompts of kind article, image, thumbnail (mockup §Q6, §Q13); intro/outro entries with a category (intro or outro) and a mode (Text or LLM) (§Q98). One rule set for all (§Q121).
2. Save: name required and unique within its kind or category, compared case-insensitively; body required, non-empty; Save blocked while a lint error exists (scenario 03 §Q20); kind or category may be changed after creation (§Q122). A save overwrites; no version history (§Q125).
3. Duplicate: a copy named "<name> copy" (§Q124); if that name exists, the user renames before saving (follows the uniqueness rule).
4. Delete: removes the template. Existing projects keep their stored rendered text (scenario 03 §Q25) and show the stored name marked "(deleted)" in the project header (§Q123). A prompt selected on an open Play form is deselected and its fields disappear (assumed; scenario 04 rebuilds from saved bodies at click).
5. Lists on 04 and the pickers on Play sort by name (§Q124).

## Branches

- Name collides within kind → Save refused with the field marked (§Q122).
- Prompt used by projects → deletable anyway; projects unaffected (§Q123).

## Unhappy paths

- Empty body or malformed slots → Save blocked (§Q122; scenario 03).
- Deleting a prompt picked on Play → selection cleared (step 4).
- Local write failure → error shown, nothing saved (scenario 14 §Q118).

## State transitions

- Template: absent → present (create or duplicate) → present (edit) → absent (delete).

## Invariants

- Names are unique per kind or category (§Q122).
- A project never references a live template; it holds its own rendered text (§Q123; scenario 03 §Q25).
- Deleting a template never changes any project's outputs (§Q123).

## Outcomes & side effects

- Templates persist locally (scenario 14's data directory; SQLite per scenario 02 §Q17).
- Play pickers reflect the current template set at page load and at click (scenario 04 §Q34).

## Dimensions not in play

- D1 authority: one local actor (§Q126).
- D4 computation: nothing computed (§Q126).
- D5 money: nothing charged (§Q126).
- D6 limits: no cap on template count (§Q126).
- D7 time: nothing expires (§Q126).
- D8 concurrency: single user, one editor at a time (§Q126).
- D10 external failure: no external call (§Q126).
- D11 termination: saves are single atomic steps (§Q126).
- D13 notification: no channel (§Q126).
