---
scenario: reruns-and-edits
mockup_row: S10
screens: [08-project]
depends_on: [01-pipeline-lifecycle, 02-provider-credentials, 05-provided-outputs, 07-article-writing, 08-narration, 09-image-generation, 10-thumbnail-prompt-by-llm, 11-video-assembly]
generated_date: 2026-09-02
capstone_version: 5.2.0
---

# 12 Re-runs and edits

Every action on an existing project that changes an output: edits, re-runs, single-image actions, replacement uploads, and the cascade they trigger.

## Trigger & preconditions

- Trigger: an action on `mockup/08-project.md`: Edit article, Save & re-run, Re-run audio (with a voice), Re-run images, Regenerate image, Delete image, Re-render, Retry (scenario 01), edit of a stored prompt text, replacement paste or upload.
- Preconditions: no stage of the project is `running`; the stage's provider has a key, otherwise its controls read "Key missing" (scenario 02).
- Actor: the single local user.

## Steps

1. Article edit: the inline editor replaces the stored markdown; the plain-text narration source and the sources and glossary files are rebuilt (scenario 08 step 1); then audio, LLM-mode intro/outro text, LLM-written thumbnail, and video re-run; prompt-based images are untouched.
2. Re-run audio: the audio stage re-runs with the chosen voice (scenario 08); video re-renders.
3. Re-run images: every image regenerated from the project's stored rendered prompt texts and Numbers (scenario 09); video re-renders.
4. Regenerate one image: one new call with that image's stored prompt text, replacing it in place at the same index; video re-renders.
5. Delete one image: removed from the set; at least one image must remain; video re-renders.
6. Edit a stored rendered prompt text (an image prompt, the thumbnail prompt, an LLM-written intro or outro) on the project page, then re-run the affected stage; the saved templates are never modified.
7. Replacement: paste or upload for any stage except video, under scenario 05's acceptance and background-staging rules; the stage becomes `provided`; dependents re-run.
8. Re-render: the video stage re-runs from the current audio, images, and settings (scenario 11).
9. Cascade: every re-run marks its dependents `pending` and runs them automatically per scenario 01, ending in a fresh render. The project reads `running` meanwhile.
10. Replacement of an output deletes the previous file; no version history. The previous video stays downloadable until the new render finishes.

## Branches

- Which stages re-run after an article edit: audio, LLM-mode intro/outro, LLM-written thumbnail, video; not prompt-based images or a prompt-based thumbnail.
- Retry of a `failed` stage: scenario 01 and the per-stage resume rules (scenarios 06, 08, 09, 10).

## Unhappy paths

- Action while a stage is `running` → controls disabled.
- Provider key missing → controls disabled, "Key missing" (scenario 02).
- Deleting the last image → refused.
- Re-run fails → the stage `failed` per its own scenario; the cascade stops there; earlier outputs of the cascade stand.
- Interrupted process during a cascade → running stages `failed` "interrupted" (scenario 01).
- Cancel during a cascade → scenario 13.

## State transitions

- Stage: `done` → `running` on re-run (scenario 01's only path for this transition); replaced stage → `provided`.
- Project: `done` or `failed` → `running` → `done` | `failed` (scenario 01).

## Invariants

- After a completed cascade nothing downstream is stale.
- A project never keeps two outputs for one stage once an action completes.
- Edits never touch saved templates.
- At least one image always remains.

## Outcomes & side effects

- Success: the changed outputs and a fresh video on the project.
- Failure: the failed stage per scenario 01; outputs produced earlier in the cascade remain.
- Regenerated tokens, audio hours, images, and videos are counted again by scenario 16 telemetry.
- Storage: replaced files deleted (scenario 14 owns the layout).

## Dimensions not in play

- D1 authority: one local actor.
- D4 computation: nothing computed.
- D5 money: nothing charged in-app.
- D7 time: nothing scheduled or expiring.
- D10 failure of external calls: owned by the stage scenarios the actions invoke.
- D13 notification: no channel.
