---
absorbed_from:
- features/2026-09-25-video-recovery@2026-09-25
- features/2026-09-09-pausable-optional-runs@2026-09-10
- features/2026-09-10-subtitles-fonts@2026-09-10
- features/2026-09-10-editable-projects@2026-09-12
scenario: video-assembly
mockup_row: S8
screens:
- 06-play
- 08-project
depends_on:
- 01-pipeline-lifecycle
- 05-provided-outputs
- 08-narration
- 09-image-generation
generated_date: '2026-09-12'
generated_at_commit: 29b88494eb40
---

# 11 Video assembly

The final media stage produces an MP4 slideshow or a combined PCM WAV. Audio Off permits a silent MP4; Video Off with active Audio exports WAV; both Off skip the media stage.

## Trigger & preconditions

- Trigger: explicit admission starts revision export work after its complete recipe dependencies are ready. MP4 depends on selected image/audio inputs and, for burn-in, caption files; thumbnail work is independent. WAV depends on selected narration. Running or incomplete dependency bundles do not authorize early export (`slices/rebuild/{recipe-build,recipe-visual,recipe-exports,runtime-store}.ts`).
- Inputs on the project: body audio and its duration; intro and outro audio with durations when picked (scenario 08); the silence-gap setting, default 3 s (scenario 02); the current image set in slideshow order (scenarios 05, 09); format.
- Actor: the user saves edits separately from explicit rebuild. Rebuild review identifies retained, replaced and local work; Save never begins rendering (`slices/revisions/mutations.ts`, `slices/rebuild/service.ts`).

## Steps

1. When audio is enabled, build the current revision audio timeline: enabled intro audio, gap, body audio, gap, enabled outro audio; a gap is inserted only where the neighbouring segment exists; gaps are plain silence of the configured length. Historical removed entry audio remains downloadable but is excluded; supplied whole narration excludes generated intro/outro. Total length = sum of segments and gaps. Audio Off uses five seconds per image and omits the audio stream entirely.
2. Slot computation: per-image slot = total length ÷ image count; the last image absorbs frame rounding at 30 fps. One image → it fills the whole length.
3. Slideshow across the whole timeline, intro through outro, with the same images: hard cut between images; zoom alternates, odd images 100% → 122.5% zooming in, even images 122.5% → 100% zooming out, linear, centred. The 22.5% zoom travel is 1.5× the earlier 15% travel over the same image slot; it changes motion only, never narration or slideshow timing (`packages/app/src/slices/video/plan.ts`, `ffmpeg.ts`).
4. Fit every image by scaling to cover the frame and centre-cropping; no letterboxing.
5. Frame: 16:9 renders 1920×1080, 9:16 renders 1080×1920; 30 fps; mp4 container; codecs are `stack`'s. Progress reported as render percentage (scenario 01).
6. Subtitle timing, cues and files are separate local recipes within the final stage (scenario 17). Manual cue edits bypass alignment; style changes reuse unchanged timing. Burn-in rendering waits for the complete caption/font bundle (`slices/rebuild/{runtime-subtitles,runtime-store}.ts`).
7. Publish immutable MP4/WAV and render-parameter assets as one complete bundle, pinned to the admitted revision. Parameters record durations, gaps, image slots/order, zoom and frame. Current compatible owners receive the result; an incompatible later edit does not acquire older pixels or bytes (`slices/rebuild/{runtime-export,runtime-publication}.ts`, `slices/revisions/publish.ts`).

## Branches

- Video Off with Audio Generate/Provide → decode and combine intro, body and outro with the configured silence gaps into `audio.wav`, 48 kHz stereo signed 16-bit PCM. Record the plan in `render.json`; no images are needed and this does not increment the videos counter.
- Enabled subtitles with WAV → separate SRT/VTT files; burn-in is normalized to files (`slices/admission/rules.ts`, `slices/rebuild/{runtime-export,runtime-subtitles}.ts`).
- Both Audio and Video Off → the final stage is skipped; the Article download remains available.
- Intro Off → no intro segment and no leading gap; outro Off → no outro segment and no trailing gap.
- Image aspect equals the frame → no crop; differs → cover and crop.

## Unhappy paths

- FFmpeg render fails → the renderer's error shown verbatim on the video stage; no automatic encoding retry; no timeout; manual re-render per scenario 12.
- Subtitle-model preparation happens before decoding/alignment and encoding. Its fetch/body interruptions and HTTP 408/429/5xx have at most three transfer attempts with abortable one- and two-second delays and a five-minute deadline per fetch. Exhaustion names the subtitle model and three attempts, not only `terminated`. Permanent HTTP, verification and disk errors stop without retry; cancellation stops transfer/backoff. Partial attempts stay private and only the pinned length/hash can publish to cache (`packages/app/src/adapters/alignment/cache.ts:34`, `:63`).
- Caption alignment, font resolution, render or publication failure leaves retained completed revisions/media available. Unregistered prepared assets are discarded; atomic publication does not partially replace a completed media bundle (`slices/rebuild/{runtime-export,runtime-publication}.ts`, `slices/revisions/publish.ts`).
- Interrupted work follows durable revision recovery and requires explicit rebuild where the outcome is uncertain (scenario 01).
- Cancel → scenario 13.

## State transitions

- Save creates a revision with retained ready/outdated/missing work states. Explicit rebuild admits pending work; stage standings are projected from current invocation/output state. History remains immutable (`slices/revisions/mutations.ts`, `slices/rebuild/runtime-store.ts`).

## Invariants

- Narrated video length = intro + gaps + body + outro; silent video length = image count × 5 seconds.
- Every slideshow image appears exactly once, in slideshow order (scenario 09).
- The thumbnail is never in the video (scenario 09).
- Rendering reads the admitted revision snapshot; later changed images, narration or burn-in captions require a separately authorized rebuild. Reorder-only image edits reuse image generation and change assembly.

## Outcomes & side effects

- Success: one MP4 or WAV and its render parameters on the project. The previous finished export stays downloadable until its replacement succeeds.
- Failure: stage `failed` with the renderer's error.
- Videos made are counted by scenario 16 telemetry.

## Dimensions not in play

- No remote render service.
- D5 money: nothing charged.
- The renderer introduces no extra duration cap; setup validation limits the image list to 60 entries (`packages/app/src/slices/revisions/schema.ts`).
- D10 external failure: encoding is local and is not retried automatically. Downloading the free pinned subtitle model is a separate network prerequisite with the bounded recovery above; no requested subtitles are silently omitted.
- D13 notification: no channel.

## Audio-only subtitle edits

WAV and subtitle file generation have separate recipe identities. Caption text/style edits keep unchanged WAV media; files-mode MP4 retains its pixels, while burn-in requires rendering. Missing required media or render-parameter members schedules local recovery. Complete caption/font bundles must be ready before dependent rendering (`slices/rebuild/{recipe-exports,recipe-visual,recipe-work,runtime-subtitles,runtime-store}.ts`).
