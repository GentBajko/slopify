---
absorbed_from:
- features/2026-09-24-narration-preparation@2026-09-24
- features/2026-09-10-subtitles-fonts@2026-09-10
- features/2026-09-10-editable-projects@2026-09-12
scenario: subtitles
screens:
- 06-play
- 08-project
depends_on:
- 04-run-admission
- 08-narration
- 11-video-assembly
- 12-reruns-and-edits
- 14-storage-and-downloads
generated_at_commit: e9226a34aa8a
generated_date: 2026-10-02
capstone_version: 7.0.1
content_hash: 46925e5fdc8f
paths_covered:
  - ":(top)packages/app/src/slices/subtitles/**"
  - ":(top)packages/app/src/slices/fonts/**"
  - ":(top)packages/app/src/adapters/alignment/**"
  - ":(top)packages/app/src/kernel/ports/languages.ts"
  - ":(top)packages/app/src/kernel/ports/subtitles.ts"
  - ":(top)packages/app/src/slices/rebuild/runtime-subtitles.ts"
  - ":(top)packages/app/src/slices/rebuild/recipe-exports.ts"
  - ":(top)packages/app/src/slices/rebuild/narration-retry.ts"
  - ":(top)packages/app/src/edge/http/fonts.ts"
  - ":(top)packages/app/src/edge/http/subtitles.ts"
  - ":(top)packages/web/src/subtitles/**"
  - ":(top)packages/web/src/project/body-video.tsx"
---

# 17 Subtitles and fonts

Local captions align the saved spoken text to the actual narration in the project language. They belong to the final video stage (MP4 or WAV); no separate stage and no paid provider call is added. Word timing also feeds the YouTube description (scenario 27), Shorts (28), narration-following edits and figure cards (29, 11), automatic reviews (33-automatic-reviews.md) and speaker levelling (35-audio-levelling-and-ambient.md). Paths below are relative to `packages/app/src/` unless they start with `packages/`.

## Trigger & preconditions

- Config (`subtitleConfigSchema`, `slices/subtitles/model.ts:12-40`): mode Off (default), `files`, or `burn-in` (burn-in plus files); `language` literal `"en"` kept for old configs; `fontId` default `"default"` (bundled Barlow Regular); position `top`, `upper-middle`, `center`, `lower-middle`, `bottom` (default); size integer 16–120, default 48; optional `color`/`outlineColor` `#RRGGBB` from the channel brand kit. The language captions are timed in is the project language, not this field (`projectLanguage`, `kernel/ports/languages.ts:92-94`).
- Admission: enabled captions need narration (`slices/admission/rules.ts:156-160`) and an article (`articleOffFields`, `:677-683`). Images Off turns Video Off (`:215-216`), and Video Off turns burn-in into files (`:229-231`). The Play/Edit control submits Off and a valid font/size when narration is Off, and files instead of burn-in when video or images are Off (`subtitlesFor`, `packages/web/src/subtitles/config.ts:8-34`).
- Starting or queueing a project with captions resolves the font first and refuses an unavailable one with a 400 naming `subtitles.fontId` (`edge/http/project-create.ts:38-50`, `edge/http/planning.ts:95-105`); a Play review says "This font was deleted. Choose another font." (`slices/play-drafts/review.ts:32-40`).
- Caption style and hand-edited cues save in a new revision; Save starts nothing. `PATCH /api/projects/:id/subtitles` always returns 409 `revision-required`, pointing to Edit project and Choose what to remake (`edge/http/subtitles.ts:15-30`).

## Steps

1. **Fonts API** (`edge/http/fonts.ts`, mounted at `/api/fonts`): `GET /` lists `{id,name,family,source}` for bundled, uploaded and system fonts (`:27`, `slices/fonts/catalog.ts:19-26`); `POST /` accepts one multipart `file`, a valid `.ttf`/`.otf` no larger than 32 MiB (`:28`, `:103`, `slices/fonts/model.ts:15`); `GET /:id/file` serves the face for browser preview (`:59`). IDs match `default|(system|uploaded)-<64 hex>` (`catalog.ts:12`): uploads hash content, system fonts hash path plus collection-face index. Metadata comes from bounded SFNT parsing (`slices/fonts/sfnt.ts`); system roots are scanned with bounded depth and size, skipping symlinks (`slices/fonts/discovery.ts`).
2. **Plan** (`exportRecipes`, `slices/rebuild/recipe-exports.ts:22-185`). `subtitles:timing` is planned when captions are on, or the YouTube description, Shorts, short mode, narration-following edits/cards/figure cards (`editNeedsTiming`), narration reviews, multi-voice audio files or per-speaker levelling need it (`:38-46`). Its fingerprint: operation `timingOperation(language)` (`slices/subtitles/model.ts:45-54`: English `wav2vec2-en-a19f851-v2-omissions`, multilingual `wav2vec2-xlsr56-2d48b01-v1`, sentence `sentence-timing-v1`), the narration timeline identity, silence gap, language, edge silence, and `"voice-words-v1"` on a multi-voice run (`:47-69`). Only with captions on: `subtitles:cues` (`automatic-cues-v1` from timing, or `manual-cues-v1` from the saved cues and their audio fingerprint, a cue's speaker only when set, `:124-158`) and `subtitles:files` (`subtitle-files-v1`: cues identity, format, font id, size, position, brand colours only when set, and speaker styling on a multi-voice run, `:159-183`, `:206-216`).
3. **Transcript** (`revisionTranscript`, `slices/rebuild/runtime-export-inputs.ts:116-169`): with narration preparation, the pronunciation glossary, multi-voice body or narration aliases, the joined saved `spokenText` of the parts; otherwise each chunk's saved text (or its TTS/provided request text); otherwise, for the body, `article_txt` or the article's plain text. Missing text → an error naming Write the article again.
4. **Timing** (`timing`, `slices/rebuild/runtime-subtitles.ts:88-168`): for each spoken segment with a file, the aligner runs on the plain (unlevelled) join (`revisionAudio` without `levelled`, `:94`) with the transcript, the project's narration aliases, the language's model folder (`<dataDir>/models/english-subtitles` or `multilingual-subtitles`, `kernel/paths.ts:78-84`) and progress on stage `video`. A multi-voice body's words get speaker and turn (`attributeWords`, `slices/voices/timing.ts:22`; scenario 34). Segment-relative times become video times by adding the offsets of edge, gaps and earlier segments; a word ending more than 0.1 s past its segment fails; ends are clamped to the segment (`:137-149`). Published as `subtitle_words` `subtitles.json` = `{ key, words, omissions }` (`:158-166`).
5. **Aligner by language** (`alignSubtitles`, `adapters/alignment/index.ts:12-54`; `kernel/ports/languages.ts:21-78`):
   - `english` (en): `wav2vec2-base-960h` q-ONNX, 95,286,046 bytes, pinned revision and SHA-256 (`adapters/alignment/cache.ts:33-38`).
   - `multilingual` (es, de, fr, it, pt, nl, ca, pl, cs): `wav2vec2-xlsr-multilingual-56` q4 ONNX, 247,576,761 bytes, 20-minute download timeout (`adapters/alignment/multilingual.ts:10-16`). Logits are folded to blank, delimiter and that language's letters (`multilingualSpec`, `:143-175`, alphabets `:103-113`); numbers are spelled per language (`adapters/alignment/spell.ts:680`, `:774`). Gates equal English's (`:121-128`).
   - `sentences` (ro, sv, da, nb, fi, hu, tr, id, vi, el, ru, uk, ar, he, hi, th, ja, zh, ko): no model or download. The audio's 20 ms loudness frames give speech start/end and pauses ≥0.2 s (`speechShape`, `adapters/alignment/sentences.ts:20-53`); sentences (`Intl.Segmenter`) get time in proportion to their letters and digits, each boundary moved to the nearest pause within 75 % of an average sentence; words share their sentence by length (`sentenceTiming`, `:65-110`). Word-by-word captions and narration-following cuts are off for these languages, and the project page and each affected control show `wordTimingUnavailable`'s sentence (`kernel/ports/languages.ts:130-135`, `packages/web/src/project/body-video.tsx:170-176`).
6. **Model execution** (model languages): acquire the per-model-folder process lock (`adapters/alignment/lock.ts`), prepare the model (verify cached file, else a seed file, else download, `cache.ts:40-69`), decode each segment to 16 kHz mono float, and run ONNX Runtime in an abortable child (`adapters/alignment/runner.ts`). One native CPU session per job with `min(8, CPUs − 1)` intra-op threads, overridable by `SLOPIFY_SUBTITLE_THREADS` (`adapters/alignment/threads.ts:1-14`, `worker.ts:212-217`). If `onnxruntime-node` cannot load (an Intel Mac has no build), the worker falls back to single-threaded `onnxruntime-web` WASM; if that fails too, it stops with a reinstall-or-turn-captions-off instruction (`worker.ts:179-218`). Audio is aligned in 12 s windows, each starting at the previous window's last accepted word (`worker.ts:14`). A window passes when mean posterior ≥0.48, at most 30 % of words below 0.2, and greedy-vs-transcript error ≤42 % (`englishGates`, `adapters/alignment/spec.ts:55-62`). A failing window tries, in order (`alignSpeechWindow`, `adapters/alignment/window.ts:24-124`): skipping 1–40 transcript words when the next four words are a strong anchor (≥20 letters, ≤20 % error, each ≥0.75 confidence), with an overall omission budget of min(60 words, 5 % of the segment) (`worker.ts:53`); then "said their own way" runs of ≤10 words / ≤6 s held by 3 matching words each side, with ≥60 % of the window's words matching (`window.ts:13-21`, `saidTheirWay`, `:125-192`). It never inserts unspoken words or guesses times.
7. **Automatic retry of a mismatched chunk**: a `SubtitleMismatch` (`kernel/ports/subtitles.ts:33-43`: `at`, `expected`, `heard`) is located to the narration chunk holding the expected words (`located`/`mismatchChunk`, `runtime-subtitles.ts:374-443`). When that chunk was made by a voice (TTS recipe, no hand-edited captions, not a multi-voice turn, `retryable`, `:406-412`), `requestNarrationRetry` records try 1 or 2 in `narration_retries` (`slices/rebuild/narration-retry.ts:13`, `:29-47`); after the run finishes (and at boot) the retrier redoes that chunk through project recovery with an idempotency key per try, then ticks the runner (`:81-160`, `main.ts:365-370`, `:489-490`). When the project still has another step running (its PDF, say), recovery answers `running`: the retry stays `pending`, is logged "Recording <chunk> again once the project's running steps finish.", and starts when that step finishes and kicks the retrier again (`narration-retry.ts:143-151`). The stage fails with a message naming the time, chunk number and opening words, expected vs heard, and either "recording narration chunk N again (try t of 2)" or, once the tries are used, the reword instruction (`describeMismatch`, `runtime-subtitles.ts:445-477`).
8. **Cues** (`cues`, `runtime-subtitles.ts:169-218`): hand-edited cues are validated against the current narration length (unique IDs, text present, in order, end after start and before the narration ends, `slices/revisions/rules.ts:62-92`) and used as they are; manual cues whose audio fingerprint no longer matches the timing need review and fail with "Review them in Edit project → Captions and save" (`:179-182`, `manualCuesNeedReview`, `recipe-exports.ts:186-201`). Otherwise `captionCues` builds cues from the words (`slices/subtitles/captions.ts:16-74`): a new cue after a pause over 0.7 s, a speaker change, 5 s of cue, or a third 42-character line; a word ending in `.`, `!` or `?` (optionally followed by a closing quote or bracket) ends the cue. Out-of-order or non-positive word times fail as damaged timing.
9. **Files** (`files`, `runtime-subtitles.ts:219-367`): SRT, VTT (speaker as `<v Name>`) and ASS (`PlayRes` = frame, font, size, colours defaulting to white on `&H00101010`, alignment/position from `subtitlePlacement`, `slices/subtitles/layout.ts:10-26`; speaker colours, name tags and the podcast speaker panel, scenario 34) plus a `subtitle_font` copy `selected<ext>`. Font: for a non-English project `captionFont` checks the chosen font against the language's letters and falls back to a bundled Noto font for the script (Latin/Greek/Cyrillic, Arabic, Hebrew, Devanagari, Thai), then any system font that covers them, else fails naming Upload font and a Noto Sans JP/KR/SC suggestion (`slices/fonts/coverage.ts:18-62`, `kernel/ports/languages.ts:136-170`); for English, the previously published snapshot when the id is unchanged, else `resolveFont` (`runtime-subtitles.ts:262-273`). Ready retained media (`audio_export`, or `video` in files mode) is re-published with `subtitlesMode: "files"` and `subtitleOmissions` (`:334-355`).
10. **Use in media**: files mode emits the downloads beside MP4/WAV; burn-in copies `subtitles.ass` and the font into the render folder and the join draws them with `ass=filename=subtitles.ass:fontsdir=fonts` (scenario 11; `slices/rebuild/runtime-export.ts:275-306`, `slices/video/ffmpeg.ts:476`). ASS text escapes `\`, `{`, `}` to full-width forms and font names drop control characters and commas, so no text can open an override or style row (`captions.ts:120-156`).

## Branches

- Captions Off with timing still needed → only `subtitles:timing` runs; no cues or caption files (`recipe-exports.ts:93-123`).
- Hand-edited captions skip timing unless something else needs it (scenario 29; `slices/rebuild/runtime-store.ts:48-57`).
- Language timed by sentences → sentence captions; word-by-word Shorts captions and narration cuts are off (`kernel/ports/languages.ts:21-26`).
- Files-mode MP4 → the player offers the VTT as a track labelled `lang: "en"`, "English" for every language; burn-in MP4 → no track. The page uses the completed output's `subtitlesMode` while a change is pending (`packages/web/src/project/body-video.tsx:52`, `:123-124`).
- Recovered omissions → listed under "Subtitles recovered after missing narration" with their times; the audio is unchanged (`body-video.tsx:177-190`).
- Existing project without subtitle config → Off, no download (`slices/subtitles/model.ts:34-40`).
- English project with an unchanged font id → the prior snapshot is reused even if the system font is gone (`runtime-subtitles.ts:268-272`).
- Boot prefetches the English model unless `SLOPIFY_NO_MODEL_PREFETCH` is truthy, from `SLOPIFY_SUBTITLE_MODEL_SEED` when that file verifies; a prefetch failure is logged and the first captioned run retries (`edge/cli.ts:87-90`, `main.ts:734-747`, `adapters/alignment/prefetch.ts:11-26`). The multilingual model downloads on first use.

## Unhappy paths

- Invalid font file/size, extra multipart parts or corrupt metadata → validation problem, nothing stored; unknown preview id → 404 (`edge/http/fonts.ts`). Font gone at render → "The chosen caption font is no longer available…" (`slices/fonts/catalog.ts:59-66`).
- Model download: three attempts on interruption with 1 s and 2 s abortable waits, five-minute (English) or twenty-minute (multilingual) timeout per attempt; exhaustion → "The free subtitle model download was interrupted after 3 attempts…"; HTTP, size, hash or disk errors stop without retry; partial files never become the cached model (`adapters/alignment/cache.ts:40-69`, `:81`).
- No narration → "Captions and the YouTube description need narration audio…" (`runtime-subtitles.ts:95-98`); no words matched at all → names Edit project → Language and uploaded audio (`:153-156`); aligner missing from the build → internal error (`:99-103`).
- Retry refused for any reason other than `running` (no current revision, a recovery refusal) → the row is settled `failed` with the reason and a warning is logged (`narration-retry.ts:120-125`, `:152-158`).
- Mismatch after the automatic tries → the stage stays failed with the reword instruction; the chunk is not retried again.
- Cancel/Pause → the alignment child and downloads abort; prepared unregistered assets are discarded; retained outputs stay (`adapters/alignment/runner.ts`, `runtime-subtitles.ts:361-366`).
- Publication failure leaves the prior assets and downloads available (`slices/revisions/publish.ts`).

## State transitions

- `subtitles:timing` → `subtitles:cues` → `subtitles:files` pieces: pending → `done` on publication, `held` when not admitted. Save commits configuration and cues without admission; explicit preview/Start admits the affected local work (`slices/revisions/mutations.ts`, `slices/rebuild/service.ts`).
- `narration_retries` rows: absent → `pending` (try 1) → `started` or `failed` (stays `pending` while another project step runs); a second mismatch sets `pending` with try 2; no transition past try 2 (`narration-retry.ts:29-47`, `:65-75`).

## Invariants

- Word times come from the audio (acoustic alignment, or loudness pauses for sentence languages); style changes never re-time (`recipe-exports.ts:159-183`).
- Word timing reads the plain narration join, so turning Level the volume on or off never re-times (`slices/rebuild/recipe-loudness.ts:16-21`).
- English projects keep their timing operation, font resolution and fingerprints; every language-specific value is added only for other languages (`slices/subtitles/model.ts:42-49`, `slices/fonts/coverage.ts:10-14`).
- Narration, transcripts and fonts stay local; the only network requests fetch the two public model files.
- Font choice is an opaque id; clients never send paths or filter text.

## Outcomes & side effects

The revision holds `subtitle_words`, `subtitles_srt`, `subtitles_vtt`, `subtitle_ass` and `subtitle_font` outputs independently of narration and media; history keeps its references. Project deletion removes them; uploaded fonts (`<dataDir>/fonts`) and model caches (`<dataDir>/models/`) remain (scenario 14). `slices/subtitles/prepare.ts` and `transcript.ts` belong to the pre-revision `renderVideo` path (`slices/video/run.ts:36`), which is reached only from tests.

## Dimensions not in play

- No paid subtitle API, no translation, no font-delete API, no subtitle stage of its own.
- D5 money: none; alignment is local.
- D13 notification: none of its own; the mismatch shows on the stage and in the run's notices.
