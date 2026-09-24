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
generated_date: '2026-09-12'
generated_at_commit: 29b88494eb40
---

# 17 Subtitles and fonts

Local English captions align saved spoken text to actual narration. They belong to the existing final video stage, which emits MP4 or WAV; no new stage or paid provider call is added (`packages/app/src/slices/rebuild/{recipe-exports,runtime-subtitles,runtime-export}.ts`).

## Trigger & preconditions

- Play chooses Off (default), subtitle files, or burn-in plus files. Active subtitles require narration; WAV permits files only. Font defaults to bundled Barlow Regular, size 48; valid sizes are integers 16–120 (`slices/subtitles/model.ts`, `slices/admission/rules.ts`).
- Subtitle style and manual cues save in a new project revision, including during active work. Save does not start alignment, narration or rendering. The explicit affected-output preview and Start action authorize local work; changed dependencies remain outdated until then. Earlier work retains its origin revision and publication authority (`slices/revisions/mutations.ts`, `slices/rebuild/{recipe-save,service}.ts`).
- Uploaded narration must match the saved English article. Prepared generated narration uses exact saved `spokenText` for body/intro/outro, never delivery tags or bracket stripping; missing required clean payload is an error. Off/legacy requests retain their plain request-text path (`slices/rebuild/runtime-export-inputs.ts`, `slices/subtitles/transcript.ts`).

## Steps

1. `GET /api/fonts` lists `{id,name,family,source}` for bundled, system and uploaded fonts. `POST /api/fonts` accepts one multipart `file`, a valid `.ttf` or `.otf` no larger than 32 MiB. `GET /api/fonts/:id/file` serves the selected font face for browser preview; paths are server-only (`edge/http/fonts.ts`, `slices/fonts/index.ts`).
2. Metadata comes from bounded SFNT parsing, not the filename. Upload IDs hash content; system IDs hash file path plus collection-face index. Standard Windows/macOS/Linux roots are scanned with bounded depth/entries/files/bytes, skipping symlinks and unavailable directories. System TTC is accepted and its selected face extracted for preview (`slices/fonts/{sfnt,discovery,upload,preview}.ts`).
3. Before starting a new project with subtitles, the API resolves the selected font and rejects an unavailable choice before any project/provider work. Revision edits retain the chosen font ID. Explicit rebuild validates current readiness and preview identity; local caption-file execution resolves the font or reuses the saved snapshot (`edge/http/projects.ts`, `slices/rebuild/{service,runtime-subtitles}.ts`).
4. Revision recipes separate `subtitles:timing`, `subtitles:cues`, and `subtitles:files`. Timing fingerprints include narration identities, spoken text, measured duration, silence gaps, language and alignment version. Font, size, position and frame changes affect file/style work without forcing timing alignment (`slices/rebuild/{recipe-audio,recipe-exports}.ts`).
5. Alignment acquires the per-model-cache process lock, lazily downloads/verifies pinned English weights, decodes each spoken segment to 16 kHz mono PCM and runs ONNX WASM in an abortable Node child. CTC alignment and speech-agreement checks reject substantial mismatches. After a successfully aligned prefix, a short missing transcript passage can be skipped only when four following words supply a strong acoustic anchor (at least 20 letters, at most 20% recognition error, and each anchor word confidence at least 0.75). Recovery skips at most 40 words per event and at most 60 words or 5% of the segment transcript overall. It never guesses timestamps or inserts unspoken words; unmatched prefixes, extra speech, weak anchors and exhausted budgets remain failures. Relative word times become final-export times by adding segment and silence-gap offsets (`adapters/alignment/`, `slices/subtitles/prepare.ts`).
6. Publish immutable assets for aligned words, cue data, SRT, VTT, ASS and a selected-font snapshot through revision-bound publication. File bundles require all expected members; an existing SRT alone does not make a missing font reusable. An unchanged saved font snapshot can survive removal of its system font. SRT/VTT contain text and timing; their players choose styling (`slices/rebuild/{runtime-subtitles,recipe-work,runtime-store}.ts`, `slices/subtitles/captions.ts`).
7. Files mode emits subtitle downloads beside MP4/WAV. Burn-in applies fixed `subtitles.ass` and `fonts` paths from the caption working directory, using argument arrays with no shell interpolation. ASS text/font names cannot inject style rows or override commands (`slices/video/ffmpeg.ts`, `slices/subtitles/captions.ts`).
8. WAV export and caption-file generation are separate work recipes. With unchanged narration inputs, caption edits/style work retain completed WAV bytes; files-mode MP4 also retains rendered pixels. Caption publication updates subtitle metadata on retained ready media. Burn-in changes require video rendering, which waits for the complete prepared caption bundle (`slices/rebuild/{recipe-exports,recipe-visual,runtime-subtitles,runtime-store}.ts`).
9. Manual cues contain stable IDs, text, start/end seconds and their narration fingerprint. A changed cue edit must fit the current complete narration timeline; local inspection can fill missing audio duration but cannot authorize reuse of speech with changed voice/model/request inputs. Unchanged cues can remain saved after narration changes, with explicit review required before reuse. Valid manual cues bypass acoustic alignment (`slices/revisions/{mutation-cues,mutations,rules}.ts`, `slices/rebuild/{recipe-save,recipe-exports,provided-review}.ts`).

## Branches

- Recovered omissions remain in the timing cache and final-export metadata. The project displays a review note listing the timestamp and unmatched transcript text; the recording is unchanged. Timing cache version v2 invalidates earlier algorithm results (`adapters/alignment/window.ts`, `slices/subtitles/prepare.ts`, `packages/web/src/project/body-video.tsx`).

- Audio Off → subtitle controls disabled; client submits Off and normalizes invalid hidden style fields. Direct API requests with enabled captions are rejected (`packages/web/src/subtitles/config.ts`, `packages/app/src/slices/admission/rules.ts`).
- Video or Images Off → burn-in becomes files; WAV has separate SRT/VTT downloads and no burned pixels (`slices/admission/rules.ts`).
- Existing project without subtitle config → Off, no migration or model download (`slices/subtitles/model.ts`, `slices/admission/repo.ts`).
- Files-mode MP4 → native English VTT caption track; burn-in MP4 → no extra track. The UI uses the completed output's actual mode while config changes/rebuilds are pending (`packages/web/src/project/body-video.tsx`).
- A valid unchanged font ID can reuse the project's prior snapshot even if it is no longer listed as a system font (`slices/rebuild/runtime-subtitles.ts`).

## Unhappy paths

- Invalid font ID/file/size, excess multipart parts or corrupt metadata → validation problem; no upload committed. Invalid/missing preview IDs return 404 (`edge/http/fonts.ts`, `slices/fonts/`).
- Model download HTTP/size/hash failure → final stage fails; partial download removed, prior completed export kept. Cached weights are reverified before reuse (`adapters/alignment/cache.ts`).
- Transcript mismatch, invalid/overlapping timing or missing narration text → final stage fails with correction guidance, no fabricated timing (`adapters/alignment/{ctc,quality,worker}.ts`, `slices/subtitles/{transcript,captions}.ts`).
- Cancel/Pause → abort queued/active local work; discard unregistered prepared assets and keep retained completed outputs. Immutable revision-bound publication cannot replace a newer incompatible revision (`adapters/alignment/{lock,index,runner}.ts`, `slices/rebuild/{runtime-subtitles,runtime-export,runtime-publication}.ts`).
- Asset write or publication failure leaves the prior revision assets/downloads available. Prepared unregistered files are discarded; completed bundle repair is retried explicitly and dependent export waits until repair finishes (`slices/revisions/publish.ts`, `slices/rebuild/{runtime-subtitles,runtime-export,runtime-store}.ts`).

## State transitions

Revision Save commits configuration/content and reuse states without runner admission. Explicit preview/Start admits affected local work; completion publishes into its authorized revision and exposes current outputs only if compatible. Subtitle work belongs to the video stage and creates no provider attempts (`slices/revisions/mutations.ts`, `slices/rebuild/{service,runtime-subtitles}.ts`).

## Invariants

- Acoustic timestamps come from actual audio; font/style changes never fabricate or scale them (`adapters/alignment/`, `slices/subtitles/prepare.ts`).
- Narration/transcript/font files remain local; the only subtitle network request fetches public model weights (`adapters/alignment/cache.ts`).
- Provider outputs and the last completed export remain available while a replacement is prepared (`slices/rebuild/runtime-export.ts`, `slices/revisions/publish.ts`).
- Font selection is an opaque ID; client requests never supply filesystem paths or FFmpeg filter text (`slices/fonts/catalog.ts`, `edge/http/fonts.ts`).

## Outcomes & side effects

The selected revision retains `subtitles_srt`, `subtitles_vtt`, `subtitle_words`, `subtitle_ass` and `subtitle_font` outputs independently of narration and rendered media. Historical revisions keep their original asset references. Project deletion removes these files with the project; shared model and uploaded-font caches remain (`slices/storage/model.ts`, `slices/storage/delete-project.ts`). The model is about 95 MB, downloaded lazily; English is the only supported language (`adapters/alignment/cache.ts`, `slices/subtitles/model.ts`).

## Dimensions not in play

- No paid subtitle API, translation, text-only duration estimation, separate subtitle stage, font-delete API or change to provider generation choices (`kernel/ports/subtitles.ts`, `slices/subtitles/`, `edge/http/fonts.ts`).
