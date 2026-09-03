---
scenario: prompt-management
mockup_row: S15
screens: [04-prompts, 05-prompt-editor, 06-play, 08-project]
depends_on: [03-placeholder-substitution, 04-run-admission]
generated_date: 2026-09-02
capstone_version: 5.2.0
---

# 15 Prompt management

Creating, editing, duplicating, and deleting prompts and intro/outro entries, and how none of it reaches existing projects.

## Trigger & preconditions

- Trigger: New, Edit, Save, Cancel, Duplicate, Delete on `mockup/04-prompts.md` and `05-prompt-editor.md`, and the same actions on the intro/outro library.
- Preconditions: none.
- Actor: the single local user.

## Steps

1. Entities: prompts of kind article, image, thumbnail; intro/outro entries with a category (intro or outro) and a mode (Text or LLM). One rule set for all.
2. Save: name required and unique within its kind or category, compared case-insensitively; body required, non-empty; Save blocked while a lint error exists (scenario 03); kind or category may be changed after creation. A save overwrites; no version history.
3. Duplicate: a copy named "<name> copy"; if that name exists, the user renames before saving (follows the uniqueness rule).
4. Delete: removes the template. Existing projects keep their stored rendered text (scenario 03) and show the stored name marked "(deleted)" in the project header. A prompt selected on an open Play form is deselected and its fields disappear (assumed; scenario 04 rebuilds from saved bodies at click).
5. Lists on 04 and the pickers on Play sort by name.

## Branches

- Name collides within kind → Save refused with the field marked.
- Prompt used by projects → deletable anyway; projects unaffected.

## Unhappy paths

- Empty body or malformed slots → Save blocked (scenario 03).
- Deleting a prompt picked on Play → selection cleared (step 4).
- Local write failure → error shown, nothing saved (scenario 14).

## State transitions

- Template: absent → present (create or duplicate) → present (edit) → absent (delete).

## Invariants

- Names are unique per kind or category.
- A project never references a live template; it holds its own rendered text (scenario 03).
- Deleting a template never changes any project's outputs.

## Outcomes & side effects

- Templates persist locally (scenario 14's data directory; SQLite per scenario 02).
- Play pickers reflect the current template set at page load and at click (scenario 04).

## Dimensions not in play

- D1 authority: one local actor.
- D4 computation: nothing computed.
- D5 money: nothing charged.
- D6 limits: no cap on template count.
- D7 time: nothing expires.
- D8 concurrency: single user, one editor at a time.
- D10 external failure: no external call.
- D11 termination: saves are single atomic steps.
- D13 notification: no channel.
