---
scenario: speakers-and-voices
screens:
- 02-play
- 03-project
- 08-settings
depends_on:
- 02-provider-credentials
- 08-narration
- 17-subtitles
- 18-cost-review-batch
- 24-project-templates
generated_at_commit: d83482c1175e
generated_date: 2026-10-02
capstone_version: 7.0.1
content_hash: 22bbc4a58045
paths_covered:
  - ":(top)packages/app/src/slices/voices/**"
  - ":(top)packages/app/src/slices/settings/voices.ts"
  - ":(top)packages/app/src/slices/channels/runs.ts"
  - ":(top)packages/app/src/slices/studio/pack.ts"
  - ":(top)packages/app/src/slices/rebuild/runtime-voices.ts"
  - ":(top)packages/app/src/slices/rebuild/recipe-exports.ts"
  - ":(top)packages/app/src/kernel/runner/audition.ts"
  - ":(top)packages/app/src/kernel/ports/tts.ts"
  - ":(top)packages/app/src/kernel/ports/system-speech.ts"
  - ":(top)packages/app/src/adapters/tts/voice-languages.ts"
  - ":(top)packages/app/src/adapters/tts/system.ts"
  - ":(top)packages/app/src/edge/http/auditions.ts"
  - ":(top)packages/app/src/edge/http/settings.ts"
  - ":(top)packages/app/src/edge/http/providers.ts"
  - ":(top)packages/web/src/voices/**"
  - ":(top)packages/web/src/language/voice-language.tsx"
---

# 34 Speakers and voices

The saved voice library (Settings → Voices: add, remove, languages, "Imitates a real person"), the keyless system voice's engine list, a multi-voice run's speaker list (format, roles, cast picks, channel hosts, pace, per-speaker pronunciations), paid auditions with a free quote, and how speakers are presented afterwards (colours, name tags, speaker panel, portraits, MP3/M4B listening files). How speaker turns are scripted, grouped, synthesised, joined and levelled line by line belongs to `08-narration.md` (Branches → Multiple voices); cast member CRUD and pictures belong to the channels scenario (`30-channels-and-cast.md`); provider keys to `02-provider-credentials.md`.

## Trigger & preconditions

- **Voice library.** Settings → Voices calls `/api/settings/voices` (`packages/app/src/edge/http/app.ts:214`): `GET` lists (`packages/app/src/edge/http/settings.ts:148`), `POST` adds (`settings.ts:149`), `PUT /voices/:id/languages` (`settings.ts:179`), `PUT /voices/:id/real-person` (`settings.ts:206`), `DELETE /voices/:id` (`settings.ts:226`). No provider key is required to save a voice and nothing is verified against the provider (`packages/app/src/slices/settings/voices.ts:46`).
- **System voice engines.** `GET /api/providers/system-voice/voices` (`packages/app/src/edge/http/providers.ts:175`) lists the speech programs found on the computer, each with its voices and a default voice, plus an `issue` string when none is usable.
- **Speakers.** A run has speakers when `config.voices` is set and audio is Generate (`usesVoices`, `packages/app/src/slices/voices/model.ts:150`). The Speakers editor (`packages/web/src/voices/speakers-editor.tsx:46`) is shown in Play → Narration (`packages/web/src/play/media-rails.tsx:155`) and Edit project → Providers (`packages/web/src/project/revision-providers.tsx:316`).
- **Auditions.** `POST /api/auditions/quote` and `POST /api/auditions` (`app.ts:210`, `packages/app/src/edge/http/auditions.ts:40`, `:55`). The Audition button is enabled once a speaker has provider, model and voice (`speakers-editor.tsx:518`).
- **Cast voices.** A cast member can be picked as a speaker only when it has a voice (`speakers-editor.tsx:98`); the channel's host members with a voice seed a new podcast or interview (`packages/app/src/slices/voices/cast.ts:12`).

## Steps

1. **Add a voice** (`addVoice`, `settings/voices.ts:49`). The provider must be a TTS-family provider; name and voice ID are trimmed, each 1–200 characters (`voices.ts:28`, `:50`–`:66`). Languages typed in the form are normalised to unique lower-case 2–3 letter codes; an empty list is "unknown" (`voiceLanguagesOf`, `voices.ts:93`). When the form sends no languages, the route asks the provider's `voiceLanguages` (`settings.ts:152`); the lookup never throws and answers `undefined` on any failure (`packages/app/src/main.ts:630`, `packages/app/src/kernel/ports/tts.ts:47`). The row is inserted into `voices` with `UNIQUE(provider, voice_id)` (`packages/app/src/kernel/db/migrations/0001-init.sql:12`); names may repeat.
2. **Provider language lookups** (`packages/app/src/adapters/tts/voice-languages.ts`): one GET with an 8 s timeout, any non-OK or error is no answer (`voice-languages.ts:19`). ElevenLabs reads `verified_languages[].language/locale`, `labels.language`, `fine_tuning.language` (`:50`); Cartesia `language` and `accents[].locale` (`:65`); Inworld `languageCode`, `langCode`, `promptLanguages` (`:81`). Every value is reduced to its primary subtag (`primaryLanguages`, `:7`). The system voice answers the installed voice's primary language (`packages/app/src/adapters/tts/system.ts:106`). OpenAI has no lookup (`tts.ts:47`).
3. **Edit languages** (`setVoiceLanguages`, `voices.ts:102`) rewrites `languages_json` (`packages/app/src/kernel/db/migrations/0038-voice-languages.sql:7`); an empty list stores unknown.
4. **Imitates a real person** (`setVoiceImitatesRealPerson`, `voices.ts:153`). Flagged voice ids live as one sorted JSON array in the `settings` row `voices.realPerson` (`voices.ts:132`, `:147`); the row is deleted when the list empties. `voices()` merges the flag into each listed voice (`voices.ts:123`). Removing a voice also drops it from the flag list (`voices.ts:114`).
5. **Pick a format** (`speakers-editor.tsx:76`). Empty is single-voice narration (`config.voices` absent). A new format starts from `defaultVoicesSettings` (`model.ts:96`): source `script`, turn gap 0.35 s, `nameTags` on for podcast/interview, `nativeDialogue` on, `audioFiles` on. Starter speakers: audiobook Narrator; podcast Alex + Sam (hosts); drama Narrator + Mara (character); interview Host + Guest (`model.ts:127`). For podcast and interview the channel's hosts replace the placeholders: up to 9 hosts, a podcast keeps placeholders only while it has fewer than two hosts, an interview keeps its guest after the hosts (`withHosts`, `model.ts:113`). Switching format on an existing list keeps the speakers and forces source `script` unless the new format is audiobook (`speakers-editor.tsx:86`).
6. **Add speakers.** "Add speaker" makes `speaker-<n>` / "Speaker n", role character, no voice (`newSpeaker`, `speakers-editor.tsx:319`), disabled at 10 speakers (`speakers-editor.tsx:178`, `model.ts:25`). "Add from the cast" lists voiced members not already cast (`speakers-editor.tsx:98`, `:184`) and adds `speakerFromCast` (`cast.ts:40`) with role from `castRole` (`speakers-editor.tsx:312`): podcast → host; interview → host until one exists, then guest; other formats → narrator until one exists, then character. A cast speaker's id is `cast-<member id lower-cased>` when it fits `[a-z0-9-]{1,55}`, else `cast-h<cyrb53 hash>` (`castSpeakerId`, `cast.ts:21`); its name is cut to 40 characters; pace is stored only when not 1; pronunciations only when non-blank; `castId` and `portrait` (SHA-256 of the member's first ready picture) are recorded (`cast.ts:40`–`:62`). The last speaker cannot be removed (`speakers-editor.tsx:167`).
7. **Per speaker**: name, role, voice (provider/model/voice), pace from `0.8, 0.9, 1, 1.1, 1.2`, and pronunciations (`Term: /IPA/` lines, max 20,000 characters) (`model.ts:27`, `:37`–`:59`). The voice picker lists voices that speak the project language, or all when "show all" is ticked; unknown-language voices and the chosen voice are always listed (`packages/app/src/slices/voices/languages.ts:18`, `packages/web/src/language/voice-language.tsx:9`). A chosen voice listed for other languages gets a warning, never a refusal (`voiceLanguageWarning`, `languages.ts:30`).
8. **Audition**. The line is the speaker's first turn in the script parsed so far, else a role sample line naming the speaker; over 200 characters it is cut at the last `. `/`? `/`! ` past character 60, else at the last space plus "…" (`auditionLine`, `packages/app/src/slices/voices/audition.ts:8`). The quote request (`auditions.ts:40`) prices 1–10 lines through `estimateRequests` against the catalogue (see `18-cost-review-batch.md`); no catalogue answers `{ estimate: null }`. The button reads "Audition · about $X" (the estimate's high value), or "price unknown" when any line is unpriced (`speakers-editor.tsx:547`); quotes are cached 60 s per provider/model/line (`speakers-editor.tsx:518`). Speaking requires body `confirmed: true` and text 1–300 characters after trim (`auditions.ts:24`, `:35`); the call goes through the attempt wrapper with no attempt rows and no queue (`auditionVoice`, `packages/app/src/kernel/runner/audition.ts:25`) and returns `audio/mpeg` with `no-store` (`auditions.ts:75`). The page plays it immediately (`speakers-editor.tsx:534`).
9. **Validation at start** (`voicesFields`, `packages/app/src/slices/admission/rules.ts:453`, called at `rules.ts:126`): the `voicesProblems` list (Branches) plus, when Narration Preparation is non-blank, at least one speaker on Inworld `inworld-tts-2`.
10. **Cast voices at start.** Every door a run starts through (project create, batch/queue planning, Play review) passes the draft through `castVoicedRun` (`packages/app/src/slices/channels/runs.ts:151`; callers `packages/app/src/edge/http/project-create.ts:29`, `packages/app/src/edge/http/planning.ts:42`, `packages/app/src/slices/play-drafts/review-inputs.ts:99`). Each speaker with a `castId` whose member still exists with a voice takes the member's current voice, pace, pronunciations and portrait; name, role and id stay (`withCastVoices`, `cast.ts:66`).
11. **Presentation after narration.**
    - Colour per speaker by list position from six values, wrapping at the seventh (`packages/app/src/slices/voices/palette.ts:4`, `:13`).
    - Caption name tags "Name: " when `nameTags` is on (`packages/app/src/slices/subtitles/captions.ts:93`, `:104`); word-to-speaker attribution matches each timed word's first token within a 60-token lookahead, an unmatched word keeping the previous speaker (`attributeWords`, `packages/app/src/slices/voices/timing.ts:22`); a hand-edited cue takes the speaker with most overlap, else the nearest word's (`cueSpeaker`, `timing.ts:55`). Caption timing itself is `17-subtitles.md`.
    - Podcast and interview draw a speaker panel with the captions: one row of square tiles at 11% of the short side, gap 30% of a tile, 5% from the top (`panelTiles`, `packages/app/src/slices/voices/panel.ts:51`); consecutive cues of one speaker with gaps under 1.5 s form one lit run (`speakerRuns`, `panel.ts:23`); the lit speaker gets a coloured outline and a lower-third name at 74% height (`panel.ts:93`–`:106`). A tile shows initials (first+last word initials, or the first two letters of one word, `panel.ts:35`) unless the speaker has a portrait. The Play/Edit notice says the panel needs captions burned in (`speakers-editor.tsx:237`).
    - Portraits: bytes read from the cast image store, only PNG or JPEG; others fall back to initials (`panelPortraits`, `packages/app/src/slices/voices/portraits.ts:23`). They are written beside the caption file as `portrait-<n>.png|jpg` at the tile positions of the caption file's frame, `subtitleFrame(format)`: 1920×1080, 1080×1920 or 1080×1080 (`writePortraits`, `portraits.ts:53`, `:67`; `packages/app/src/slices/subtitles/layout.ts:4-10`; called at `packages/app/src/slices/rebuild/runtime-export.ts:86`).
12. **Listening files** (`audioFiles` on). Planned as `voices:files`, operation `audio-files-v1`, after caption timing (`packages/app/src/slices/rebuild/recipe-exports.ts:95`). `executeVoicesRecipe` (`packages/app/src/slices/rebuild/runtime-voices.ts:25`) reads word timing, computes chapters from the script sections (first chapter from 0, a section starting at or before the previous point replaces its title, one chapter titled after the project when none is heard, `audioChapters`, `packages/app/src/slices/voices/audio-files.ts:16`), writes FFMETADATA with album/track when the project is a book chapter (`ffmetadata`, `audio-files.ts:49`), then encodes `narration.mp3` (libmp3lame 128k, ID3v2.3) and `audiobook.m4b` (AAC 96k, faststart) from the same 44.1 kHz stereo timeline (`audioFileArgs`, `audio-files.ts:75`; `runtime-voices.ts:79`, `:116`). The files' fingerprint carries the project's kept subject (`subjectOf`, `packages/app/src/slices/admission/model.ts:285`) rather than its current title, so renaming a project does not remake them (`recipe-exports.ts:109`). Mastering of these files is `35-audio-levelling-and-ambient.md`.

## Branches

- **Speaker rules** (`voicesProblems`, `model.ts:171`), each message naming Speakers (Play → Narration, or Edit project → Providers): at least one speaker; `attribute` source only for audiobooks; podcast and interview need ≥2 speakers; audiobook and drama need a speaker with role narrator; a name is required, must match `^[\p{L}\p{N}][\p{L}\p{N} .'-]*$`, be unique case-insensitively, max 40 (`model.ts:26`, `:204`–`:216`); ids unique; provider and model required, then voice; pace from the list; book title non-blank and chapter an integer 1–9999 when a book is set (`model.ts:66`, `:240`); turn gap from `0, 0.2, 0.35, 0.5, 0.8, 1.2` (`model.ts:28`, `:257`).
- **Cast member voice** (`castVoiceSchema`, `packages/app/src/slices/channels/schema.ts:106`): provider ≤100, model ≤200, voice ≤200 (all trimmed, non-empty), pace from the same steps, pronunciations ≤20,000; `null` removes the voice, absent keeps it; `host` is a boolean column added by `0041-cast-hosts.sql` (`packages/app/src/kernel/db/migrations/0041-cast-hosts.sql:3`).
- **Hosts** are members with `host === true` and a voice, in cast order, cast with role host (`castHosts`, `cast.ts:12`). Other formats ignore hosts (`model.ts:118`).
- **System voice** (`packages/app/src/adapters/tts/system.ts:16`). Engines, best first: `say` (macOS), `sapi` (Windows), `piper`, `pico2wave`, `espeak-ng`, `espeak` (`packages/app/src/kernel/ports/system-speech.ts:6`). Detection is cached per probe/platform/container/Piper voice path for 60 s (`system-speech.ts:237`, `:243`). The default voice is "Samantha", else the first `en-US`, else the first English, else the first voice (`defaultSpeechVoice`, `system-speech.ts:219`); a request with voice id `""` or `default` uses it (`system.ts:121`). Text reaches the program through a file, stdin (Piper) or a single argument (Pico), and Windows input through environment variables, never a shell string (`system.ts:35`, `:47`).
- **Real-person disclosure.** The Studio upload pack names every flagged saved voice matching the project's narration voice, or any speaker's voice in a multi-voice run, when audio is Generate (`realPersonVoicesOf`, `packages/app/src/slices/studio/pack.ts:283`); the AI disclosure then answers YouTube's first use case (`packages/app/src/slices/studio/disclosure.ts:76`).
- **Book.** With `book` set, the MP3/M4B carry the book as album and the chapter as track, and the files' fingerprint gains `["book-v1", title, chapter]` (`recipe-exports.ts:112`). Making the next chapter is `24-project-templates.md`.

## Unhappy paths

- **Add voice**: a duplicate `(provider, voice_id)` is caught from the UNIQUE constraint and returns `409` "This voice ID is already saved for this provider…" (`voices.ts:77`, `settings.ts:163`); every other reason returns `400` with one field message (blank/long name, blank/long voice ID, bad language code, non-TTS provider) (`settings.ts:240`–`:273`). A wrong voice ID is found only when narration or an audition uses it (`voices.ts:46`).
- **Languages / real-person on a deleted voice**: `404` "This voice no longer exists…" (`settings.ts:190`, `:216`); a bad code `400` on the `languages` field (`settings.ts:197`).
- **Delete a missing voice**: `404` (`settings.ts:227`). Deleting a voice does not touch projects or cast members that name it.
- **Audition**: body not confirmed or invalid → `400` from the validator (`auditions.ts:32`); no audition wired → `500` "Voice auditions aren't available in this build…" (`auditions.ts:57`); attempt held (`ok: false`) → `409` "The audition was held back…" (`auditions.ts:69`); provider error → `502` "The audition couldn't be spoken: <message>" (`auditions.ts:80`). Retry classification is the attempt wrapper's (`08-narration.md`, Unhappy paths). A client disconnect aborts through the request signal (`auditions.ts:67`).
- **System voice missing**: an engine no longer installed or no engine found fails with a fix naming Edit project → Providers or Settings → Providers (`system.ts:95`–`:97`); a voice not installed fails `unsupported` naming Settings → Voices (`system.ts:124`).
- **Cast member deleted or voiceless** at run start: the speaker keeps what was saved in the draft (`cast.ts:74`).
- **Portrait missing or not PNG/JPEG** (for example a backup from another install): initials tile (`portraits.ts:12`).
- **Listening files**: missing word timing → "The narration's word timing, which the chapter markers come from, is missing…" (`runtime-voices.ts:57`); no narration audio → message pointing to turn Audio files off under Speakers (`runtime-voices.ts:67`).
- **Language mismatch** is a warning only (`languages.ts:28`).

## State transitions

- `voices` rows: inserted, languages updated, deleted; the real-person flag is membership in `settings.voices.realPerson` (`voices.ts:132`). No soft delete.
- `config.voices` on a draft/revision: absent (single voice) ↔ set; speakers added/removed within 1–10. A saved project's speakers change only through Edit project → Providers (a revision edit, `12-reruns-and-edits.md`); editing the cast later changes no project already made (`cast.ts:4`–`:7`).
- `voices:files` is a revision work piece like any export (pending → running → done/failed, `01-pipeline-lifecycle.md`).

## Invariants

- A voice ID is unique per provider; names are not (`voices.ts:46`).
- A voice with unknown languages is offered for every language; the chosen voice is never hidden from its picker (`languages.ts:4`, `:17`).
- An audition is never spoken without `confirmed: true` and never writes attempt rows, project work or outputs (`auditions.ts:34`, `audition.ts:9`).
- A cast speaker's voice is the member's voice as of the run's start; a started project never follows later cast edits (`runs.ts:147`–`:150`).
- Speaker ids are stable across renames (`model.ts:38`).
- Portraits add fingerprint values only when a panel speaker has one, so captions without portraits keep their fingerprints (`portraitValues`, `portraits.ts:44`).

## Outcomes & side effects

Settings → Voices writes `voices` rows and the `voices.realPerson` setting; the list response includes `imitatesRealPerson: true` for flagged voices. An audition returns MP3 bytes to the browser only and bills one short provider request. A multi-voice run publishes coloured, optionally name-tagged captions, a speaker panel for podcast/interview (with portraits when available), and, with Audio files on, `narration.mp3` and `audiobook.m4b` with chapter markers (`runtime-voices.ts:79`). The Studio pack's AI disclosure reflects flagged voices.

## Dimensions not in play

- D1 Authority: single local user; no per-user permissions on voices or speakers.
- D5 Money: auditions show an estimate and bill the provider directly; no in-app charge.
- D6 Limits beyond those stated (10 speakers, 10 audition lines, 300-character line, 60 language codes) are absent; no rate limit on auditions.
- D7 Time: no expiry on voices, flags or cast picks.
- D13 Notification: none; results appear in place.
- D15 Record and audit: voice edits keep no history; auditions are not logged as attempts.
- Voice existence is never verified at save; service readiness checks only `config.audio`'s voice, not each speaker's (`08-narration.md`, Dimensions not in play). No voice cloning or voice design.
