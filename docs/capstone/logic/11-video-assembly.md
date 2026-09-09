---
scenario: video-assembly
mockup_row: S8
screens: [06-play, 08-project]
depends_on: [01-pipeline-lifecycle, 05-provided-outputs, 08-narration, 09-image-generation]
generated_date: 2026-09-09
capstone_version: 5.2.0
---

# 11 Video assembly

The final media stage produces an MP4 slideshow or a combined PCM WAV. Audio Off permits a silent MP4; Video Off with active Audio exports WAV; both Off skip the media stage.

## Trigger & preconditions

- Trigger: MP4 waits for Article, Audio, Images and Thumbnail to be satisfied. WAV waits only for Article and Audio.
- Inputs on the project: body audio and its duration; intro and outro audio with durations when picked (scenario 08); the silence-gap setting, default 3 s (scenario 02); the current image set in slideshow order (scenarios 05, 09); format.
- Actor: none beyond the pipeline.

## Steps

1. When audio is enabled, build the audio timeline: intro audio, gap, body audio, gap, outro audio; a gap is inserted only where the neighbouring segment exists; gaps are plain silence of the configured length. Total length = sum of segments and gaps. Audio Off uses five seconds per image and omits the audio stream entirely.
2. Slot computation: per-image slot = total length ÷ image count; the last image absorbs frame rounding at 30 fps. One image → it fills the whole length.
3. Slideshow across the whole timeline, intro through outro, with the same images: hard cut between images; zoom alternates, odd images 100% → 115% zooming in, even images 115% → 100% zooming out, linear, centred.
4. Fit every image by scaling to cover the frame and centre-cropping; no letterboxing.
5. Frame: 16:9 renders 1920×1080, 9:16 renders 1080×1920; 30 fps; mp4 container; codecs are `stack`'s. Progress reported as render percentage (scenario 01).
6. Store the mp4 and the render parameters used: segment durations, gap, per-image slots, zoom pattern, frame, fps, image order. Mark the stage `done`; the project completes once every selected stage is satisfied (scenario 01).

## Branches

- Video Off with Audio Generate/Provide → decode and combine intro, body and outro with the configured silence gaps into `audio.wav`, 48 kHz stereo signed 16-bit PCM. Record the plan in `render.json`; no images are needed and this does not increment the videos counter.
- Both Audio and Video Off → the final stage is skipped; the Article download remains available.
- Intro Off → no intro segment and no leading gap; outro Off → no outro segment and no trailing gap.
- Image aspect equals the frame → no crop; differs → cover and crop.

## Unhappy paths

- Render fails → the renderer's error shown verbatim on the video stage; no automatic retry; no timeout; manual re-render per scenario 12.
- Interrupted process → stage failed "interrupted" (scenario 01).
- Cancel → scenario 13.

## State transitions

- Video stage: per scenario 01; `done` → `running` only via re-render (scenario 12).

## Invariants

- Narrated video length = intro + gaps + body + outro; silent video length = image count × 5 seconds.
- Every slideshow image appears exactly once, in slideshow order (scenario 09).
- The thumbnail is never in the video (scenario 09).
- The video reflects the image set as of render start; later image changes need a re-render (scenario 12).

## Outcomes & side effects

- Success: one MP4 or WAV and its render parameters on the project. The previous finished export stays downloadable until its replacement succeeds.
- Failure: stage `failed` with the renderer's error.
- Videos made are counted by scenario 16 telemetry.

## Dimensions not in play

- D1 authority: no actor beyond the pipeline.
- D5 money: nothing charged.
- D6 limits: no cap on image count or duration.
- D10 external failure: the render is local; its failure is handled above without retries.
- D13 notification: no channel.
