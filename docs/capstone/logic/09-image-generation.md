---
scenario: image-generation
mockup_row: S7
screens: [06-play, 08-project]
depends_on: [01-pipeline-lifecycle, 02-provider-credentials, 03-placeholder-substitution, 04-run-admission, 05-provided-outputs]
implements: [Q70, Q71, Q72, Q73, Q74, Q75, Q76, Q77]
generated_date: 2026-09-02
capstone_version: 5.2.0
source: logic-interview.md
---

# 09 Image generation

The images stage and the prompt-driven thumbnail: Number parallel sends per prompt, sized to the run's aspect, resumable per image. The LLM-written thumbnail prompt is scenario 10. Rules cite `logic-interview.md §Q<n>`.

## Trigger & preconditions

- Trigger: scenario 01 step 4 starts images (and thumbnail when its source is Generate) once the article is `done` or `provided`.
- Preconditions: image provider keyed and model chosen; at least one image prompt ticked with a Number 1-20, total ≤ 60 (scenarios 02, 04); rendered prompt texts on the project (scenario 03); for the thumbnail, a thumbnail prompt selected (mockup §Q13).
- Actor: none beyond the pipeline (D1 not in play, §Q77).

## Steps

1. Size: request the provider's closest supported size to the run's aspect, 16:9 or 9:16 (§Q70). Any remaining mismatch is fitted by scenario 11.
2. For each ticked image prompt, send its rendered text Number times as independent parallel calls; provider default quality and style; no seed control (§Q71). Total images = sum of Numbers (scenario 04 §Q30).
3. Each returned image is stored as received (png or jpg) with its prompt text, prompt name, index within the prompt, provider, and model (§Q76), and appears on the project page as it lands, k of N (scenario 01 §Q6).
4. Thumbnail from a thumbnail prompt: one call, same aspect rule, same storage fields, stored apart from the slideshow images (§Q75).
5. Slideshow order = image prompts in selection order, then index within each prompt; the thumbnail is never in the slideshow (§Q72).
6. Mark the stage `done` when every requested image is stored; the thumbnail stage is marked independently.

## Branches

- Thumbnail source: Off → skipped; Generate with a thumbnail prompt → step 4; Generate via LLM → scenario 10; Provide → scenario 05.
- Provider returns a refusal → step "refusal" below; any other error → retries.

## Unhappy paths

- Call fails → scenario 01's retry policy with a 300 s per-call timeout for image calls (§Q77).
- One image exhausts its retries → the stage fails; completed images are kept; manual retry generates only the missing images (§Q73).
- Content-policy refusal → that image fails immediately with the refusal text, no retries; the user edits the prompt and re-runs the stage (scenario 12) (§Q74).
- Thumbnail call fails → the thumbnail stage fails on its own; images and audio unaffected; video waits (scenario 01 step 5).
- Interrupted process → stage failed "interrupted" (scenario 01); stored images kept.
- Cancel → scenario 13.

## State transitions

- Images stage and thumbnail stage: per scenario 01.
- Per image, persisted for resume: `pending` → `running` → `done` | `failed` (§Q73).

## Invariants

- When the images stage is `done`, stored image count = sum of Numbers (§Q71, §Q73).
- Slideshow order is deterministic from selection order and index (§Q72).
- The thumbnail is never part of the slideshow (§Q72).
- Video never starts before images and thumbnail are `done`, `provided`, or `skipped` (scenario 01 step 5).

## Outcomes & side effects

- Success: the image set and, when requested, the thumbnail on the project, each with its metadata (§Q76).
- Failure: stage `failed` with the provider's error or refusal text (scenario 01, §Q74).
- Images made are counted by scenario 16 telemetry.

## Dimensions not in play

- D1 authority: no actor beyond the pipeline (§Q77).
- D4 computation: nothing beyond the total count (§Q77).
- D5 money: nothing charged in-app (§Q77).
- D13 notification: no channel (§Q77).
