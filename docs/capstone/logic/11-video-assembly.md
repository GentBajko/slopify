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
- 17-subtitles
- 29-video-editing
- 35-audio-levelling-and-ambient
generated_at_commit: d83482c1175e
generated_date: 2026-10-02
capstone_version: 7.0.1
content_hash: 946163e0a45e
paths_covered:
  - ":(top)packages/app/src/slices/video/plan.ts"
  - ":(top)packages/app/src/slices/video/motion.ts"
  - ":(top)packages/app/src/slices/video/edit-list.ts"
  - ":(top)packages/app/src/slices/video/slideshow.ts"
  - ":(top)packages/app/src/slices/video/ffmpeg.ts"
  - ":(top)packages/app/src/slices/video/audio-export-args.ts"
  - ":(top)packages/app/src/slices/video/figure-card.ts"
  - ":(top)packages/app/src/slices/video/figure-spans.ts"
  - ":(top)packages/app/src/slices/video/run.ts"
  - ":(top)packages/app/src/slices/loudness/loudnorm.ts"
  - ":(top)packages/app/src/slices/loudness/model.ts"
  - ":(top)packages/app/src/slices/rebuild/runtime-export.ts"
  - ":(top)packages/app/src/slices/rebuild/runtime-export-inputs.ts"
  - ":(top)packages/app/src/slices/rebuild/runtime-figure-card.ts"
  - ":(top)packages/app/src/slices/rebuild/recipe-visual.ts"
  - ":(top)packages/app/src/slices/rebuild/recipe-loudness.ts"
  - ":(top)packages/app/src/slices/rebuild/recipe-build.ts"
  - ":(top)packages/app/src/slices/settings/playback.ts"
  - ":(top)packages/app/src/slices/admission/rules.ts"
  - ":(top)packages/web/src/project/body-video.tsx"
  - ":(top)packages/app/src/slices/video/pool.ts"
  - ":(top)packages/app/src/slices/video/clip-cache.ts"
  - ":(top)packages/app/src/slices/storage/layout.ts"
  - ":(top)packages/app/src/slices/storage/reconcile.ts"
  - ":(top)packages/app/src/slices/storage/files-location.ts"
  - ":(top)packages/app/src/slices/storage/delete-project.ts"
  - ":(top)packages/app/src/slices/admission/model.ts"
---

# 11 Video assembly

The final media stage produces an MP4 slideshow (`export:video`) or a combined PCM WAV (`export:wav`), and when Level the volume is on it masters the finished file to a loudness target. Audio Off permits a silent MP4; Video Off with active Audio exports WAV; both Off skip the media stage. Paths below are relative to `packages/app/src/` unless they start with `packages/`. What the edit list's cuts, transitions, Look, chapter cards and clips are belongs to scenario 29; narration levelling, pauses and the ambient bed belong to 35-audio-levelling-and-ambient.md; the whole-narration 9:16 render of a short-mode project belongs to scenario 28.

## Trigger & preconditions

- Trigger: explicit admission starts revision export work after its recipe dependencies are ready. `export:video` depends on the image recipes, the narration joins (`audio:provided` or `audio:body:concat`, plus `audio:intro`/`audio:outro` for generated narration with entries), the `level:<segment>` joins while levelling is on, `subtitles:files` for burn-in, `subtitles:timing` for a short-mode project and whatever the edit settings add (`slices/rebuild/recipe-visual.ts:128-204`, `slices/rebuild/recipe-build.ts:67-79`). `export:wav` depends on the narration and, with levelling on, the levelled joins (`slices/rebuild/recipe-exports.ts:73-92`). An unresolved recipe (no image keys, or an uploaded ambient bed not yet in the content) is not runnable (`slices/rebuild/recipe-visual.ts:198-202`).
- The piece runner skips a piece already `done`, and returns `held` whenever `maySubmit` is false (`slices/rebuild/runtime-export.ts:41-47`, `:150`). The recipe the piece was admitted with must still be in the saved plan with the same fingerprint, not deferred or unresolved (`exportSnapshot`, `slices/rebuild/runtime-export-inputs.ts:30-52`).
- Project inputs and bounds (`slices/admission/rules.ts:38-51`, checked only where used, `:184-203`):

| Setting | Range | Default |
|---|---|---|
| Silence gap between entries and body | 0–30 s | Settings → General value, shipped 3 s (`slices/settings/model.ts:216-217`, `slices/settings/playback.ts:28`) |
| Edge silence at start and end | 0–30 s, 0.5 s steps (checked unless Audio Off) | 2 s |
| Seconds per image | whole 1–600 (checked when Video Generate) | 15 |
| Zoom | 0–50 %, 0.5 steps (checked when Video Generate) | 22.5 |
| Motion | Zoom in and out, Pan across, Mix of both, Still (`motionStyleLabels`, `:54-59`) | Zoom in and out |
| Level the volume (model: 35-audio-levelling-and-ambient.md) | video −24…−10 LUFS, audio files −28…−14 LUFS, 0.5 dB steps (`slices/loudness/model.ts:57-61`, `:123-131`) | on, −14 / −18 LUFS (`slices/loudness/model.ts:32-38`) |

- Settings → General (`GET`/`PUT /api/settings`, `packages/app/src/edge/http/settings.ts:78-93`) stores the default silence gap, appearance and the Level-the-volume default as separate key/value rows; an unreadable row falls back to the default and logs `settings.invalid` (`slices/settings/playback.ts:36-90`). A `PUT` without `loudness` keeps the saved value (`packages/app/src/edge/http/settings.ts:60-67`, `:81-83`). A project keeps the values it was started with.
- The user saves edits separately from rebuild; Save never begins rendering (`slices/revisions/mutations.ts`, `slices/rebuild/service.ts`).

## Steps

1. **Audio timeline** (`revisionAudio`, `slices/rebuild/runtime-export-inputs.ts:53-115`). Audio Off → no timeline. Otherwise the ready, selected `audio_body` (and, for generated narration with an entry picked, `audio_intro`/`audio_outro`) are read; with levelling on and generated narration, the `audio_levelled` output of `level:<segment>` is read instead (`:65-77`). Duration is the output's recorded `durationMs`, else a full-decode probe (`probeDurationMs`, `slices/video/ffmpeg.ts:669`). `audioTimeline` (`slices/video/plan.ts:305-338`) lays out edge, intro, gap, body, gap, outro, edge; a gap only where the neighbouring segment exists, and a gap or edge shorter than the minimum (one frame, 1/30 s, for video; one sample, 1/48000 s, for WAV; `runtime-export-inputs.ts:113`) is left out.
2. **Speaker levelling**: when a multi-voice run is levelled line by line, the body is replaced by its line-levelled copy in a `lines-` working folder before planning (`slices/rebuild/runtime-export.ts:67-76`); scenario 35.
3. **Plan** (`planRender`, `slices/video/plan.ts:150-235`) from format, gap, edge, seconds per image, zoom, motion, the three audio segments, the slideshow images, the edit settings (`exportEdit`, scenario 29) and the ambient bed (`exportBed`, `slices/rebuild/runtime-export-bed.ts:13`, scenario 35) (`slices/rebuild/runtime-export.ts:100-119`). Slideshow images are the revision's `imageOrder`, each resolved to its selected ready `image:<key>` output (`slideshowImages`, `:258-274`).
   - Length: narrated = sum of timeline segments (after the bed's tail, `withTail`, `plan.ts:240-246`); silent = image count × seconds per image (`plan.ts:162-166`). Total frames = max(1, round(seconds × 30)).
   - Frame: 16:9 → 1920×1080, 9:16 → 1080×1920, 1:1 → 1080×1080, 30 fps (`plan.ts:23-29`).
   - Every-N shots: each shot lasts round(seconds per image × 30) frames, the last cut to what is left; a timeline shorter than one shot is one shot (`everyLengths`, `plan.ts:342-345`). Following the narration is scenario 29.
   - Images take turns in slideshow order, starting over after the last; motion goes by the shot's place, not the image; a clip in an image's place plays with motion `still` (`shots`, `plan.ts:351-368`).
   - Motion (`motionFor`, `slices/video/motion.ts:28-57`): Zoom alternates in/out at the zoom rounded to half steps (0 → still); Pan cycles left→right, right→left, top→bottom, bottom→top at max(zoom, 10 %); Mix alternates zoom and pan, each keeping its own alternation; Still never moves.
   - Figure cards ("Show tables and figures on screen", below) are placed as still shots and the images take turns in the stretches around them, counting on across them (`aroundFigures`, `plan.ts:406-433`).
   - The edit list is `{ version: 1, width, height, fps, audio, shots }` plus optional `look`, `cards`, `cardFont`, `cardColor` and `bed` (`slices/video/edit-list.ts:128-145`). Each extension is a new optional field or union case; a meaning change bumps `editListVersion` (`edit-list.ts:13-24`). `readEditList` refuses another version or an unparsable list with a re-render instruction (`edit-list.ts:253-266`); it is called only by tests.
4. **Figure cards** (on when narration is Generate with Describe tables and figures and an LLM, Video Generate and `showFigures`, `usesFigureCards`, `slices/admission/rules.ts:621-629`). Each described block gets a `figure:card:<n>` step (operation `figure-card-v1`) in the video's format, plus 9:16 when a 16:9 or 1:1 project makes Shorts (`slices/rebuild/recipe-describe.ts:121-152`, `:128-129`). The step draws one PNG per format with the bundled ffmpeg: solid ground, the article's own uploaded picture fitted for a figure, and the table/code/equation/caption set in ASS in the caption font (or a covering fallback for the language), the brand kit's title colour as accent (`slices/rebuild/runtime-figure-card.ts:35-110`, frames 1920×1080, 1080×1920 and 1080×1080 at `:33`; `slices/video/figure-card.ts:8-37`). Text never goes below 2.4 % of the frame's short side; table rows or code lines that do not fit at that size are left out and counted (`figure-card.ts:60-68`, `:221-240`, `:327-341`). At export each card's describe-step answer is found in the word timing by its first and last four tokens, 75 % of which must match (`passageSpans`, `slices/video/figure-spans.ts:13-47`); a card not found is left out (`figureShots`, `slices/rebuild/runtime-export-edit.ts:220-258`). A card shows from 0.3 s before its description to 0.3 s after; overlapping cards start where the previous ends; a gap under 1 s between cards or at either end of the video is given to the card (`figureFrames`, `plan.ts:143-148`, `:379-401`). The export fingerprint gains `["figure-cards-v1", …]` (`slices/rebuild/recipe-edit.ts:87-91`).
5. **Render clips** (`renderSlideshow`, `slices/video/slideshow.ts:60-248`). `slideshowClips` names each distinct clip `c<N>.mp4` by a key of source, motion, frames and, for part of a shot, transition or a clip carrying a card or atmosphere, its place (`slices/video/ffmpeg.ts:79-132`). Each clip is one FFmpeg run with a single picture input (`segmentArgs`, `ffmpeg.ts:155-208`): the still's first frame is scaled to cover and centre-cropped (never letterboxed) at 4× the frame, then `zoompan` for `d` frames (`pictureChain`, `ffmpeg.ts:221-270`); a still that does not move skips the 4× prescale (`:251-252`). A video clip is looped, slowed to at most half speed to fill its shot, then looped (`slowdown`, `ffmpeg.ts:272-281`). Zoom ends and pan travel are decimal text from whole thousandths (`zoomRange`/`decimal`, `plan.ts:46-59`; `zoompan`/`travel`, `ffmpeg.ts:506-538`); a pan's x/y are `(iw-iw/zoom)*(start±by*on/span)`; a one-frame shot holds where it starts. Clips encode with libx264 yuv420p (`ffmpeg.ts:491`); clips that will be re-encoded under burned-in captions use CRF 16 (`:134-137`). The clips' `render-` working folder beside the project is removed however the render ends (`slideshow.ts:80`, `:245-247`). The clips render several at a time (`inPool`, `slices/video/pool.ts:33-66`; `slideshow.ts:121-182`): `renderJobs` gives each run four cores and 3 GB of half the memory (a container's limit when lower), at most eight, at least one (`pool.ts:8-27`); the first failure aborts the runs still going and is the error reported. For the video export the clips of the project's last render are kept in `Projects/.render-cache/<projectId>` (`renderCacheDir`, `slices/storage/layout.ts:12-16`, passed by `slices/rebuild/runtime-export.ts:219`; `slices/video/clip-cache.ts:25-143`, used at `slideshow.ts:134-180`, `:232-238`): each clip is named by the SHA-256 of the ffmpeg binary, its arguments without the output path, every input file's path, size and modification time, and its chapter-card script and font; a clip found there is hard-linked (else copied) into the working folder instead of encoded, and a newly encoded clip is linked in as soon as it is done, so a canceled render keeps what it finished. After a finished render the project keeps only that render's clips, and other projects' caches go, least recently rendered first, until all fit in 30 GB and the disk keeps min(20 GB, a tenth of the disk) free; below that floor the project's own cache goes too. Reconcile skips hidden entries (`slices/storage/reconcile.ts:57`), moving the files skips `.render-cache` (`slices/storage/files-location.ts:418`), and deleting the project removes its cache (`slices/storage/delete-project.ts:57`). A cache that cannot name or give back a clip is logged as `video.cache` and the clip is encoded (`slideshow.ts:131-158`).
6. **Master the sound** (Level the volume on and a timeline exists). The export picks its goal with `masterGoal(config, "video")` for an MP4 and `"audioFiles"` for the WAV (`slices/rebuild/runtime-export.ts:160-162`, `slices/loudness/model.ts:74-87`). For an MP4, while the clips encode, the narration segments, silences and bed are mixed alone into `mix.wav` in the render folder (`audioMixArgs`, `ffmpeg.ts:370-386`), `masterFile` writes `master.wav` at 44.1 kHz stereo (`slideshow.ts:57`, `:259-264`), and that one `body` segment playing `master.wav` with no bed is what the sound step encodes (`renderSound`, `slideshow.ts:252-280`). The two-pass measure-and-gain method (`levelFile`/`masterFile`, `slices/loudness/loudnorm.ts:200-227`), the LUFS targets, true-peak ceilings and encode headroom are 35-audio-levelling-and-ambient.md's.
7. **Join** (`joinArgs`, `ffmpeg.ts:390-419`): the concat demuxer reads `slides.ffconcat` (`concatList`, `ffmpeg.ts:298`; `slideshow.ts:184-185`). The sound is made on its own run while the picture renders (`renderSound`, `slideshow.ts:108-114`, `:252-280`): audio segments brought to 44.1 kHz stereo float and concatenated, silences from `anullsrc` (`audioMix`, `ffmpeg.ts:314`), with a bed and no master the bed mixed under the narration (scenario 35), encoded to AAC in `sound.m4a` (`audioMixArgs(…, "aac")`, `ffmpeg.ts:370-386`); the join maps that file and copies its audio (`ffmpeg.ts:398`, `:409-411`). The sound and the picture stop each other on failure or cancel, and the first failure is the one reported (`slideshow.ts:93-107`, `:217-221`). Without burn-in the video stream is copied; with burn-in it is re-encoded through `ass=filename=subtitles.ass:fontsdir=fonts`, after any podcast speaker-panel portraits are overlaid (scenario 34). `+faststart`. With burn-in and a timeline of two minutes or more, the picture is burned in parts instead (`burnParts`, `slideshow.ts:292-327`; `leastPartFrames` = 1,800 frames, `:54`): at most as many parts as render runs, each a minute or more, cut at the clip boundary nearest an equal share; each part is its own run (`burnPartArgs`, `ffmpeg.ts:421-455`; `burnIn`, `:457-478`; `slideshow.ts:185-216`) that reads its clips from `pN.ffconcat`, overlays the portraits, moves its frames to their place on the video's timeline for the `ass` filter (`setpts=PTS+start/(fps*TB)`) and back after it, restores the frame rate and encodes with the join's codec settings; the parts run side by side, then the join copies them with the sound as it copies the clips without captions.
8. **Measure** the finished MP4 (after AAC) or WAV: `masterReport` records `{ target, integrated, truePeak }` rounded to 0.1 (`loudnorm.ts:230-241`, `slideshow.ts:240-244`); the project page shows it as "Mastered to −14 LUFS: measured …, peaks … dBTP" (`masterText`, `slices/loudness/model.ts:224`, `packages/web/src/project/body-video.tsx:157`).
9. **Progress**: `stage.progress` on stage `video` in tenths of a percent of elapsed render time over the video's length (`slices/rebuild/runtime-export.ts:151-159`); clip frames weigh 4, a copying join 0.05, a burn-in join (or its parts together) 1, plus 0.05 for joining the parts; runs side by side add their own elapsed time, and a reused clip counts as done (`slideshow.ts:50-51`, `:71-79`, `:119-124`, `:144-148`).
10. **Publish** (`slices/rebuild/runtime-export.ts:226-248`): the sealed `video.mp4` (role `video`) or `audio.wav` (role `audio_export`) with duration and meta `subtitlesMode` (`burn-in`, `files` when both SRT and VTT are ready, else `off`, `:87-92`), edit warnings and `master`; `render.json` (role `render_params`); and the ready caption files re-published as retained outputs. For MP4, `render.json` is the plan (gap, edge, seconds per image, zoom, motion, totals) with `output`, `editList` with project-relative paths, `subtitles`, `speakerPortraits`, `videoEdit` and `warnings` when present (`:139-149`); for WAV it is `{ sampleRate: 48000, channels: 2, codec: "pcm_s16le", gapSeconds, edgeSeconds, totalSeconds, audio, output }` (`:126-138`). Then `stage.completed` for stage `video` is counted (`:249`).

## Branches

- **Video Off, Audio on → WAV** (`slices/rebuild/runtime-export.ts:164-209`): segments decoded to 48 kHz stereo s16 and concatenated (`audioExportArgs`, `slices/video/audio-export-args.ts:5-43`). With levelling on the mix goes to `<asset>.mix.wav`, is mastered to the audio-files goal at 48 kHz stereo, re-encoded to `pcm_s16le`, measured, and both temporaries are removed in `finally`. No images are read and no edit list is planned.
- **Level the volume off**, or Audio Off → `masterGoal` undefined: no mix/master pass, the join plays the segments as they are, no `master` meta, no `loudness-v1` fingerprint value (`slices/loudness/model.ts:145-151`, `slices/rebuild/recipe-loudness.ts:64-83`). Uploaded narration has no levelled join but is still mastered (`runtime-export-inputs.ts:57-66`).
- **Short-mode project** (`mode: "short"`) → `executeShortExport` renders the whole narration through the Shorts renderer, mastered to the video goal (`slices/rebuild/runtime-export.ts:61-62`, `slices/rebuild/runtime-export-short.ts:47`); the export fingerprint adds `["short-v1", fontId, subjectOf(config), timing]`, the kept subject, so a rename does not re-render it (`packages/app/src/slices/admission/model.ts:285-290`), and never carries a bed or edit values (`slices/rebuild/recipe-visual.ts:129-137`, `:178-182`); scenario 28.
- **Captions**: Off → no caption work and mode `off`; files → SRT/VTT beside the media, MP4 pixels unaffected; burn-in → `captionDirectory` copies the selected `subtitle_ass` and `subtitle_font` into a `render-` folder the join runs in (`slices/rebuild/runtime-export.ts:275-306`). Enabled captions with WAV are files only (`slices/admission/rules.ts:229-231`). Caption timing and files are scenario 17.
- **Caption or style edits with unchanged narration**: `export:wav` and files-mode `export:video` keep their bytes; `subtitles:files` re-publishes the retained media with updated `subtitlesMode`/`subtitleOmissions` meta (`slices/rebuild/runtime-subtitles.ts:332-353`). Burn-in puts the caption fingerprint into the video's (`slices/rebuild/recipe-visual.ts:164`), so it re-renders.
- Intro Off → no intro segment and no leading gap; outro Off → no outro segment and no trailing gap. Uploaded whole narration never gets generated intro/outro (`runtime-export-inputs.ts:101-109`).
- Image aspect equals the frame → no crop; differs → cover and crop.
- Both Audio and Video Off → no export recipe; the Article download remains.

## Unhappy paths

- FFmpeg exits non-zero → "The audio/video export failed (ffmpeg exited with code N: <last 20 stderr lines>)…" with a disk-space and diagnostics instruction (`slices/video/ffmpeg.ts:567-569`, `:711-722`); cannot spawn → reinstall or fix `SLOPIFY_FFMPEG` (`:639-646`). No automatic encoding retry and no timeout; manual re-render per scenario 12.
- No bundled ffmpeg and no `SLOPIFY_FFMPEG` → boot refuses with a reinstall instruction; PATH is never used (`resolveFfmpeg`, `ffmpeg.ts:27-45`).
- Loudness measurement prints no JSON → "Slopify couldn't measure the loudness of the narration…" naming Edit project → Pauses and volume (`slices/loudness/loudnorm.ts:136-139`).
- Levelled join missing while levelling is on → the export names the Narration stage and the setting to turn off (`runtime-export-inputs.ts:78-81`); body missing → "The narration audio isn't finished yet…" (`:95-98`); unreadable or zero duration → regenerate or re-upload (`:88-91`).
- A slideshow image's output missing → names Images → make it again (`slices/rebuild/runtime-export.ts:268-271`); an empty image list at planning → internal error naming Edit project → Images (`slices/video/plan.ts:151-156`). Burn-in without a ready caption file or font → names Render the video again or choose the font again (`runtime-export.ts:286-289`). WAV export with narration Off → names Edit project (`:57-60`).
- Cancel/abort → the ffmpeg child is `SIGKILL`ed and the promise rejects "the render was canceled" (`ffmpeg.ts:633-655`); prepared assets, the `render-`, `lines-` and caption folders are discarded in `finally` (`runtime-export.ts:251-255`, `slideshow.ts:245-247`). Cancel semantics: scenario 13.
- Any render or publication failure leaves the previous completed export available; atomic publication does not partially replace a bundle (`slices/rebuild/runtime-publication.ts`, `slices/revisions/publish.ts`). Interrupted work follows revision recovery (scenario 01).

## State transitions

- `revision_work_pieces` for `export:video`/`export:wav`: pending → running → `done` on publication; `held` returns leave it pending; failure marks the stage failed with the error text. A `done` piece is not re-executed (`runtime-export.ts:41-46`). Save creates a revision with retained ready/outdated/missing states; explicit rebuild admits pending work (`slices/revisions/mutations.ts`, `slices/rebuild/runtime-store.ts`). History is immutable.

## Invariants

- Narrated length = edge + intro + gaps + body + outro + edge (plus any bed tail); silent length = image count × seconds per image (`plan.ts:159-166`).
- The same project plans the same edit list: motion depends only on shot place (`motion.ts:22-27`).
- Fingerprint stability (`slices/rebuild/recipe-visual.ts:159-188`): `export:video` values are format, gap, image fingerprints, audio fingerprint, burn-in caption fingerprint or null, seconds per image, zoom, the motion style only when not `zoom`, `"slideshow-zoom-v2"`, then only when in use `["video-edit", …]`, `["short-v1", …]`, the bed and `["loudness-v1", levelled joins, LUFS, true-peak ceiling]`. A project without those features keeps its fingerprint and its video. Changing only the volume target re-masters exports; the narration is never re-joined (piece level fixed at −20 LUFS, `slices/loudness/model.ts:50-55`).
- Seconds per image, zoom and motion re-render only the video, never an image. Edge-silence changes re-export the MP4/WAV and redo caption timing, never narration or images (`slices/rebuild/recipe-exports.ts:56-62`).
- The thumbnail is never in the video (`slideshowImages` reads `image:<key>` only).
- Rendering reads the admitted revision snapshot; later changes need a separately authorized rebuild.
- Every ffmpeg call is an argument array, never a shell string (`ffmpeg.ts:10-12`).

## Outcomes & side effects

- Success: one MP4 or WAV, its `render.json`, re-published caption files, optional `master` report; the previous export stays downloadable until the replacement publishes.
- Failure: stage `failed` with the error text.
- `stage.completed` for stage `video` is counted for both MP4 and WAV exports, and the usage page and collector count every such event as a video made (`slices/telemetry/usage.ts:64-67`, scenario 16).
- `packages/app/src/slices/video/run.ts:36` (`renderVideo`, the pre-revision stage runner) and its helpers `audio-inputs.ts`, `audio-export.ts`, `write-export.ts` and `slices/subtitles/prepare.ts` are referenced only by tests; the revision recipes above are the live path.

## Dimensions not in play

- No remote render service; ffmpeg is the bundled binary or `SLOPIFY_FFMPEG`.
- D5 money: rendering and mastering charge nothing; animated images do (scenario 29); figure-card descriptions are LLM calls (scenario 08).
- The renderer adds no duration cap. The revision image order holds at most 240 images (`slices/revisions/schema.ts:48`, `slices/images/scale.ts:41`); provided images at most 60 (`slices/admission/rules.ts:303-306`).
- D10 external failure: encoding is local and not retried automatically.
- D13 notification: no channel of its own; run notifications are 39-notifications-and-live-events.md.
