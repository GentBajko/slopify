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
- Inputs on the project: body audio and its duration; intro and outro audio with durations when picked (scenario 08); the silence-gap setting, default 3 s (scenario 02); the project's seconds per image (whole seconds 1–600, default 15), zoom (0–50% in steps of 0.5, default 22.5), motion (Zoom in and out, Pan across, Mix of both or Still; default Zoom in and out, which is also what a project saved before the setting reads as) and silence at start and end (0–30 s in steps of 0.5, default 2); the current image set in slideshow order (scenarios 05, 09); format.
- Actor: the user saves edits separately from explicit rebuild. Rebuild review identifies retained, replaced and local work; Save never begins rendering (`slices/revisions/mutations.ts`, `slices/rebuild/service.ts`).

## Steps

1. When audio is enabled, build the current revision audio timeline: edge silence, enabled intro audio, gap, body audio, gap, enabled outro audio, edge silence; a gap is inserted only where the neighbouring segment exists; gaps and edges are plain silence of their configured lengths, and an edge of 0 adds nothing. Historical removed entry audio remains downloadable but is excluded; supplied whole narration excludes generated intro/outro. Total length = sum of segments, gaps and edges. Audio Off shows each image once for the seconds per image and omits the audio stream entirely.
2. Edit list: planning turns the project into a versioned JSON edit list, `{ version: 1, width, height, fps, audio, shots }`, and the renderer reads nothing else. `audio` is the timeline of step 1; each shot is `{ source: { kind: "image", path }, frames, motion }`, where motion is `{ kind: "zoom", direction: "in"|"out", percent }`, `{ kind: "pan", from, to, percent }` (points are shares 0–1 of the room the crop leaves: 0 flush left/top, 1 flush right/bottom, 0.5 centred) or `{ kind: "still" }`. Everything turns on the shot's place in the timeline, so the same project always plans the same list and a re-render is identical. Video clips as a source kind, transitions between shots and effects are reserved extension points (new optional fields or union cases); a change to what an existing field means bumps the version, and a recorded list of another version or with an unknown kind is refused with a message to re-run the video (`packages/app/src/slices/video/{edit-list,plan,motion}.ts`).
3. Shot computation: each shot lasts the seconds per image at 30 fps; the images take turns in slideshow order (1, 2, …, n, 1, 2, …) until the timeline is full, and the last shot is cut to what is left (at least one frame). A timeline shorter than one shot is a single shot.
4. Motion across the whole timeline, lead-in through tail, hard cut between shots, by shot place, not image, so an image that comes round again may move another way (`packages/app/src/slices/video/motion.ts`):
   - Zoom in and out: odd shots 100% → 100% + zoom (122.5% by default) zooming in, even shots back to 100% zooming out, linear and centred over that shot's own length (a cut last shot zooms over its shorter length). Zoom 0 makes these shots still.
   - Pan across: a fixed crop of 100% + zoom travels in a straight line over the shot, taking turns left → right, right → left, top → bottom, bottom → top, each along the centre line. A pan needs room, so it uses the zoom or 10%, whichever is more; at Zoom 0 the pans still move.
   - Mix of both: zoom and pan shots take turns, each keeping its own alternation: zoom in, pan left → right, zoom out, pan right → left, zoom in, pan top → bottom, …
   - Still: every shot shows the whole covered frame without moving.
   Zoom ends and pan positions are written into the FFmpeg zoompan expressions as decimal text built from whole thousandths, never float arithmetic; a pan's x/y are `(iw-iw/zoom)*(start±by*on/span)` with the share running only between 0 and 1. A one-frame shot holds where it starts. A still shot skips the 4× prescale (`packages/app/src/slices/video/ffmpeg.ts`).
5. Rendering: each distinct clip (one still, one motion, one length) is encoded once in its own FFmpeg run from a still pre-scaled to four times the frame; the concat demuxer then joins the clips in slot order from a list file, copying them unless captions are burned in. The prescale also gives a pan quarter-pixel steps on screen, since zoompan moves its crop in whole source pixels. One filtergraph with a chain per slot grew memory with the slot count (16 GB at 200 slots with FFmpeg 7) and a 3-hour video has over 700 slots, so the split keeps memory at one clip and every command line short enough for Windows. The clips' working directory beside the project's files is removed however the render ends (`packages/app/src/slices/video/slideshow.ts`).
6. Fit every image by scaling to cover the frame and centre-cropping; no letterboxing.
7. Frame: 16:9 renders 1920×1080, 9:16 renders 1080×1920; 30 fps; mp4 container; codecs are `stack`'s. Progress reported as render percentage (scenario 01).
8. Subtitle timing, cues and files are separate local recipes within the final stage (scenario 17). Manual cue edits bypass alignment; style changes reuse unchanged timing. Burn-in rendering waits for the complete caption/font bundle (`slices/rebuild/{runtime-subtitles,runtime-store}.ts`).
9. Publish immutable MP4/WAV and render-parameter assets as one complete bundle, pinned to the admitted revision. For an MP4, `render.json` records the settings planned from (gap, edge, seconds per image, zoom, motion), totals, output and subtitles beside `editList`, the edit list with project-relative paths; the WAV record keeps its own shape for subtitle-only reuse (`slices/video/reuse-audio.ts`). Current compatible owners receive the result; an incompatible later edit does not acquire older pixels or bytes (`slices/rebuild/{runtime-export,runtime-publication}.ts`, `slices/revisions/publish.ts`).

## Branches

- Video Off with Audio Generate/Provide → decode and combine intro, body and outro with the configured silence gaps and edge silence into `audio.wav`, 48 kHz stereo signed 16-bit PCM. Record the plan in `render.json`; no images are needed and this does not increment the videos counter.
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

- Narrated video length = edge + intro + gaps + body + outro + edge; silent video length = image count × seconds per image.
- Slideshow images cycle in slideshow order; every image appears at least once when the timeline has room for it (scenario 09).
- Changing the seconds per image, the zoom or the motion re-renders only the video; Zoom in and out adds nothing to the render fingerprint, so projects saved before the motion setting keep their videos; changing the edge silence re-exports the MP4/WAV and redoes caption timing, never narration or images (`slices/rebuild/{recipe-visual,recipe-audio,recipe-exports}.ts`).
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
