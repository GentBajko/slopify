---
scenario: audio-levelling-and-ambient
screens:
- 02-play
- 03-project
- 08-settings
depends_on:
- 08-narration
- 11-video-assembly
- 12-reruns-and-edits
- 28-shorts
generated_at_commit: 54f5cb4c1dab
generated_date: 2026-09-30
capstone_version: 7.0.1
content_hash: 166f41092499
paths_covered:
  - ":(top)packages/app/src/slices/loudness/**"
  - ":(top)packages/app/src/slices/video/ambient-*.ts"
  - ":(top)packages/app/src/slices/video/audio-*.ts"
  - ":(top)packages/app/src/slices/video/reuse-audio.ts"
  - ":(top)packages/app/src/slices/video/plan.ts"
  - ":(top)packages/app/src/slices/video/ffmpeg.ts"
  - ":(top)packages/app/src/slices/video/slideshow.ts"
  - ":(top)packages/app/src/slices/settings/playback.ts"
  - ":(top)packages/app/src/slices/rebuild/recipe-loudness.ts"
  - ":(top)packages/app/src/slices/rebuild/recipe-lines.ts"
  - ":(top)packages/app/src/slices/rebuild/recipe-visual.ts"
  - ":(top)packages/app/src/slices/rebuild/runtime-export.ts"
  - ":(top)packages/app/src/slices/rebuild/runtime-export-bed.ts"
  - ":(top)packages/app/src/slices/rebuild/runtime-export-inputs.ts"
  - ":(top)packages/app/src/slices/admission/rules.ts"
  - ":(top)packages/app/src/slices/admission/start.ts"
  - ":(top)packages/app/src/slices/channels/runs.ts"
  - ":(top)packages/app/src/slices/revisions/mutations.ts"
  - ":(top)packages/app/src/slices/revisions/mutation-assets.ts"
  - ":(top)packages/app/src/slices/play-drafts/convert.ts"
  - ":(top)packages/app/src/slices/schedules/service.ts"
  - ":(top)packages/app/src/slices/rebuild/recipe-validation.ts"
  - ":(top)packages/app/src/slices/rebuild/preview-details.ts"
  - ":(top)packages/app/src/slices/video/edit-list.ts"
  - ":(top)packages/app/src/edge/http/settings.ts"
  - ":(top)packages/web/src/project/edit-sound-and-scale.tsx"
  - ":(top)packages/web/src/video/loudness-controls.tsx"
  - ":(top)packages/web/src/video/ambient-bed-controls.tsx"
  - ":(top)packages/web/src/play/loudness.tsx"
  - ":(top)packages/web/src/play/ambient-bed.tsx"
  - ":(top)packages/web/src/channels/ambient-bed-kit.tsx"
---

# 35 Audio levelling and ambient bed

"Level the volume" (the loudness settings, their app-wide default, the two-pass measure-and-gain mechanism shared by pieces and masters, which output each export plays) and the ambient sound bed under the long video (built-in noise beds or an uploaded file, level, fade-in, tail, ducking). Per-piece levelling before the join, line-by-line levelling of multi-voice bodies and sentence/paragraph pauses are specified in `08-narration.md` (Steps 12, Branches → Multiple voices, Sentence pauses); the export flow that masters the finished MP4/WAV (where the master runs in the render) belongs to `11-video-assembly.md`; the Shorts' background music and its ducking to `28-shorts.md`.

## Trigger & preconditions

- **App-wide default.** Settings → General's "Level the volume for new runs" (`packages/web/src/routes/settings.tsx:799`) saves through `PUT /api/settings` (`packages/app/src/edge/http/settings.ts:79`); `GET /api/settings` reads it (`settings.ts:78`). Stored as the `settings` row `loudness` (`packages/app/src/slices/settings/playback.ts:26`); default `{ enabled: true, videoLufs: -14, audioFilesLufs: -18 }` (`packages/app/src/slices/loudness/model.ts:34`, `packages/app/src/slices/settings/model.ts:219`). A client that omits `loudness` keeps the saved value (`settings.ts:83`).
- **Per run.** Play → Video and style carries the switch and volumes (`packages/web/src/play/loudness.tsx:15`); the draft converts through `loudnessOfForm` (`packages/app/src/slices/play-drafts/convert.ts:374`): absent form fields fall back to Settings' default, a disabled switch leaves `config.loudness` absent (`model.ts:168`). The quick-short onboarding run takes `loudnessOfDefault` (`packages/app/src/edge/http/onboarding.ts:171`). Edit project → Pauses and volume edits `config.loudness` on a saved project (`EditLoudness`, `packages/web/src/project/edit-sound-and-scale.tsx:76`); a project saved before the setting shows it off.
- **Active** only when `config.loudness` is set and audio is not Off (`usesLoudness`, `model.ts:146`).
- **Ambient bed.** Play → Video and style → Ambient sound (`packages/web/src/play/ambient-bed.tsx:9`), Edit project → Inputs → Ambient sound (`EditAmbientBed`, `edit-sound-and-scale.tsx:39`), or the channel's Brand kit → Ambient sound (`packages/web/src/channels/ambient-bed-kit.tsx:14`). Active only when `config.ambientBed` is set, the run is not short-only, video is Generate and audio is not Off (`usesAmbientBed`, `packages/app/src/slices/video/ambient-bed.ts:58`).

## Steps

1. **Volume control → LUFS.** The control is dB from the recommended level (video −14 LUFS, audio files −18 LUFS), range −10 to +4 dB in 0.5 dB steps (`model.ts:32`–`:61`). `lufsOfDb` = recommended + dB, `dbOfLufs` = LUFS − recommended, both rounded to 2 places (`model.ts:98`–`:104`); percent = round(10^(dB/20)·100) (`model.ts:108`); typed values are snapped to the step and clamped (`snapDb`, `model.ts:117`). Labels read "0 dB (recommended, −14 LUFS)" or "−6 dB (50%, −20 LUFS)" (`loudnessLabel`, `model.ts:180`).
2. **Validation.** `loudnessFields` (`model.ts:133`) checks both targets; the message names Play → Video and style, Edit project → Pauses and volume, or Settings → General (`model.ts:130`). It runs at admission (`packages/app/src/slices/admission/rules.ts:167`), on a revision edit (`packages/app/src/slices/rebuild/recipe-validation.ts:31`) and on Settings save (`playback.ts:63`).
3. **Piece levelling** (beside each generated join, `level:<segment>`, operation `level-narration-v1`, fingerprint adds `["piece-level-v1", -20, -2]`) is `08-narration.md` Step 12; recipe at `packages/app/src/slices/rebuild/recipe-loudness.ts:29`, planned only for generated narration (`packages/app/src/slices/rebuild/recipe-audio.ts:209`).
4. **Measure** (first pass, `measure`, `packages/app/src/slices/loudness/loudnorm.ts:118`): ffmpeg `loudnorm=I=<lufs>:TP=<peak>:LRA=11:print_format=json` into a null sink; the last JSON block on stderr is parsed, `-inf` read as −∞ (`loudnorm.ts:46`, `:92`). A file is measurable when its integrated loudness is finite and above −70 LUFS (`loudnorm.ts:36`, `:87`).
5. **Gain** (second pass, `normalizeFile`, `loudnorm.ts:154`): the channel layout is set before measuring (mono or stereo); the filter is `volume=(target − integrated)dB`, plus, when `truePeak + gain` exceeds the ceiling, `aresample=192000,alimiter=limit=10^(ceiling/20):attack=5:release=50:level=false`, then `aresample=<rate>` (`gainFilter`, `loudnorm.ts:72`). An unmeasurable file only resamples. Output is 32-bit float WAV.
6. **Correction** (`levelFile`, `loudnorm.ts:200`): the written file is measured again; when it is more than 0.2 LU from the target, it is normalised once more and replaced (`loudnorm.ts:195`, `:209`).
7. **Master goal** (`masterGoal`, `model.ts:74`): target `video` → `videoLufs` with ceiling −1.5 dBTP; `audioFiles` → `audioFilesLufs` with ceiling −3 dBTP; each ceiling lowered by 1 dB of encode headroom (`model.ts:42`–`:48`), so masters aim at −2.5 and −4 dBTP. Exports fingerprint `["loudness-v1", <levelled joins' identities>, lufs, truePeak]` (`masterPlan`, `recipe-loudness.ts:64`). `masterFile` is `levelFile` at the goal (`loudnorm.ts:219`); `masterReport` measures the finished, encoded file and rounds to 0.1 (`loudnorm.ts:230`).
8. **Which files are mastered to what.**
   - Long video: the sound (with the bed) is mixed alone to WAV (`audioMixArgs`, `packages/app/src/slices/video/ffmpeg.ts:369`), mastered at 44.1 kHz stereo, and the join plays that one file with the bed removed from the edit list (`packages/app/src/slices/video/slideshow.ts:46`, `:108`–`:129`); target `video` (`packages/app/src/slices/rebuild/runtime-export.ts:162`).
   - Audio-only WAV (video Off): concat to WAV, master at 48 kHz stereo, re-encode to 16-bit PCM (`runtime-export.ts:163`–`:202`); target `audioFiles`.
   - Shorts: target `video` (`packages/app/src/slices/rebuild/runtime-shorts.ts:339`, `packages/app/src/slices/rebuild/runtime-export-short.ts:47`).
   - MP3/M4B listening files: mixed once, mastered at 44.1 kHz stereo, both encoded from the master (`packages/app/src/slices/rebuild/runtime-voices.ts:93`–`:114`); target `audioFiles`.
   Each writes the measured `MasterReport` shown as "Mastered to −14 LUFS: measured …, peaks … dBTP" (`masterText`, `model.ts:224`; `packages/web/src/project/body-video.tsx:150`).
9. **What an export plays** (`revisionAudio`, `packages/app/src/slices/rebuild/runtime-export-inputs.ts:53`): with levelling on and audio Generate, the selected ready `audio_levelled` output of `level:<segment>` for body/intro/outro; otherwise the plain `audio_body`/`audio_intro`/`audio_outro`. Word timing, description and the shorts' pick read the plain joins (`runtime-export-inputs.ts:57`). A multi-voice body is additionally levelled line by line during the export when `linesLevelled` (voices + loudness + Generate, `packages/app/src/slices/rebuild/recipe-lines.ts:9`; used at `runtime-export.ts:67`); rules in `08-narration.md`.
10. **Ambient bed settings** (`AmbientBedSettings`, `ambient-bed.ts:17`): source `rain`, `fire`, `wind` or `upload` (labels Rain, Fireplace, Wind, My own file, `ambient-bed.ts:35`); `levelDb` whole dB −40 to −6 (default −18); `fadeInSeconds` 0–30 in 0.5 steps (default 3); `tailSeconds` 0–30 in 0.5 steps (default 6) (`ambient-bed.ts:43`–`:51`, `ambientBedProblems` `:73`). A channel brand kit holds built-in sources only (`channelAmbientBedSchema`, `packages/app/src/slices/video/ambient-bed-schema.ts:14`; `packages/app/src/slices/channels/schema.ts:40`).
11. **Channel default.** A run using its channel's brand kit whose form never touched Ambient sound takes the channel's bed; "None" keeps none; `useBrandKit === false` skips the brand kit (`packages/app/src/slices/channels/runs.ts:49`, `:68`–`:71`).
12. **Uploaded bed file.** Staged on Play as `provided.ambientBed` (audio kind, `convert.ts:323`); at start it is copied into the project as an asset (`attachAmbientBed`, `packages/app/src/slices/admission/start.ts:212`) and named by the first revision's `content.ambientBed` (`start.ts:132`). Edit project offers `upload` only while the project already has one; a new file is chosen on Play (`edit-sound-and-scale.tsx:37`, `:53`).
13. **Plan.** With a bed and narration, the audio timeline is extended with `withTail`: the trailing edge silence is raised to `tailSeconds` when shorter, or an edge segment of `tailSeconds` is appended (`packages/app/src/slices/video/plan.ts:159`, `:239`). The edit list's `bed` records source, `levelDb`, `fadeInSeconds`, `fadeOutAt` = end of the last spoken segment, `fadeOutSeconds` = `tailSeconds` (`plan.ts:218`–`:227`, `:248`; `packages/app/src/slices/video/edit-list.ts:114`).
14. **Bed source at export** (`exportBed`, `packages/app/src/slices/rebuild/runtime-export-bed.ts:13`): a built-in bed becomes `{ kind: "noise", preset }`; an upload is looked up in `project_assets`, probed for duration, and becomes `{ kind: "file", path }`.
15. **Mix** (`bedInputs`/`bedChains`, `packages/app/src/slices/video/ambient-mix.ts:49`, `:65`; wired at `ffmpeg.ts:343`–`:363`). Built-in beds are ffmpeg `anoisesrc` with fixed seeds: rain pink noise band-passed 600–9,000 Hz; wind brown noise 60–500 Hz with 0.15 Hz tremolo, −1 dB; fire brown noise 80–800 Hz with 6 Hz tremolo, −3 dB, plus velvet crackle 1,500–6,000 Hz at −22 dB (`ambient-mix.ts:28`–`:46`). An uploaded file is looped (`-stream_loop -1`) and trimmed to the video (`ambient-mix.ts:50`). Layers are mixed without normalisation, set to `levelDb`, faded in over `fadeInSeconds` (none at 0) and faded out from `fadeOutAt` over max(0.25 s, tail) (`ambient-mix.ts:80`–`:87`). The narration is split into voice and key; the bed is ducked by `sidechaincompress=threshold=0.02:ratio=8:attack=40:release=900:makeup=1` keyed by the voice, then mixed with the voice by `amix … normalize=0`, the narration at full level (`ambient-mix.ts:21`, `:88`–`:91`). The bed goes into the master when levelling is on (step 8).
16. **Fingerprint.** The long video's render adds `["ambient-bed-v1", source, levelDb, fadeInSeconds, tailSeconds, uploadAssetId|null]` only when a bed is used; shorts never add it (`ambientBedValues`, `packages/app/src/slices/rebuild/recipe-visual.ts:136`, `:263`).

## Branches

- **Levelling off**: no `level:*` steps, exports play the plain joins, no master, no fingerprint values (`recipe-loudness.ts:34`, `:70`).
- **Uploaded narration** (audio Provide): never piece-levelled; the export plays the plain join and only the master applies (`runtime-export-inputs.ts:58`, `:66`).
- **Short-only run**: no bed (`ambient-bed.ts:65`); the Shorts renderer's music is its own (`28-shorts.md`).
- **Video Off**: no bed; the audio-only WAV stays narration alone (`ambient-bed.ts:5`, `:66`).
- **Bed set with Video or Audio Off**: the draft keeps the form but checks and applies nothing (`convert.ts:193`–`:198`, `rules.ts:573`).
- **Tail vs edge silence**: the tail plays over the silence already after the narration; the video grows only by `tailSeconds − edgeSeconds` when positive (`plan.ts:243`). `ambientTailExtension` computes the same number (`ambient-bed.ts:112`) and has no caller in `packages/app/src` or `packages/web/src`.
- **Scheduled runs** refuse a template whose ambient bed is an uploaded file (`unsupported-media`, `packages/app/src/slices/schedules/service.ts:237`).
- **Pauses**: sentence/paragraph pause minimums live beside Level the volume in Play and Edit project (`EditPauses`, `edit-sound-and-scale.tsx:113`); their rules are `08-narration.md` (Sentence pauses). Pauses are applied to the levelled copies when levelling is on (`08-narration.md`).
- **Silence gap** (Settings → Playback, whole seconds 0–30, default 3, `playback.ts:28`, `packages/app/src/slices/admission/rules.ts:41`, `settings/model.ts:217`) spaces intro/body/outro in the timeline; its use is `11-video-assembly.md`.

## Unhappy paths

- **Loudness out of range** at admission, edit or Settings save: field error with the range message (`model.ts:123`); Settings returns `400` "These settings cannot be saved yet…" with fields (`settings.ts:85`). An invalid stored row reads as the default and logs `settings.invalid` (`playback.ts:77`).
- **ffmpeg prints no measurement**: "Slopify couldn't measure the loudness of the narration… turn off Level the volume in Edit project → Pauses and volume, then use Download diagnostics…" (`loudnorm.ts:136`).
- **Levelled join not finished** when an export runs: "The levelled narration isn't finished yet, so the sound can't be exported at an even volume…" (`runtime-export-inputs.ts:78`).
- **Piece too quiet or short**: kept as is and counted as skipped in the report (`packages/app/src/slices/loudness/level-pieces.ts:30`); a silent master input is only resampled (`loudnorm.ts:78`).
- **Bed problems** at admission name "under Video and style → Ambient sound" (`ambientBedFields`, `rules.ts:568`): bad source/level/fade/tail; upload file missing or not audio ("…is missing, so it can't be added to the project…"); still uploading ("…is still uploading, so the run can't start yet…") (`rules.ts:580`–`:592`). Edit project names "Edit project → Inputs → Ambient sound" (`packages/app/src/slices/revisions/mutations.ts:241`); the channel page names "Brand kit → Ambient sound" (`channels/schema.ts:40`).
- **Foreign bed asset** in a revision edit: refused unless an earlier revision of the same project names it ("This ambient sound file does not belong to this project…") (`packages/app/src/slices/revisions/mutation-assets.ts:200`).
- **Bed file gone or unreadable at render**: "The ambient sound's audio file is no longer in the project.", "…couldn't be read as audio (…)", "…holds no sound." each followed by the fix to pick another file or a built-in bed on Play (`runtime-export-bed.ts:28`–`:52`). An uploaded source without an attached asset leaves the render unresolved (`recipe-visual.ts:200`).
- **Attach failure at start** throws "the ambient sound's audio file could not be attached: <reason>" (`start.ts:224`).
- **Cancellation**: every ffmpeg pass takes the stage signal; piece levelling checks it between pieces (`level-pieces.ts:26`). Temporary mix/master files are removed in `finally` (`runtime-export.ts:204`, `slideshow.ts:147`).

## State transitions

`config.loudness` and `config.ambientBed` are absent ↔ set on drafts and revisions; a change is a revision edit (`12-reruns-and-edits.md`). Turning levelling on plans only `level:*` steps and the exports that play them; no TTS piece is made again (`edit-sound-and-scale.tsx:74`, `recipe-loudness.ts:16`). Changing only the volumes re-masters exports; the pieces stay at −20 LUFS (`model.ts:50`). Changing the bed re-renders only the long video (`recipe-visual.ts:263`). The Settings default affects new runs only.

## Invariants

- The plain joins, and everything timed from them, are identical with levelling on or off (`recipe-loudness.ts:16`).
- Projects saved before loudness or the bed keep their fingerprints: each adds values only when set (`model.ts:14`, `ambient-bed.ts:9`).
- The bed never raises or lowers the narration: `normalize=0` keeps the voice at its level (`ambient-mix.ts:90`).
- The same bed settings render the same noise (fixed seeds, `ambient-mix.ts:7`).
- A master's report is measured from the finished encoded file, never from the intent (`loudnorm.ts:229`).
- An uploaded bed file is only ever the one the project was started with (`mutation-assets.ts:200`).

## Outcomes & side effects

With levelling on: `audio_levelled` outputs with a `LoudnessReport` ("Levelled N pieces to −20 LUFS…: the spread was X LU, now Y LU.", `reportText`, `model.ts:214`, shown in `packages/web/src/project/body-audio.tsx:85`), and `MasterReport` meta on the MP4, WAV, shorts and MP3/M4B. With a bed: the long video carries the ducked bed, is extended by any tail beyond the edge silence, and the project stores the uploaded bed as an asset. The rebuild preview lists "Ambient sound" before/after (`packages/app/src/slices/rebuild/preview-details.ts:299`). Legacy pre-revision code: `exportAudioWav`, `audioInputs` and `reusableAudioExport` (`packages/app/src/slices/video/audio-export.ts:21`, `audio-inputs.ts:8`, `reuse-audio.ts:26`) are reached only from `renderVideo` (`packages/app/src/slices/video/run.ts:36`), which no source file calls; tests under `packages/app/test/` use it.

## Dimensions not in play

- D1 Authority: single local user; no permissions.
- D5 Money: levelling, mastering and beds run locally with ffmpeg; no provider call.
- D12 Visibility: reports are shown on the project page only.
- D13 Notification: none.
- D15 Record and audit: reports live in output meta; no separate history.
- No downloadable or bundled bed recordings; no per-segment bed (one bed for the whole long video); no bed in shorts or the audio-only WAV; no user-set true-peak ceiling; no loudness for Video Off exports beyond the WAV master.
