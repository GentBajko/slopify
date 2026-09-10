---
absorbed_from: features/2026-09-10-subtitles-fonts@2026-09-10
scenario: subtitles
screens: [06-play, 08-project]
depends_on: [04-run-admission, 08-narration, 11-video-assembly, 12-reruns-and-edits, 14-storage-and-downloads]
generated_date: 2026-09-10
---

# 17 Subtitles and fonts

Local English captions align saved spoken text to actual narration. They belong to the existing final video stage, which emits MP4 or WAV; no new stage or paid provider call is added (`packages/app/src/slices/subtitles/prepare.ts`, `slices/video/{run,audio-export}.ts`).

## Trigger & preconditions

- Play chooses Off (default), subtitle files, or burn-in plus files. Active subtitles require narration; WAV permits files only. Font defaults to bundled Barlow Regular, size 48; valid sizes are integers 16–120 (`slices/subtitles/model.ts`, `slices/admission/rules.ts`).
- A project can save subtitle changes only when no stage/runner work is active. Paused projects queue the final export until Resume; otherwise saving starts it. Saved narration and images are reused (`edge/http/subtitles.ts`).
- Uploaded narration must match the saved English article. Generated narration uses its recorded TTS chunk text; intro/outro use the saved segment text (`slices/subtitles/transcript.ts`).

## Steps

1. `GET /api/fonts` lists `{id,name,family,source}` for bundled, system and uploaded fonts. `POST /api/fonts` accepts one multipart `file`, a valid `.ttf` or `.otf` no larger than 32 MiB. `GET /api/fonts/:id/file` serves the selected font face for browser preview; paths are server-only (`edge/http/fonts.ts`, `slices/fonts/index.ts`).
2. Metadata comes from bounded SFNT parsing, not the filename. Upload IDs hash content; system IDs hash file path plus collection-face index. Standard Windows/macOS/Linux roots are scanned with bounded depth/entries/files/bytes, skipping symlinks and unavailable directories. System TTC is accepted and its selected face extracted for preview (`slices/fonts/{sfnt,discovery,upload,preview}.ts`).
3. Before starting a new project with subtitles, the API resolves the selected font and rejects an unavailable choice before any project/provider work. A project style update validates a changed active font and rechecks running/inflight work after asynchronous discovery (`edge/http/{projects,subtitles}.ts`).
4. Final-export preparation hashes audio bytes, segment text/duration, gaps and the alignment-version key. Matching project `subtitle_words` reuse acoustic timing despite font, size or video-format changes; changed audio/text/timeline requires fresh alignment (`slices/subtitles/prepare.ts`).
5. Alignment acquires the per-model-cache process lock, lazily downloads/verifies pinned English weights, decodes each spoken segment to 16 kHz mono PCM and runs ONNX WASM in an abortable Node child. CTC alignment and speech-agreement checks reject substantial mismatches. After a successfully aligned prefix, a short missing transcript passage can be skipped only when four following words supply a strong acoustic anchor (at least 20 letters, at most 20% recognition error, and each anchor word confidence at least 0.75). Recovery skips at most 40 words per event and at most 60 words or 5% of the segment transcript overall. It never guesses timestamps or inserts unspoken words; unmatched prefixes, extra speech, weak anchors and exhausted budgets remain failures. Relative word times become final-export times by adding segment and silence-gap offsets (`adapters/alignment/`, `slices/subtitles/prepare.ts`).
6. Create a new `captions-*` project directory with SRT, VTT, ASS, timing JSON and a selected-font snapshot. Font snapshots from a prior completed export can be reused after the original system file is removed. SRT/VTT contain text and timing; their players choose styling (`slices/subtitles/prepare.ts`, `captions.ts`).
7. Files mode emits subtitle downloads beside MP4/WAV. Burn-in applies fixed `subtitles.ass` and `fonts` paths from the caption working directory, using argument arrays with no shell interpolation. ASS text/font names cannot inject style rows or override commands (`slices/video/ffmpeg.ts`, `slices/subtitles/captions.ts`).
8. The export writes a part file, checks cancellation, backs up prior media/parameters and transactionally replaces final-export/caption rows. Success records actual `subtitlesMode` and any timestamped `subtitleOmissions` on the export and removes obsolete assets; failure restores prior media/rows and discards the new caption directory (`slices/video/write-export.ts`).

## Branches

- Recovered omissions remain in the timing cache and final-export metadata. The project displays a review note listing the timestamp and unmatched transcript text; the recording is unchanged. Timing cache version v2 invalidates earlier algorithm results (`adapters/alignment/window.ts`, `slices/subtitles/prepare.ts`, `packages/web/src/project/body-video.tsx`).

- Audio Off → subtitle controls disabled; client submits Off and normalizes invalid hidden style fields. Direct API requests with enabled captions are rejected (`packages/web/src/subtitles/config.ts`, `packages/app/src/slices/admission/rules.ts`).
- Video or Images Off → burn-in becomes files; WAV has separate SRT/VTT downloads and no burned pixels (`slices/admission/rules.ts`).
- Existing project without subtitle config → Off, no migration or model download (`slices/subtitles/model.ts`, `slices/admission/repo.ts`).
- Files-mode MP4 → native English VTT caption track; burn-in MP4 → no extra track. The UI uses the completed output's actual mode while config changes/rebuilds are pending (`packages/web/src/project/body-video.tsx`).
- A valid unchanged font ID can reuse the project's prior snapshot even if it is no longer listed as a system font (`slices/subtitles/prepare.ts`, `edge/http/subtitles.ts`).

## Unhappy paths

- Invalid font ID/file/size, excess multipart parts or corrupt metadata → validation problem; no upload committed. Invalid/missing preview IDs return 404 (`edge/http/fonts.ts`, `slices/fonts/`).
- Model download HTTP/size/hash failure → final stage fails; partial download removed, prior completed export kept. Cached weights are reverified before reuse (`adapters/alignment/cache.ts`).
- Transcript mismatch, invalid/overlapping timing or missing narration text → final stage fails with correction guidance, no fabricated timing (`adapters/alignment/{ctc,quality,worker}.ts`, `slices/subtitles/{transcript,captions}.ts`).
- Cancel/Pause → abort queued/active local work; discard partial decode/alignment/render files and keep completed outputs (`adapters/alignment/{lock,index,runner}.ts`, `slices/video/write-export.ts`).
- Parameter-write or output-row commit failure → restore prior export bytes/parameters and keep prior caption rows. If restoration itself fails, retain its `.previous` backup (`slices/video/write-export.ts`).

## State transitions

`PATCH /api/projects/:id/subtitles` saves config, resets only the final video stage to pending and emits `project.updated`. A paused project remains paused; Resume later claims pending work. Success/failure/cancel uses the existing stage states (scenario 01); captions do not create provider attempts (`edge/http/subtitles.ts`, `slices/video/run.ts`).

## Invariants

- Acoustic timestamps come from actual audio; font/style changes never fabricate or scale them (`adapters/alignment/`, `slices/subtitles/prepare.ts`).
- Narration/transcript/font files remain local; the only subtitle network request fetches public model weights (`adapters/alignment/cache.ts`).
- Provider outputs and the last completed export remain available while a replacement is prepared (`slices/video/write-export.ts`).
- Font selection is an opaque ID; client requests never supply filesystem paths or FFmpeg filter text (`slices/fonts/catalog.ts`, `edge/http/fonts.ts`).

## Outcomes & side effects

One final-stage export owns `subtitles_srt`, `subtitles_vtt`, `subtitle_words`, `subtitle_ass` and `subtitle_font` outputs. Project deletion removes these files with the project; shared model and uploaded-font caches remain (`slices/storage/model.ts`, `slices/storage/delete-project.ts`). The model is about 95 MB, downloaded lazily; English is the only supported language (`adapters/alignment/cache.ts`, `slices/subtitles/model.ts`).

## Dimensions not in play

- No paid subtitle API, translation, text-only duration estimation, separate subtitle stage, font-delete API or change to provider generation choices (`kernel/ports/subtitles.ts`, `slices/subtitles/`, `edge/http/fonts.ts`).
