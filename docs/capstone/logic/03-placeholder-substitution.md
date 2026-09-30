---
generated_at_commit: 54f5cb4c1dab
generated_date: 2026-09-30
capstone_version: 7.0.1
content_hash: bf01e683dffc
paths_covered:
  - ":(top)packages/app/src/slices/admission/substitute.ts"
  - ":(top)packages/app/src/slices/admission/rules.ts"
  - ":(top)packages/app/src/slices/admission/start.ts"
  - ":(top)packages/app/src/slices/library/lint.ts"
  - ":(top)packages/app/src/slices/library/slots.ts"
  - ":(top)packages/app/src/slices/project-templates/one-off.ts"
  - ":(top)packages/app/src/slices/schedules/topic-list.ts"
  - ":(top)packages/app/src/slices/schedules/schema.ts"
  - ":(top)packages/app/src/slices/images/scenes.ts"
  - ":(top)packages/app/src/slices/images/appearance.ts"
  - ":(top)packages/app/src/slices/rebuild/recipe-text.ts"
  - ":(top)packages/app/src/slices/rebuild/recipe-visual.ts"
  - ":(top)packages/web/src/play/admission.ts"
  - ":(top)packages/web/src/components/keyword-list.tsx"
  - ":(top)packages/web/src/schedules/topic-queue.tsx"
scenario: placeholder-substitution
mockup_row: S1
screens: [05-prompt-editor, 06-play, 08-project]
depends_on: [01-pipeline-lifecycle]
---

# 03 Placeholder substitution

How `{{keywords}}` in prompt bodies, entries and the project title become fields on Play (and on Edit project, templates and schedules), and rendered text at run start. Two keywords, `{{Scene}}` and `{{Appearance}}`, are filled by Slopify per image instead. This scenario makes no external call: the rendered text is sent by scenarios 06, 07, 09 and the others that read `config.rendered`.

## Trigger & preconditions

- Trigger A: saving a prompt or entry in the prompt editor (lint, `packages/app/src/slices/library/lint.ts:11-46`).
- Trigger B: every change on Play: the form recomputes its keyword fields live (`packages/web/src/play/admission.ts:49-85`).
- Trigger C: pressing Play / starting a run (field collection from saved bodies, validation, rendering; `packages/app/src/slices/library/slots.ts:43-194`).
- Preconditions for C: at least one stage set to Generate has its prompt picked; scenario 04 gates the rest.

## Steps

1. Detect (`detectSlots`, `packages/app/src/slices/admission/substitute.ts:33-59`): scan for `{{`; the closer `}}` must come before the next newline; the text between is trimmed and is the name. Names may hold any character except `{`, `}` and newline, internal spaces included (`{{Middle of Words}}`), and are case-sensitive. No escape syntax (`substitute.ts:1-4`). Distinct names are kept in first-appearance order.
2. Lint: an unclosed `{{` (no `}}` before the line ends), an empty `{{}}`, or a brace inside a slot is an error with its line and column; Save is refused while any exists. Also refused: blank name, name over `nameMax`, blank body, body over `bodyMax` (`lint.ts:19-68`).
3. Collect fields (`collectFields`, `substitute.ts:73-89`) from two ordered lists of bodies:
   - Text side, server order (`slots.ts:56-123`, `:170-174`): the project title; the article prompt (or the script prompt for a script run) when Article is Generate; the narration-preparation prompt when used; the intro and outro entries when narration is Generate; the YouTube description prompt when used; the Shorts prompt when Shorts are on; each active review stage's Review prompt.
   - Image side, server order (`slots.ts:98-168`): the Shorts image prompt; the establishing image's prompt when its source is a prompt; each picked image prompt in selection order when Images is Generate; the thumbnail prompt when the thumbnail is From prompt or Prompt by LLM.
   - A prompt left selected on a stage set to Provide or Off contributes nothing (`slots.ts:51-52`). None picked for an optional step (description, Shorts, review) is the built-in prompt, which asks for no keyword (`slots.ts:84`, `:97`, `:112`).
   - Group: Common = on both sides; Text = text only; Image = image only. `Scene` and `Appearance` are never fields (`filledKeywords`, `substitute.ts:61-68`, `:81`).
   - Play's live list reads the same bodies from the form, in its own order (title, narration prompt, article prompt, intro, outro, description, Shorts, then image prompts, establishing image, thumbnail) and does not include review prompts (`admission.ts:49-85`); the server's list at the click is the one admission checks.
4. Show fields (`KeywordList`, `packages/web/src/components/keyword-list.tsx:34-108`): one input per keyword, max length `valueMax` (200) by default; under each a line "Feeds <place> · <place>" naming every place it is used, or "Not used by any picked prompt"; a keyword the title names adds "left empty in templates" (`keyword-list.tsx:21-29`). Play, Edit project, templates and schedules draw this one list; without an `onChange` it is read-only (saved template).
5. Validate on admission (`checkValues`, `packages/app/src/slices/admission/rules.ts:368-391`): values are trimmed first (`normaliseDraft`, `rules.ts:219-224`); each required name must have a non-empty value, ≤ 200 characters (`valueMax`, `rules.ts:36`; exactly 200 is valid), with no line break. Each violation is a `values.<name>` field error; scenario 04 turns it into a blocked Play.
6. Render at run start (`render`, `substitute.ts:94-103`; `renderPicked`, `slots.ts:185-194`): in every picked body replace each `{{name}}` with its trimmed value in one pass; a value's own `{{…}}` is inserted literally and never expanded; a name with no value is left as written. Lookups are prototype-free, so names like `constructor` or `__proto__` are ordinary (`substitute.ts:96-100`, `rules.ts:219-222`).
7. Title: the project title is rendered with the same values, trimmed; if that is empty the unrendered title is kept (`packages/app/src/slices/admission/start.ts:65-67`).
8. Record on the project: `config.values` (the trimmed values) and `config.rendered`, keyed by the draft field that picked each body: `article`, `narration`, `intro`, `outro`, `description`, `shorts`, `shortsImage`, `referencePrompt`, `imagePrompts.<n>`, `thumbnailPrompt`, and each review prompt key (`slots.ts:23-29`, `start.ts:70-80`).
9. Re-render on rebuild: a revision that carries its own prompt template for a key renders it again with `config.values`; otherwise the stored `config.rendered[key]` is used (`renderedPrompt`, `packages/app/src/slices/rebuild/recipe-text.ts:31-36`). Scenario 12 owns revisions.
10. `{{Scene}}` and `{{Appearance}}` (scenario 09 owns the calls that produce them):
    - Scene: with Scenes from the article on, each image's scene replaces `{{Scene}}`, or, when the prompt has none, is inserted as a `Scene: …` line after the prompt's first paragraph (`withScene`, `packages/app/src/slices/images/scenes.ts:14-22`). With it off, any line holding `{{Scene}}` is removed (`withoutScene`, `scenes.ts:24-34`; applied in `packages/app/src/slices/rebuild/recipe-visual.ts:73-74`).
    - Appearance: `{{Appearance}}` becomes the looks of the subject and up to 3 characters the image's scene names (the subject always for a thumbnail); when that text is empty, the lines holding it are removed (`packages/app/src/slices/images/appearance.ts:83-115`).
11. Templates and schedules: saving a template empties the values of keywords the title names (the per-video topic) and keeps the rest (`templateValues`, `packages/app/src/slices/project-templates/one-off.ts:8-23`). A schedule has a topic keyword and "every run" values (each value ≤ 10000 chars, keyword names trimmed, ≤ 200, `packages/app/src/slices/schedules/schema.ts:11-19`); a run's values are layered template values → every-run values → the topic's own values → topic title in the topic keyword; without a topic keyword the topic is the whole title (`scheduledValues` / `renderedTitle`, `packages/app/src/slices/schedules/topic-list.ts:29-61`). The schedule's list labels fields "<name> (every run)" and adds "Unless a topic sets its own." to columns a topic list provides (`packages/web/src/schedules/topic-queue.tsx:349-364`). Scenario 25 owns schedules.

## Branches

- Name used only by a Provide/Off stage's prompt → no field; also used by a generating stage's body → one field.
- Name used on both sides → Common; one side → Text or Image.
- Name is `Scene` or `Appearance` → never a field; filled per image or its line removed.
- Body with no slots → no fields; allowed.
- Lint error present → Save refused; none → Save allowed.
- Title has keywords → rendered per project; a template stores those keywords empty.

## Unhappy paths

- Empty or whitespace-only value → "Fill in this field."; Play blocked (scenario 04).
- Value over 200 characters after trimming → "Keep this to 200 characters or fewer."
- Value with a line break → "Keep this to a single line, without line breaks."
- Value containing `{{name}}` → inserted verbatim; no expansion, no error.
- Two prompts use the same name for different purposes → one field, one value.
- Prompt edited between selection and Play → bodies are read at the click, so the edit is the one that runs (`slots.ts:1-4`).
- Picked prompt or entry deleted before Play → "That <kind> prompt was deleted. Choose another." / "That <category> entry was deleted." (`slots.ts:211-236`).
- Title renders to an empty string → the unrendered title is used.

## State transitions

None: no entity changes state here. Values and rendered text are written once, inside the run-start transaction (scenario 01).

## Invariants

- A rendered body never has a user keyword left unfilled: admission refuses a run with a missing value before render (`substitute.ts:91-93`, `rules.ts:368-377`). `{{Scene}}` and `{{Appearance}}` may remain in `config.rendered` and are resolved or removed before any image request.
- A value never expands into further slots (single pass).
- One name has exactly one value within a run.
- Editor, Play and run share one grammar (`detectSlots`), imported, never restated (`lint.ts:1-3`, `admission.ts:12`).

## Outcomes & side effects

- Success: `config.values` and `config.rendered` stored on the project; the title stored rendered.
- Failure: no run is created; each invalid field is marked in place (scenario 04).
- Nothing leaves the machine in this scenario.

## Dimensions not in play

- D1 authority: one local actor.
- D4 computation: nothing beyond string replacement.
- D5 money: nothing charged.
- D7 time: nothing scheduled or expiring (schedule timing is scenario 25's).
- D9 lifecycle: no entity state changes.
- D10 failure and recovery: no external call; consumers run under scenario 01's retry policy.
- D11 termination: rendering is a single synchronous step.
- D13 notification: no channel.
- D14 effects on others: nothing outside the run is touched.
