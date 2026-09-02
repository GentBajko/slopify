---
scenario: run-admission
mockup_row: S2
screens: [06-play, 08-project]
depends_on: [01-pipeline-lifecycle, 02-provider-credentials, 03-placeholder-substitution]
implements: [Q28, Q29, Q30, Q31, Q32, Q33, Q34, Q36, Q81, Q91, Q97]
generated_date: 2026-09-02
capstone_version: 5.2.0
source: logic-interview.md
---

# 04 Run admission

What Play requires before a project exists, and what one click produces. Rules cite `logic-interview.md §Q<n>`.

## Trigger & preconditions

- Trigger: the user opens `mockup/06-play.md` and presses Play.
- Preconditions: none to open the form. To press Play: the form is valid per Steps 2-4 (§Q29).
- Actor: the single local user (D1 not in play, §Q36).

## Steps

1. Fresh form defaults: format 16:9; intro and outro Off (§Q91, supersedes cards-on); research Off; thumbnail Off; article, audio, images Generate; no prompts, providers, models, or voice selected; keywords empty (§Q32).
2. Required set (§Q28):
   - title: non-empty, at most 200 characters; duplicates across projects allowed (§Q30);
   - format: one of 16:9, 9:16;
   - for each stage set to Generate: its prompt(s) selected; a provider that has a key (scenario 02); a model (scenario 02's fetched list); for audio, a voice from the settings list; for images, a Number per ticked prompt;
   - the LLM provider and model only when research or article is Generate, the thumbnail source is Prompt by LLM (scenario 10 §Q81), or a picked intro or outro entry is LLM-mode (§Q97);
   - intro and outro: optional picks, Off or one saved entry each (§Q91);
   - every keyword field valid per scenario 03 (non-empty, ≤200 characters);
   - for each stage set to Provide: its content present (scenario 05 validates it).
3. Limits (§Q30): Number per image prompt 1-20 inclusive; total images per run = sum of Numbers ≤ 60; exactly 20 and exactly 60 are valid.
4. Images mandatory (§Q31): images is Generate with at least one ticked prompt, or Provide with at least one file. Images cannot be Off.
5. Validation is live: Play is disabled until every check passes; each failing field is marked in place; no error is shown after a click (§Q29).
6. On click: disable the button while submitting; create exactly one project carrying the full configuration, the keyword values, and the prompt bodies as saved at the moment of the click, rendered per scenario 03 (§Q33, §Q34); scenario 01 step 1 marks stages and starts the run.
7. Navigate to `mockup/08-project.md` for the new project. The form keeps its values for the next run while the app tab is open; a restart returns the defaults of step 1 (§Q33, §Q36).

## Branches

- Research or article Generate → LLM row required; both Provide/Off → LLM row hidden and not required (§Q28).
- A stage set to Provide → its generation controls hidden, its content required instead (mockup §Q28; §Q28).
- Thumbnail Off → no thumbnail requirement; From prompt or Prompt by LLM → thumbnail prompt required, the latter also the LLM row (§Q28; scenario 10 §Q81); Provide → one file required (§Q28).
- Prompt body changed between selection and click → fields and rendering rebuilt from the saved body at click time (§Q34).

## Unhappy paths

- Any check fails → Play disabled, field marked; no project (§Q29).
- Unkeyed provider chosen → impossible: greyed out per scenario 02.
- Model list unavailable → Play blocked for that provider per scenario 02.
- Empty voice list with audio Generate → voice required, so Play stays disabled (§Q28; scenario 02).
- Double click → the second click finds the button disabled; one project (§Q33).
- Local project creation fails (disk error) → no project; the error is shown on Play (§Q36).

## State transitions

- Project: (none) → created with stages marked per scenario 01 step 1 and status `running` (§Q33).

## Invariants

- No project is created from an invalid form (§Q29, §Q36).
- One click creates exactly one project (§Q33).
- Every project has at least one image source (§Q31).

## Outcomes & side effects

- Success: a project record with configuration, keyword values, rendered prompts (scenario 03), and stage statuses (scenario 01); the run starts; the page changes to the project (§Q33).
- Failure: nothing persisted; Play shows the local error (§Q36).
- Record: the project record is the durable trace; the form's kept values are tab-session state only (§Q36).

## Dimensions not in play

- D1 authority: one local actor (§Q36).
- D5 money: nothing charged before or by creation (§Q36).
- D7 time: nothing scheduled or expiring (§Q36).
- D10 failure and recovery of external calls: no external call happens before the project exists; the only failure is local creation (§Q36).
- D13 notification: no channel (§Q36).
- D14 effects on others: nothing outside the new project is touched (§Q36).
