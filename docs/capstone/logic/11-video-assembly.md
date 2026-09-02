---
scenario: video-assembly
mockup_row: S8
screens: [06-play, 08-project]
depends_on: [01-pipeline-lifecycle, 05-provided-outputs, 08-narration, 09-image-generation]
implements: [Q84, Q85, Q87, Q88, Q89, Q90, Q94, Q95, Q99, Q100]
generated_date: 2026-09-02
capstone_version: 5.2.0
source: logic-interview.md
---

# 11 Video assembly

The video stage: narrated intro and outro around the body, silence gaps between them, one slideshow with alternating zoom across the whole timeline. Rules cite `logic-interview.md §Q<n>`.

## Trigger & preconditions

- Trigger: scenario 01 step 5 starts the video stage when audio, images, and thumbnail are each `done`, `provided`, or `skipped`.
- Inputs on the project: body audio and its duration; intro and outro audio with durations when picked (scenario 08); the silence-gap setting, default 3 s (scenario 02, §Q95, §Q99); the current image set in slideshow order (scenarios 05, 09); format (mockup §Q18).
- Actor: none beyond the pipeline (D1 not in play, §Q100).

## Steps

1. Build the audio timeline: intro audio, gap, body audio, gap, outro audio; a gap is inserted only where the neighbouring segment exists; gaps are plain silence of the configured length (§Q95, §Q99). Total length = sum of segments and gaps.
2. Slot computation: per-image slot = total length ÷ image count; the last image absorbs frame rounding at 30 fps (§Q84). One image → it fills the whole length (§Q100).
3. Slideshow across the whole timeline, intro through outro, with the same images (§Q94): hard cut between images (§Q84); zoom alternates, odd images 100% → 115% zooming in, even images 115% → 100% zooming out, linear, centred (§Q85).
4. Fit every image by scaling to cover the frame and centre-cropping; no letterboxing (§Q88).
5. Frame: 16:9 renders 1920×1080, 9:16 renders 1080×1920; 30 fps; mp4 container; codecs are `stack`'s (§Q87). Progress reported as render percentage (scenario 01 §Q6).
6. Store the mp4 and the render parameters used: segment durations, gap, per-image slots, zoom pattern, frame, fps, image order (§Q100). Mark the stage `done`; the project reads `done` (scenario 01 §Q9).

## Branches

- Intro Off → no intro segment and no leading gap; outro Off → no outro segment and no trailing gap (§Q95).
- Image aspect equals the frame → no crop; differs → cover and crop (§Q88).

## Unhappy paths

- Render fails → the renderer's error shown verbatim on the video stage; no automatic retry; no timeout; manual re-render per scenario 12 (§Q89).
- Interrupted process → stage failed "interrupted" (scenario 01).
- Cancel → scenario 13.

## State transitions

- Video stage: per scenario 01; `done` → `running` only via re-render (scenario 12).

## Invariants

- Video length = intro + gaps + body + outro (§Q95).
- Every slideshow image appears exactly once, in slideshow order (§Q84, scenario 09 §Q72).
- The thumbnail is never in the video (scenario 09 §Q72).
- The video reflects the image set as of render start (§Q100); later image changes need a re-render (scenario 12).

## Outcomes & side effects

- Success: one mp4 and its render parameters on the project; project `done`.
- Failure: stage `failed` with the renderer's error (§Q89).
- Videos made are counted by scenario 16 telemetry.

## Dimensions not in play

- D1 authority: no actor beyond the pipeline (§Q100).
- D5 money: nothing charged (§Q100).
- D6 limits: no cap on image count or duration (§Q100).
- D10 external failure: the render is local; its failure is handled above without retries (§Q89).
- D13 notification: no channel (§Q100).
