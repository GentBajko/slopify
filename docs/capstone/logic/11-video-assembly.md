---
scenario: video-assembly
mockup_row: S8
screens: [06-play, 08-project]
depends_on: [01-pipeline-lifecycle, 05-provided-outputs, 08-narration, 09-image-generation]
generated_date: 2026-09-02
capstone_version: 5.2.0
---

# 11 Video assembly

The video stage: narrated intro and outro around the body, silence gaps between them, one slideshow with alternating zoom across the whole timeline.

## Trigger & preconditions

- Trigger: scenario 01 step 5 starts the video stage when audio, images, and thumbnail are each `done`, `provided`, or `skipped`.
- Inputs on the project: body audio and its duration; intro and outro audio with durations when picked (scenario 08); the silence-gap setting, default 3 s (scenario 02); the current image set in slideshow order (scenarios 05, 09); format.
- Actor: none beyond the pipeline.

## Steps

1. Build the audio timeline: intro audio, gap, body audio, gap, outro audio; a gap is inserted only where the neighbouring segment exists; gaps are plain silence of the configured length. Total length = sum of segments and gaps.
2. Slot computation: per-image slot = total length ÷ image count; the last image absorbs frame rounding at 30 fps. One image → it fills the whole length.
3. Slideshow across the whole timeline, intro through outro, with the same images: hard cut between images; zoom alternates, odd images 100% → 115% zooming in, even images 115% → 100% zooming out, linear, centred.
4. Fit every image by scaling to cover the frame and centre-cropping; no letterboxing.
5. Frame: 16:9 renders 1920×1080, 9:16 renders 1080×1920; 30 fps; mp4 container; codecs are `stack`'s. Progress reported as render percentage (scenario 01).
6. Store the mp4 and the render parameters used: segment durations, gap, per-image slots, zoom pattern, frame, fps, image order. Mark the stage `done`; the project reads `done` (scenario 01).

## Branches

- Intro Off → no intro segment and no leading gap; outro Off → no outro segment and no trailing gap.
- Image aspect equals the frame → no crop; differs → cover and crop.

## Unhappy paths

- Render fails → the renderer's error shown verbatim on the video stage; no automatic retry; no timeout; manual re-render per scenario 12.
- Interrupted process → stage failed "interrupted" (scenario 01).
- Cancel → scenario 13.

## State transitions

- Video stage: per scenario 01; `done` → `running` only via re-render (scenario 12).

## Invariants

- Video length = intro + gaps + body + outro.
- Every slideshow image appears exactly once, in slideshow order (scenario 09).
- The thumbnail is never in the video (scenario 09).
- The video reflects the image set as of render start; later image changes need a re-render (scenario 12).

## Outcomes & side effects

- Success: one mp4 and its render parameters on the project; project `done`.
- Failure: stage `failed` with the renderer's error.
- Videos made are counted by scenario 16 telemetry.

## Dimensions not in play

- D1 authority: no actor beyond the pipeline.
- D5 money: nothing charged.
- D6 limits: no cap on image count or duration.
- D10 external failure: the render is local; its failure is handled above without retries.
- D13 notification: no channel.
