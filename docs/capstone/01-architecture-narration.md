---
generated_at_commit: e9226a34aa8a
generated_date: 2026-10-02
capstone_version: 7.0.1
content_hash: 83204da76e50
paths_covered:
  - ":(top)packages/app/src/slices/narration/**"
  - ":(top)packages/app/src/slices/voices/**"
  - ":(top)packages/app/src/slices/loudness/**"
  - ":(top)packages/app/src/slices/rebuild/recipe-audio*.ts"
  - ":(top)packages/app/src/slices/rebuild/recipe-preparation.ts"
  - ":(top)packages/app/src/slices/rebuild/recipe-voices.ts"
  - ":(top)packages/app/src/slices/rebuild/recipe-loudness.ts"
  - ":(top)packages/app/src/slices/rebuild/recipe-lines.ts"
  - ":(top)packages/app/src/slices/rebuild/recipe-pauses.ts"
  - ":(top)packages/app/src/slices/rebuild/recipe-narration-text.ts"
  - ":(top)packages/app/src/slices/rebuild/recipe-describe.ts"
  - ":(top)packages/app/src/slices/rebuild/recipe-text.ts"
  - ":(top)packages/app/src/slices/rebuild/recipe-build.ts"
  - ":(top)packages/app/src/slices/rebuild/recipe-exports.ts"
  - ":(top)packages/app/src/slices/rebuild/runtime-run.ts"
  - ":(top)packages/app/src/slices/rebuild/runtime-provider.ts"
  - ":(top)packages/app/src/slices/rebuild/runtime-local.ts"
  - ":(top)packages/app/src/slices/rebuild/runtime-voices.ts"
  - ":(top)packages/app/src/slices/rebuild/runtime-lines.ts"
  - ":(top)packages/app/src/slices/rebuild/runtime-subtitles.ts"
  - ":(top)packages/app/src/slices/rebuild/runtime-narration-*.ts"
  - ":(top)packages/app/src/slices/rebuild/narration-*.ts"
  - ":(top)packages/app/src/slices/admission/rules.ts"
  - ":(top)packages/app/src/slices/admission/schema.ts"
  - ":(top)packages/app/src/slices/revisions/mutations.ts"
  - ":(top)packages/app/src/slices/revisions/rules.ts"
  - ":(top)packages/app/src/slices/revisions/restore.ts"
  - ":(top)packages/app/src/slices/revisions/schema.ts"
  - ":(top)packages/app/src/slices/settings/model.ts"
  - ":(top)packages/app/src/kernel/ports/tts.ts"
  - ":(top)packages/app/src/kernel/ports/narration-aliases.ts"
  - ":(top)packages/app/src/kernel/ports/system-speech.ts"
  - ":(top)packages/app/src/kernel/runner/providers.ts"
  - ":(top)packages/app/src/kernel/runner/audition.ts"
  - ":(top)packages/app/src/kernel/audio-preview.ts"
  - ":(top)packages/app/src/adapters/tts/**"
  - ":(top)packages/app/src/adapters/alignment/text.ts"
  - ":(top)packages/app/src/adapter-registry.ts"
  - ":(top)packages/app/src/edge/http/app.ts"
  - ":(top)packages/app/src/edge/http/pronunciations.ts"
  - ":(top)packages/app/src/edge/http/auditions.ts"
  - ":(top)packages/app/src/edge/http/audio-preview.ts"
  - ":(top)packages/app/src/edge/http/narration-peaks.ts"
  - ":(top)packages/app/src/edge/http/revisions.ts"
  - ":(top)packages/app/src/main.ts"
  - ":(top)packages/web/src/api.ts"
  - ":(top)packages/web/src/router.tsx"
  - ":(top)packages/web/src/main.tsx"
  - ":(top)packages/web/vite.config.ts"
  - ":(top)packages/web/src/play/pronunciation-glossary.tsx"
  - ":(top)packages/web/src/play/narration-aliases.tsx"
  - ":(top)packages/web/src/play/loudness.tsx"
  - ":(top)packages/web/src/play/draft-state.ts"
  - ":(top)packages/web/src/routes/narration-aliases.tsx"
  - ":(top)packages/web/src/voices/**"
  - ":(top)packages/web/src/video/loudness-controls.tsx"
  - ":(top)packages/web/src/project/narration-downloads.tsx"
  - ":(top)packages/web/src/project/revision-narration.tsx"
  - ":(top)packages/web/src/project/narration-editor.tsx"
  - ":(top)packages/web/src/project/live-audio.tsx"
  - ":(top)packages/web/src/project/waveform.tsx"
---

# Narration

Scope: narration text shaping (pronunciation glossary, shared glossary, narration aliases, Narration Preparation), single-voice and multi-voice synthesis, TTS provider boundaries, and loudness levelling/mastering. Captions, exports and video rendering appear only where they read narration.

## Layers

| Layer | Directories/files | Observed dependency direction |
| --- | --- | --- |
| Ports | `packages/app/src/kernel/ports/{tts,narration-aliases,system-speech}.ts` | Import nothing from slices/edge. `aliasMatches` lives in the kernel because the caption aligner (an adapter) also calls it (`packages/app/src/kernel/ports/narration-aliases.ts:1`, `packages/app/src/adapters/alignment/text.ts:1`). |
| Provider wrapper | `packages/app/src/kernel/runner/{providers,audition}.ts` | Wraps `TtsPort.synthesize` with retry/continuation for every stage call (`packages/app/src/kernel/runner/providers.ts:266`). |
| TTS adapters | `packages/app/src/adapters/tts/` | Implement `TtsPort`; registered by id in `packages/app/src/adapter-registry.ts:104`. Import ports only (`biome.json:99`). |
| Text transforms | `packages/app/src/slices/narration/` | Pure text/IPA/alias/cue functions plus the ffmpeg join and pause helpers; import kernel and storage/video helpers (`packages/app/src/slices/narration/concat.ts:12`, `packages/app/src/slices/narration/pauses.ts:116`). |
| Multi-voice and loudness models | `packages/app/src/slices/voices/`, `packages/app/src/slices/loudness/` | Speaker/script/grouping models and ffmpeg loudnorm helpers; browser-safe model files are imported by the web client (`packages/app/src/slices/loudness/model.ts:12`). |
| Planning (recipes) | `packages/app/src/slices/rebuild/recipe-*.ts` | Import admission rules and the narration/voices/loudness transforms; produce `ResolvedWorkRecipe` rows (`packages/app/src/slices/rebuild/recipe-build.ts:28`). |
| Execution (runtime) | `packages/app/src/slices/rebuild/runtime-*.ts` | Dispatch pieces to provider or local execution and publish assets (`packages/app/src/slices/rebuild/runtime-run.ts:17`). |
| HTTP edge | `packages/app/src/edge/http/{pronunciations,auditions,audio-preview,narration-peaks,revisions}.ts` | Call slice functions; mounted in `packages/app/src/edge/http/app.ts:194`, `:209`. |
| Browser | `packages/web/src/{play,voices,video,project,routes}/` | Imports app types/models through `@app/...` and calls HTTP through `packages/web/src/api.ts`. |

Enforced import rules: kernel may not import slices/edge; slices may not import edge; adapters may not import edge/slices (`biome.json:44`, `biome.json:70`, `biome.json:99`).

## Module boundaries

### Settings that switch narration features

| Feature | Predicate | Condition |
| --- | --- | --- |
| Pronunciation Glossary | `usesPronunciationGlossary` (`packages/app/src/slices/admission/rules.ts:631`) | Generated audio, `audio.usePronunciationGlossary === true`, provider `inworld`, model `inworld-tts-2` or `inworld-tts-2-flash`. |
| Narration Preparation | `usesNarrationPreparation` (`packages/app/src/slices/admission/rules.ts:432`) | Generated audio and a nonblank `narrationPrompt`. Admission refuses it unless the voice is `inworld` / `inworld-tts-2` (`packages/app/src/slices/admission/rules.ts:438`). |
| Narration aliases | `narrationAliasesOf` (`packages/app/src/slices/admission/rules.ts:601`) | Generated audio and `audio.useNarrationAliases === true`; returns the run's copied `narrationAliases`. |
| Shared glossary | `withShared` (`packages/app/src/slices/rebuild/recipe-text.ts:444`) | `audio.shareGlossary === true`; merges the run's copied `sharedGlossary` after the project's own entries. |
| Level the volume | `usesLoudness` (`packages/app/src/slices/loudness/model.ts:146`) | `config.loudness` present and audio not Off. |
| Multiple voices | `config.voices` plus a script (`packages/app/src/slices/rebuild/recipe-audio.ts:91`) | `VoicesSettings` (`packages/app/src/slices/voices/model.ts:78`). |

The run config fields are `audio.{usePronunciationGlossary,shareGlossary,useNarrationAliases,describeFigures,skipCode}`, `narrationAliases`, `sharedGlossary`, `voices`, `loudness` (`packages/app/src/slices/admission/schema.ts:83`, `:93`, `:94`, `:206`, `:209`). New Play drafts set `usePronunciationGlossary`, `shareGlossary`, `useNarrationAliases` and `describeFigures` to `true` (`packages/web/src/play/draft-state.ts:36`). The loudness default for new runs is the app setting `loudness` (`packages/app/src/slices/settings/model.ts:213`), defaulting to enabled, −14 LUFS video, −18 LUFS audio files (`packages/app/src/slices/loudness/model.ts:34`).

### Pronunciation glossary

`parsePronunciationGlossary(markdown, language?)` reads `Term: /IPA/` lines and Markdown tables (a table IPA cell without slashes counts as one slash-delimited pronunciation). English (absent or `en`) accepts only the standard-English IPA subset Inworld documents; other languages accept full IPA. Malformed, non-IPA, word-count-mismatched and conflicting rows are skipped with 1-based row numbers and reasons, never their text; the result is always `ok: true` with optional `skipped` (`packages/app/src/slices/narration/pronunciation.ts:78`, `packages/app/src/slices/narration/pronunciation.ts:140`). Matching is literal, case-insensitive and boundary-aware; matches become slash-delimited IPA spans (`packages/app/src/slices/narration/pronunciation.ts:192`, `:230`).

The glossary source is the article's end matter (`article:glossary` slot); `glossaryOf` returns an empty entry list when the feature is off and `null` while the article is unwritten (`packages/app/src/slices/rebuild/recipe-text.ts:425`). `collectSharedGlossary` merges the selected, ready `article:glossary` outputs of every other project's head revision, newest first (`packages/app/src/slices/narration/shared-glossary.ts:18`). Each speaker in a multi-voice run carries its own `pronunciations` text, used only when that speaker's voice reads IPA (`packages/app/src/slices/voices/model.ts:37`, `packages/app/src/slices/rebuild/recipe-voices.ts:415`).

### Narration aliases

`NarrationAlias` is `{written, spoken, wholeWord, caseSensitive}` with limits 200/500 characters and 1,000 rows (`packages/app/src/kernel/ports/narration-aliases.ts:8`, `:22`). `aliasMatches` returns leftmost, longest, non-overlapping matches (`packages/app/src/kernel/ports/narration-aliases.ts:30`). Aliases change only what the voice (and Narration Preparation) receives; the article, transcript and captions keep the written form, and the caption aligner applies the same matcher (`packages/app/src/adapters/alignment/text.ts:25`). The library list is stored in table `narration_aliases`, replaced as a whole on save (`packages/app/src/slices/narration/aliases-library.ts:18`, `:40`); a project copies it at start or when Edit project refreshes it.

Within a narration group, alias spans take precedence over glossary spans (`packages/app/src/slices/rebuild/recipe-audio-parts.ts:50`, `packages/app/src/slices/narration/aliases.ts:30`).

### Request construction

`narrationParts` (`packages/app/src/slices/rebuild/recipe-audio-parts.ts:19`) chooses, per logical group:

1. Asset override → one `provided` recipe; no glossary or preparation.
2. Glossary unresolved (`null`) → no parts (a deferred `audio:<segment>:future` is planned by the caller).
3. Preparation on → `preparationForGroup` plus `tts` parts carrying `text` (tags + IPA/alias spans) and clean `spokenText` (`packages/app/src/slices/rebuild/recipe-audio-parts.ts:70`, `packages/app/src/slices/rebuild/recipe-preparation.ts:64`).
4. Spans present → `prepareRequests(logicalText, [], maxCharacters, spans)` (`packages/app/src/slices/rebuild/recipe-audio-parts.ts:108`, `packages/app/src/slices/narration/steering.ts:101`).
5. Otherwise → the original `planNarration` splitter and identities (`packages/app/src/slices/rebuild/recipe-audio-parts.ts:135`, `packages/app/src/slices/narration/plan.ts:55`).

`maxCharacters` comes from the enabled catalogue model's `tts.maxCharacters`, else the logical length plus span growth (`packages/app/src/slices/rebuild/recipe-audio-parts.ts:61`). Persisted TTS `pronunciation` is always `null`; IPA travels inside `text`. A refusal becomes a deferred `resolve-revision-recipe` part with `unresolved: true` (`packages/app/src/slices/rebuild/recipe-audio-parts.ts:180`).

`pronunciationChunks` merges ordinary chunks when a glossary match crosses a chunk boundary; merged groups carry `NarrationSource {text, start, bodyFingerprint, chunkingFingerprint}` (`packages/app/src/slices/narration/pronunciation-chunks.ts:10`, `:21`). Save discards client-submitted `narrationSources` and `bindNarrationSources` rebuilds them from the base revision (`packages/app/src/slices/revisions/mutations.ts:73`, `packages/app/src/slices/revisions/rules.ts:10`).

### Narration Preparation

The preparation LLM receives numbered source sentences and returns `{cues: Cue[]}`; cue variants are `instruction` (≤240 chars, no markup), `reset`, and `sound` (`laugh`, `breathe`, `clear throat`, `sigh`, `cough`, `yawn`) (`packages/app/src/slices/narration/preparation.ts:30`, `:54`). A multi-voice turn is prepared only when its speaker uses `inworld` / `inworld-tts-2` (`packages/app/src/slices/rebuild/recipe-voices.ts:404`); the speaker name/role reach the prompt as `PreparationSpeaker` (`packages/app/src/slices/narration/preparation.ts:16`).

### Multiple voices

`VoicesSettings` holds up to 10 speakers (`speakersMax`) with roles `narrator|host|guest|character`, formats `audiobook|podcast|drama|interview`, per-speaker `pace` and turn gaps (`packages/app/src/slices/voices/model.ts:7`, `:16`, `:25`). The script is parsed by `parseScript` (`packages/app/src/slices/voices/script.ts:44`). `groupTurns` puts consecutive turns into one native dialogue request only for models in `dialogueCapabilities`: ElevenLabs `eleven_v3` (≤10 voices, 2,000 chars) and Google TTS Gemini preview models (≤2 voices, 3,000 chars); other turns are one request each (`packages/app/src/slices/voices/grouping.ts:21`, `:52`). Turn parts use keys `audio:body:turn:<n>`, join through `concat-turns-v1` into `audio:body:concat` (`packages/app/src/slices/rebuild/recipe-voices.ts:152`, `:195`). A multi-voice run also plans `voices:files` (`audio-files-v1`): MP3 and M4B with chapters at script sections (`packages/app/src/slices/rebuild/recipe-exports.ts:99`, `packages/app/src/slices/rebuild/runtime-voices.ts:25`).

### Loudness

With Level the volume on, each join gets a sibling `level:<segment>` recipe (`level-narration-v1`) that repeats the join with every piece first normalised to −20 LUFS / −2 dBTP; the plain join (read by word timing) is unchanged (`packages/app/src/slices/rebuild/recipe-loudness.ts:22`, `packages/app/src/slices/loudness/model.ts:54`). Uploaded narration is never levelled (`packages/app/src/slices/rebuild/recipe-audio.ts:206`). `masterPlan` adds the master target (`videoLufs` or `audioFilesLufs`, true peak −1.5 or −3 dBTP) to exports (`packages/app/src/slices/rebuild/recipe-loudness.ts:64`, `packages/app/src/slices/loudness/model.ts:42`). Multi-voice runs with loudness on also level line by line after word timing (`packages/app/src/slices/rebuild/recipe-lines.ts:9`, `packages/app/src/slices/loudness/line-level.ts:102`).

### TTS provider boundary

`TtsPort` exposes `id`, `capabilities {streams, dialogue?}`, `models()`, `synthesize(TtsRequest)` and optional `voiceLanguages` (`packages/app/src/kernel/ports/tts.ts:42`). Every adapter answers MP3 (`TtsAudio.container: "mp3"`); Gemini returns PCM converted through the app's ffmpeg (`packages/app/src/kernel/ports/tts.ts:37`, `packages/app/src/adapters/tts/pcm-mp3.ts:7`).

| Registry id | Adapter | Capabilities |
| --- | --- | --- |
| `elevenlabs` | `packages/app/src/adapters/tts/elevenlabs.ts:59` | streams, dialogue |
| `openai-tts` | `packages/app/src/adapters/tts/openai.ts:43` | streams |
| `cartesia` | `packages/app/src/adapters/tts/cartesia.ts:45` | streams |
| `inworld` | `packages/app/src/adapters/tts/inworld.ts:26` (async jobs: `inworld-async.ts`) | streams |
| `system-voice` | `packages/app/src/adapters/tts/system.ts:84` (say, SAPI, Piper, Pico, eSpeak NG, eSpeak; no key) | none |
| `google-tts` | `packages/app/src/adapters/tts/gemini.ts:81` | dialogue |

`runNarration` (`packages/app/src/slices/narration/run.ts:71`) has no production caller; the audio stage runs through `runRevisionInvocation` (`packages/app/src/main.ts:948`).

## Entry points

| Entry | Site |
| --- | --- |
| Stage runner for every stage kind (audio included) | `runRevisionInvocation` wired at `packages/app/src/main.ts:948`, defined at `packages/app/src/slices/rebuild/runtime-run.ts:17`. |
| Provider pieces (`tts`, `llm` preparation/description) | `executeProviderRecipe` (`packages/app/src/slices/rebuild/runtime-provider.ts:43`). |
| Local pieces (`concat-narration`, `concat-turns-v1`, `level-narration-v1`, `narration-files-v1`, `figure-card-v1`) | `executeLocalRecipe` (`packages/app/src/slices/rebuild/runtime-local.ts:38`, dispatch at `:94`–`:102`). |
| Listening files (`voices:files`) | `executeVoicesRecipe` (`packages/app/src/slices/rebuild/runtime-voices.ts:25`). |
| Caption-triggered narration retry | `requestNarrationRetry` from the subtitle step (`packages/app/src/slices/rebuild/runtime-subtitles.ts:392`); at most `narrationRetryLimit = 2` per chunk (`packages/app/src/slices/rebuild/narration-retry.ts:13`); coordinator created at `packages/app/src/main.ts:365`. A `running` refusal (another step of the project still going) leaves the retry pending; `onFinished` kicks it again (`packages/app/src/slices/rebuild/narration-retry.ts:143`). |
| Voice audition | `auditionVoice` wired at `packages/app/src/main.ts:629`. |

| Work keys | Operation |
| --- | --- |
| `narration:prepare:<segment>:<logicalKey>`, `narration:prepare:<segment>:future` | Preparation LLM call or deferred (`packages/app/src/slices/rebuild/recipe-preparation.ts:47`, `:81`). A `text` narration override's optional `direction` is appended to that chunk's preparation prompt only (`packages/app/src/slices/rebuild/recipe-preparation.ts:76`-`:87`; field `packages/app/src/slices/revisions/model.ts:35`, schema `packages/app/src/slices/revisions/schema.ts:68`). |
| `narration:describe:<n>`, `narration:describe:future` | Spoken description of tables/figures/math/code (`packages/app/src/slices/rebuild/recipe-describe.ts:22`, `:94`). |
| `<logicalKey>:<part>`, `audio:<segment>:future` | TTS parts or deferred narration (`packages/app/src/slices/rebuild/recipe-audio-parts.ts:19`, `packages/app/src/slices/rebuild/recipe-audio.ts:149`). |
| `audio:body:turn:<n>` | Multi-voice turn group (`packages/app/src/slices/rebuild/recipe-voices.ts:233`). |
| `audio:provided` | Uploaded whole narration (`packages/app/src/slices/rebuild/recipe-audio.ts:78`). |
| `audio:body:concat`, `audio:intro`, `audio:outro` | Joins (`packages/app/src/slices/rebuild/recipe-audio.ts:177`, `:279`). |
| `level:intro`, `level:body`, `level:outro` | Levelled joins (`packages/app/src/slices/rebuild/recipe-loudness.ts:25`). |
| `narration:files:<segment>` | `narration-files-v1` text downloads (`packages/app/src/slices/rebuild/recipe-narration-text.ts:14`). |
| `voices:files` | `audio-files-v1` MP3/M4B (`packages/app/src/slices/rebuild/recipe-exports.ts:99`). |

## Communication

### Internal payloads

| Boundary | Request → response |
| --- | --- |
| Preparation | `{direction, sentences:{sentence:number,text:string}[]}` (plus optional speaker) → JSON `{cues: Cue[]}`, validated by `validatePreparation` (`packages/app/src/slices/narration/preparation.ts:54`, `:102`). |
| Request construction | clean `source`, `cues`, `maxCharacters`, optional spans → `{ok:true, requests: PreparedRequest[]}` (`{text, spokenText}`) or `{ok:false, reason}` (`packages/app/src/slices/narration/steering.ts:4`, `:101`). |
| Synthesis | `TtsCall {provider, model?, voiceId, text, dialogue?: {voiceId,text}[]}` → `AttemptResult<NarratedAudio {bytes, container:"mp3"}>` (`packages/app/src/kernel/runner/providers.ts:45`, `:58`). Send: `packages/app/src/slices/rebuild/runtime-provider.ts:95`; the bytes are written as `narration.mp3` (`packages/app/src/slices/rebuild/runtime-provider.ts:116`). |
| Live preview | `observeNarration` streams chunks into the `AudioPreviewStore` (`packages/app/src/slices/rebuild/runtime-provider.ts:107`, `packages/app/src/kernel/audio-preview.ts:19`). |
| Transcript assembly | selected pieces + saved recipes → `NarrationTextPart[]`; published as `<segment>-narration.txt` (clean) and `<segment>-tts-script.txt` (exact requests, blank-line separated), roles `narration_txt` / `tts_script` (`packages/app/src/slices/rebuild/runtime-narration-text.ts:25`, `:85`). |

`Cue`, `PreparedRequest`, `Speaker` and `VoicesSettings` fields are in [02-models-narration.md](02-models-narration.md).

### HTTP

| Route | Request | Response; sites |
| --- | --- | --- |
| `GET /api/pronunciations/shared?except=<id>` | optional `except` (≤64, `[0-9A-Za-z_-]*`) | `SharedGlossary {entries: {term, ipa[]}[], projects:number}`. Route `packages/app/src/edge/http/pronunciations.ts:21`; client `packages/web/src/api.ts:1000`. |
| `GET /api/pronunciations/aliases` | — | `{aliases: NarrationAlias[]}`. Route `packages/app/src/edge/http/pronunciations.ts:36`; client `packages/web/src/api.ts:1008`. |
| `PUT /api/pronunciations/aliases` | `{aliases: unknown[]}` (≤2,000) | `{aliases}` or 400 problem with `fields: {field, message}[]`. Route `packages/app/src/edge/http/pronunciations.ts:39`; client `packages/web/src/api.ts:1013`. |
| `POST /api/auditions/quote` | `{lines: {provider, model, text≤300, speaker}[]}` (1–10) | `{estimate}` (null without a catalogue). Route `packages/app/src/edge/http/auditions.ts:40`; client `packages/web/src/api.ts:1039`. |
| `POST /api/auditions` | `{provider, model, text, voice, confirmed: true}` | `audio/mpeg` bytes, or 409 held / 502 provider error / 500 unavailable. Route `packages/app/src/edge/http/auditions.ts:55`; client `packages/web/src/api.ts:1045`. |
| `GET /api/projects/:projectId/audio-preview`, `.../audio-preview/:previewId` | path ids | preview list JSON; growing MP3 stream without ranges (`packages/app/src/edge/http/audio-preview.ts:21`, `:32`); client `packages/web/src/project/live-audio.tsx:24`. |
| `GET /api/projects/:projectId/narration/peaks` | path id | `NarrationPeaks` of finished pieces of the current revision (`packages/app/src/edge/http/narration-peaks.ts:36`). |
| `GET /api/projects/:id/revisions/:revisionId/narration-chunks` | path ids | `{chunks: {key, spokenText}[] \| null}` in spoken order (`packages/app/src/edge/http/revisions.ts:110`, `packages/app/src/slices/rebuild/runtime-narration-text.ts:155`). |
| `POST /api/projects/:id/revisions`, `.../revisions/restore` | `{baseRevisionId, idempotencyKey, edit}` / `{baseRevisionId, idempotencyKey, targetRevisionId}` | `RevisionMutationResult` or problem (`packages/app/src/edge/http/revisions.ts:124`, `:136`, `packages/app/src/slices/revisions/schema.ts:145`). |

Narration downloads are ordinary file routes (`GET /files/:projectId/:asset`, `packages/app/src/edge/http/files.ts:45`).

## Composition

`buildRecipes` composes text → audio → exports, then passes `audio.levels` into `masterPlan` for the video, shorts and audio files, adding line levelling for multi-voice runs (`packages/app/src/slices/rebuild/recipe-build.ts:28`, `:62`, `:77`). `audioRecipes` branches on provided audio, multi-voice script, or single-voice groups, then plans intro/outro joins, level recipes and narration text files when preparation or glossary is active (`packages/app/src/slices/rebuild/recipe-audio.ts:55`). Its `mediaFingerprint` covers the ordered join identities plus `silenceGapSeconds` and `edgeSilenceSeconds` (`packages/app/src/slices/rebuild/recipe-audio.ts:319`). Sentence/paragraph pauses are carried in join values by `pauseValues` (`packages/app/src/slices/rebuild/recipe-pauses.ts:11`) and inserted by `applyPauses` (`packages/app/src/slices/narration/pauses.ts:347`).

Request identity includes exact sent text, voice/model selection, segment and whole-text identity; work identity adds the regeneration token (`packages/app/src/slices/narration/plan.ts:36`, `:65`). Reused audio is rebound by `bindNarrationReuse` and late publication by `rebindPublishedNarration` (`packages/app/src/slices/rebuild/runtime-narration-reuse.ts:13`, `packages/app/src/slices/rebuild/runtime-narration-publication.ts:10`).

TTS adapters are constructed once in `buildRegistry` (`packages/app/src/adapter-registry.ts:104`) and reached through `registry.tts(id)`; the stage wrapper supplies retries and a per-call continuation token (`packages/app/src/kernel/runner/providers.ts:266`).

## Frontend

Narration controls render inside the client-rendered React SPA (`createRoot` at `packages/web/src/main.tsx:40`; Vite with React and Tailwind plugins at `packages/web/vite.config.ts:13`).

| Surface | Component |
| --- | --- |
| Play: glossary switch, aliases switch, preparation, loudness | `PronunciationGlossary` (`packages/web/src/play/pronunciation-glossary.tsx:4`), `NarrationAliasesToggle` (`packages/web/src/play/narration-aliases.tsx:6`), `PlayLoudness` (`packages/web/src/play/loudness.tsx:15`) |
| Library → Aliases (`/narration-aliases` under the library layout) | `NarrationAliasesRoute` (`packages/web/src/routes/narration-aliases.tsx:28`, `packages/web/src/router.tsx:305`) |
| Speakers, voices, per-speaker pronunciations, auditions | `SpeakersEditor` (`packages/web/src/voices/speakers-editor.tsx:46`) |
| Volume control | `LoudnessControls` (`packages/web/src/video/loudness-controls.tsx:29`) |
| Project narration editing and downloads | `NarrationEditor` (`packages/web/src/project/narration-editor.tsx:76`), `RevisionNarration` (`packages/web/src/project/revision-narration.tsx:7`), `narrationFiles` (`packages/web/src/project/narration-downloads.tsx:21`) |
| Live narration audio and waveform | `LiveAudio` (`packages/web/src/project/live-audio.tsx:10`), `useWaveform` (`packages/web/src/project/waveform.tsx:31`) |
