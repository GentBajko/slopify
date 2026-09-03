---
scenario: placeholder-substitution
mockup_row: S1
screens: [05-prompt-editor, 06-play, 08-project]
depends_on: [01-pipeline-lifecycle]
generated_date: 2026-09-02
capstone_version: 5.2.0
---

# 03 Placeholder substitution

How `{{slots}}` in prompt bodies become fields on Play and rendered prompt text at run start. This scenario makes no external call: the rendered text is sent by scenarios 06, 07, and 09.

## Trigger & preconditions

- Trigger A: editing a prompt body in `mockup/05-prompt-editor.md` (detection and lint).
- Trigger B: selecting prompts on `mockup/06-play.md` (field collection) and pressing Play (rendering).
- Preconditions for B: at least one stage set to Generate has a prompt selected; scenario 04 gates the rest.

## Steps

1. Detect: scan the body for `{{`... `}}`; strip whitespace immediately inside the braces; the remainder is the slot name. Names may contain any character except `{`, `}`, and newline, internal spaces included (`{{Middle of Words}}`), and are case-sensitive.
2. Lint: an unclosed `{{`, an empty `{{}}`, or braces nested inside a slot is a lint error shown on the body; Save is blocked while any lint error exists.
3. Collect fields: take the prompts of every stage set to Generate, plus the picked intro and outro entries; list each distinct name once. Group: Common = names appearing on both the text side (article prompt, intro, outro) and the image side (image or thumbnail prompts); Text = names only on the text side; Image = names only on the image side. How the groups are displayed is the Play screen's. Within a group, order of first appearance: article body order, then image prompts in selection order, then the thumbnail prompt.
4. Validate values on Play: trim surrounding whitespace; a value must be non-empty after trimming and at most 200 characters; exactly 200 is valid; single-line input. Scenario 04 turns a violation into a blocked Play.
5. Render at run start: in every selected prompt body, replace each `{{name}}` occurrence with the trimmed value for that name. The same name receives the same value in every prompt. Insert literally: `{{` inside a value is never expanded.
6. Record on the project: every name and value, and every rendered prompt text (article, each image prompt, thumbnail).

## Branches

- A name used only by a provided stage's prompt → no field; used also by a generating stage's prompt → one field.
- Body with no slots → no fields from that prompt; allowed.
- Lint error present → Save blocked; none → Save allowed.

## Unhappy paths

- Empty or whitespace-only value → invalid; Play blocked per scenario 04.
- Value over 200 characters after trimming → invalid; Play blocked per scenario 04.
- Value containing `{{name}}` → inserted verbatim; no expansion, no error.
- Two prompts use the same name for different purposes → still one field, one value; the user resolves it by renaming a slot in one prompt.
- Prompt edited between selection and Play → the field list is rebuilt from the saved body at Play (assumed; scenario 04 confirms form behaviour).

## State transitions

None: no entity changes state here.

## Invariants

- A rendered prompt never contains an unfilled `{{name}}`.
- A value never expands into further slots.
- One name has exactly one value within a run.

## Outcomes & side effects

- Success: rendered prompt texts and keyword values stored on the project; the sending scenarios read the rendered texts.
- Failure: no run is created; the invalid field is marked (scenario 04 owns the marking).
- Nothing leaves the machine in this scenario.

## Dimensions not in play

- D1 authority: one local actor.
- D4 computation: nothing computed beyond string replacement.
- D5 money: nothing charged.
- D7 time: nothing scheduled or expiring.
- D9 lifecycle: no entity state changes.
- D10 failure and recovery: no external call is made here; the LLM, TTS, and image calls that consume the rendered text belong to scenarios 06, 07, 09 under scenario 01's retry policy.
- D11 termination: rendering is a single synchronous step.
- D13 notification: no channel.
- D14 effects on others: nothing outside the run is touched.
