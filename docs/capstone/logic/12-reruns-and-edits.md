---
scenario: reruns-and-edits
mockup_row: S10
screens: [08-project]
depends_on: [01-pipeline-lifecycle, 02-provider-credentials, 05-provided-outputs, 07-article-writing, 08-narration, 09-image-generation, 10-thumbnail-prompt-by-llm, 11-video-assembly]
implements: [Q39, Q44, Q101, Q102, Q103, Q104, Q105, Q106, Q107]
generated_date: 2026-09-02
capstone_version: 5.2.0
source: logic-interview.md
---

# 12 Re-runs and edits

Every action on an existing project that changes an output: edits, re-runs, single-image actions, replacement uploads, and the cascade they trigger. Rules cite `logic-interview.md §Q<n>`.

## Trigger & preconditions

- Trigger: an action on `mockup/08-project.md`: Edit article, Save & re-run, Re-run audio (with a voice), Re-run images, Regenerate image, Delete image, Re-render, Retry (scenario 01), edit of a stored prompt text, replacement paste or upload.
- Preconditions: no stage of the project is `running` (§Q106); the stage's provider has a key, otherwise its controls read "Key missing" (scenario 02 §Q13).
- Actor: the single local user (D1 not in play, §Q107).

## Steps

1. Article edit: the inline editor replaces the stored markdown; the plain-text narration source and the sources and glossary files are rebuilt (scenario 08 step 1); then audio, LLM-mode intro/outro text, LLM-written thumbnail, and video re-run; prompt-based images are untouched (§Q101).
2. Re-run audio: the audio stage re-runs with the chosen voice (scenario 08); video re-renders (§Q102).
3. Re-run images: every image regenerated from the project's stored rendered prompt texts and Numbers (scenario 09); video re-renders (§Q102).
4. Regenerate one image: one new call with that image's stored prompt text, replacing it in place at the same index (§Q103); video re-renders (§Q102).
5. Delete one image: removed from the set; at least one image must remain; video re-renders (§Q103, §Q102).
6. Edit a stored rendered prompt text (an image prompt, the thumbnail prompt, an LLM-written intro or outro) on the project page, then re-run the affected stage; the saved templates are never modified (§Q104).
7. Replacement: paste or upload for any stage except video, under scenario 05's acceptance and background-staging rules (§Q44, §Q105); the stage becomes `provided`; dependents re-run (§Q102).
8. Re-render: the video stage re-runs from the current audio, images, and settings (scenario 11).
9. Cascade: every re-run marks its dependents `pending` and runs them automatically per scenario 01 §Q5, ending in a fresh render (§Q102). The project reads `running` meanwhile.
10. Replacement of an output deletes the previous file; no version history (§Q106). The previous video stays downloadable until the new render finishes (§Q106).

## Branches

- Which stages re-run after an article edit: audio, LLM-mode intro/outro, LLM-written thumbnail, video; not prompt-based images or a prompt-based thumbnail (§Q101).
- Retry of a `failed` stage: scenario 01 §Q5 and the per-stage resume rules (scenarios 06, 08, 09, 10).

## Unhappy paths

- Action while a stage is `running` → controls disabled (§Q106).
- Provider key missing → controls disabled, "Key missing" (scenario 02).
- Deleting the last image → refused (§Q103).
- Re-run fails → the stage `failed` per its own scenario; the cascade stops there; earlier outputs of the cascade stand.
- Interrupted process during a cascade → running stages `failed` "interrupted" (scenario 01).
- Cancel during a cascade → scenario 13.

## State transitions

- Stage: `done` → `running` on re-run (scenario 01's only path for this transition); replaced stage → `provided`.
- Project: `done` or `failed` → `running` → `done` | `failed` (scenario 01 §Q9).

## Invariants

- After a completed cascade nothing downstream is stale (§Q102).
- A project never keeps two outputs for one stage once an action completes (§Q106).
- Edits never touch saved templates (§Q104).
- At least one image always remains (§Q103).

## Outcomes & side effects

- Success: the changed outputs and a fresh video on the project.
- Failure: the failed stage per scenario 01; outputs produced earlier in the cascade remain.
- Regenerated tokens, audio hours, images, and videos are counted again by scenario 16 telemetry (D14).
- Storage: replaced files deleted (scenario 14 owns the layout).

## Dimensions not in play

- D1 authority: one local actor (§Q107).
- D4 computation: nothing computed (§Q107).
- D5 money: nothing charged in-app (§Q107).
- D7 time: nothing scheduled or expiring (§Q107).
- D10 failure of external calls: owned by the stage scenarios the actions invoke (§Q107).
- D13 notification: no channel (§Q107).
