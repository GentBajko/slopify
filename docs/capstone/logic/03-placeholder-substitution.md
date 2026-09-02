---
scenario: placeholder-substitution
mockup_row: S1
screens: [05-prompt-editor, 06-play, 08-project]
depends_on: [01-pipeline-lifecycle]
implements: [Q19, Q20, Q21, Q22, Q23, Q24, Q25, Q26, Q27, Q98]
generated_date: 2026-09-02
capstone_version: 5.2.0
source: logic-interview.md
---

# 03 Placeholder substitution

How `{{slots}}` in prompt bodies become fields on Play and rendered prompt text at run start. This scenario makes no external call: the rendered text is sent by scenarios 06, 07, and 09 (§Q27). Rules cite `logic-interview.md §Q<n>`.

## Trigger & preconditions

- Trigger A: editing a prompt body in `mockup/05-prompt-editor.md` (detection and lint).
- Trigger B: selecting prompts on `mockup/06-play.md` (field collection) and pressing Play (rendering).
- Preconditions for B: at least one stage set to Generate has a prompt selected; scenario 04 gates the rest.

## Steps

1. Detect: scan the body for `{{` ... `}}`; strip whitespace immediately inside the braces; the remainder is the slot name. Names may contain any character except `{`, `}`, and newline, internal spaces included (`{{Middle of Words}}`), and are case-sensitive (§Q19, §Q27).
2. Lint: an unclosed `{{`, an empty `{{}}`, or braces nested inside a slot is a lint error shown on the body; Save is blocked while any lint error exists (§Q20, §Q27).
3. Collect fields: take the prompts of every stage set to Generate, plus the picked intro and outro entries (§Q98); list each distinct name once (§Q23). Group: Common = names appearing on both the text side (article prompt, intro, outro) and the image side (image or thumbnail prompts); Text = names only on the text side; Image = names only on the image side (§Q26, §Q98). How the groups are displayed is `uiux/screens/06-play.md`'s (uiux §Q14). Within a group, order of first appearance: article body order, then image prompts in selection order, then the thumbnail prompt (§Q24).
4. Validate values on Play: trim surrounding whitespace; a value must be non-empty after trimming and at most 200 characters; exactly 200 is valid; single-line input (§Q22, §Q26). Scenario 04 turns a violation into a blocked Play.
5. Render at run start: in every selected prompt body, replace each `{{name}}` occurrence with the trimmed value for that name. The same name receives the same value in every prompt (§Q11 of the mockup interview; §Q23). Insert literally: `{{` inside a value is never expanded (§Q21).
6. Record on the project: every name and value, and every rendered prompt text (article, each image prompt, thumbnail) (§Q25).

## Branches

- A name used only by a provided stage's prompt → no field (§Q23); used also by a generating stage's prompt → one field.
- Body with no slots → no fields from that prompt; allowed.
- Lint error present → Save blocked (§Q27); none → Save allowed.

## Unhappy paths

- Empty or whitespace-only value → invalid (§Q22); Play blocked per scenario 04.
- Value over 200 characters after trimming → invalid (§Q26); Play blocked per scenario 04.
- Value containing `{{name}}` → inserted verbatim; no expansion, no error (§Q21).
- Two prompts use the same name for different purposes → still one field, one value; the user resolves it by renaming a slot in one prompt (§Q23).
- Prompt edited between selection and Play → the field list is rebuilt from the saved body at Play (assumed; scenario 04 confirms form behaviour).

## State transitions

None: no entity changes state here (D9 not in play, §Q27).

## Invariants

- A rendered prompt never contains an unfilled `{{name}}` (§Q22, §Q27).
- A value never expands into further slots (§Q21).
- One name has exactly one value within a run (§Q23, §Q27).

## Outcomes & side effects

- Success: rendered prompt texts and keyword values stored on the project; the sending scenarios read the rendered texts (§Q25).
- Failure: no run is created; the invalid field is marked (scenario 04 owns the marking).
- Nothing leaves the machine in this scenario (§Q27).

## Dimensions not in play

- D1 authority: one local actor (§Q27).
- D4 computation: nothing computed beyond string replacement (§Q27).
- D5 money: nothing charged (§Q27).
- D7 time: nothing scheduled or expiring (§Q27).
- D9 lifecycle: no entity state changes (§Q27).
- D10 failure and recovery: no external call is made here; the LLM, TTS, and image calls that consume the rendered text belong to scenarios 06, 07, 09 under scenario 01's retry policy (§Q27).
- D11 termination: rendering is a single synchronous step (§Q27).
- D13 notification: no channel (§Q27).
- D14 effects on others: nothing outside the run is touched (§Q27).
