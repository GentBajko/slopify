---
absorbed_from:
- features/2026-09-25-glossary-pronunciation@2026-09-25
- features/2026-09-24-narration-preparation@2026-09-24
- features/2026-09-09-pausable-optional-runs@2026-09-10
- features/2026-09-10-editable-projects@2026-09-12
scenario: narration
mockup_row: S6
screens:
- 06-play
- 08-project
depends_on:
- 01-pipeline-lifecycle
- 02-provider-credentials
- 05-provided-outputs
- 07-article-writing
generated_at_commit: e9226a34aa8a
generated_date: 2026-10-02
capstone_version: 7.0.1
content_hash: b4bf2fa1d611
paths_covered:
  - ":(top)packages/app/src/slices/narration/**"
  - ":(top)packages/app/src/slices/voices/model.ts"
  - ":(top)packages/app/src/slices/voices/script.ts"
  - ":(top)packages/app/src/slices/voices/grouping.ts"
  - ":(top)packages/app/src/slices/voices/join.ts"
  - ":(top)packages/app/src/slices/voices/attribution.ts"
  - ":(top)packages/app/src/slices/loudness/**"
  - ":(top)packages/app/src/slices/rebuild/recipe-audio*.ts"
  - ":(top)packages/app/src/slices/rebuild/recipe-preparation.ts"
  - ":(top)packages/app/src/slices/rebuild/recipe-pauses.ts"
  - ":(top)packages/app/src/slices/rebuild/recipe-loudness.ts"
  - ":(top)packages/app/src/slices/rebuild/recipe-voices.ts"
  - ":(top)packages/app/src/slices/rebuild/recipe-lines.ts"
  - ":(top)packages/app/src/slices/rebuild/recipe-describe.ts"
  - ":(top)packages/app/src/slices/rebuild/recipe-narration-text.ts"
  - ":(top)packages/app/src/slices/rebuild/recipe-model.ts"
  - ":(top)packages/app/src/slices/rebuild/recipe-work.ts"
  - ":(top)packages/app/src/slices/rebuild/narration-*.ts"
  - ":(top)packages/app/src/slices/rebuild/runtime-narration-*.ts"
  - ":(top)packages/app/src/slices/rebuild/runtime-local.ts"
  - ":(top)packages/app/src/slices/rebuild/runtime-provider.ts"
  - ":(top)packages/app/src/slices/rebuild/runtime-lines.ts"
  - ":(top)packages/app/src/slices/rebuild/service-readiness.ts"
  - ":(top)packages/app/src/slices/rebuild/preview-plan.ts"
  - ":(top)packages/app/src/slices/admission/rules.ts"
  - ":(top)packages/app/src/slices/admission/start.ts"
  - ":(top)packages/app/src/kernel/ports/narration-aliases.ts"
  - ":(top)packages/app/src/kernel/ports/text.ts"
  - ":(top)packages/app/src/kernel/runner/attempt.ts"
  - ":(top)packages/app/src/kernel/runner/retry-policy.ts"
  - ":(top)packages/app/src/kernel/runner/queue.ts"
  - ":(top)packages/app/src/catalog/registry.ts"
  - ":(top)packages/app/src/adapters/tts/**"
  - ":(top)packages/app/src/edge/http/pronunciations.ts"
  - ":(top)packages/web/src/play/draft-state.ts"
  - ":(top)packages/web/src/project/narration-editor.tsx"
  - ":(top)packages/web/src/project/revision-providers.tsx"
  - ":(top)packages/app/src/slices/revisions/model.ts"
  - ":(top)packages/app/src/slices/revisions/schema.ts"
---

# 08 Narration

Narration turns the article (or a multi-voice script) into audio: optional block descriptions, logical chunking, aliases and IPA pronunciations, optional delivery cues (Narration Preparation), physical TTS requests, then a join that can add sentence pauses and a levelled copy. Whole supplied audio follows the provided-content rules in scenario 05. Caption timing and the mismatch that triggers an automatic chunk retry belong to scenario 17; the export master (LUFS target of the finished video/audio files) belongs to scenario 11. `packages/app/src/slices/narration/run.ts:71` (`runNarration`, the pre-revision stage runner) is referenced only by tests under `packages/app/test/`; the revision recipes below are the live path.

## Trigger & preconditions

- Narration work is planned by `audioRecipes` (`packages/app/src/slices/rebuild/recipe-audio.ts:55`) whenever a revision's recipes are resolved. `sources.audio === "off"` plans nothing (`recipe-audio.ts:58`); `"provide"` plans one `audio:provided` recipe (`recipe-audio.ts:75`); `"generate"` plans the steps below. Saving an edit plans work; dispatch needs run admission or an explicit rebuild (scenario 01, 12).
- Generated narration needs a resolved article (or script). Article Off with Narration Generate is refused at admission: "Narration reads the article, and Article is Off." (`packages/app/src/slices/admission/rules.ts:656`).
- A rebuild that needs a new TTS submission requires a saved voice matching `config.audio` ("Choose a saved voice before rebuilding.") and a saved key for keyed providers (`packages/app/src/slices/rebuild/service-readiness.ts:112`, `:114`).
- Per-run switches, all on `VoiceChoice` (`packages/app/src/slices/admission/model.ts:41`): `usePronunciationGlossary`, `shareGlossary`, `useNarrationAliases`, `describeFigures`, `skipCode`. A fresh Play draft turns the first four on (`packages/web/src/play/draft-state.ts:36`); absent in saved work reads as off.
- Copies taken at project start (`packages/app/src/slices/admission/start.ts:56`): the shared glossary (other projects' pronunciations) when the glossary is used and `shareGlossary` is on, and Library → Aliases when `useNarrationAliases` is on and audio is Generate. Edit project → Providers refreshes both copies (`packages/web/src/project/revision-providers.tsx:46`, `:107`).

## Steps

1. **End matter.** `splitEndMatter` (`packages/app/src/slices/article/split.ts:40`) cuts Sources Consulted and the Pronunciation Glossary off the article; neither is narrated. The spoken body is `plainText` (`packages/app/src/slices/article/plain.ts:11`) unless descriptions are on.
2. **Describe tables and figures** (on when audio is Generate, `describeFigures` is on and an LLM is chosen, `rules.ts:612`). `narrationBlocks` (`packages/app/src/slices/narration/blocks.ts:65`) walks the Markdown: tables, images (with up to two caption/legend paragraphs), Mermaid/ASCII diagrams, display or unreadable math, and code become described blocks; `skipCode` drops code (`blocks.ts:277`). Inline math of ≤20 letters/digits reads as written, Greek names spelled out (`blocks.ts:409`). English lists gain "First/Then/Finally" or "a, b and c" (`blocks.ts:316`); other languages get one sentence per item. Blockquotes are wrapped in quotation marks (`blocks.ts:280`). Each described block is one LLM step `narration:describe:<n>` (`packages/app/src/slices/rebuild/recipe-describe.ts:94`) with kind-specific instructions (`packages/app/src/slices/narration/describe.ts:19`); a figure's uploaded picture is attached only for picture-capable text providers (`packages/app/src/slices/rebuild/runtime-provider.ts:487`). The answer is flattened by `spokenPassage` (`describe.ts:70`) and spliced in place; the narration stays unresolved until every passage has answered (`blocks.ts:79`).
3. **Logical chunks.** `chunkNarration` (`packages/app/src/slices/narration/chunk.ts:22`): `whole` (default for a run without the control, `chunk.ts:16`), `paragraph` (blank-line runs), `words` (default 500, Play max 10,000) or `characters` (default 3,000, Play max 1,000,000) (`packages/app/src/slices/play-drafts/convert.ts:326`). Word and character modes accumulate `Intl.Segmenter("en")` sentences and never split a sentence (`chunk.ts:64`, `:91`); han/kana/thai-family text counts words by the platform word breaker (`chunk.ts:44`).
4. **Keys and glossary grouping.** `pronunciationChunks` (`packages/app/src/slices/narration/pronunciation-chunks.ts:21`) keys each chunk `audio:body:<hash20>-<occurrence>`, merges neighbouring chunks when a glossary match crosses their boundary, and re-pins saved merged groups whose body and chunking fingerprints still match (`pronunciation-chunks.ts:62`). Chunks with a saved override are excluded from matching (`pronunciation-chunks.ts:83`).
5. **Overrides per logical chunk** (`packages/app/src/slices/rebuild/recipe-audio-parts.ts:28`): an asset override becomes a `provided` part (no TTS, no preparation); a text override replaces the chunk text before everything below. A text override may carry a `direction` (1–20,000 characters after trimming, `packages/app/src/slices/revisions/schema.ts:68`; `packages/app/src/slices/revisions/model.ts:28-36`): a delivery note for that chunk alone, appended after the rendered narration prompt in that chunk's preparation request (step 9), so only that group's preparation fingerprint changes (`packages/app/src/slices/rebuild/recipe-preparation.ts:75-87`).
6. **Aliases, then IPA.** Alias matches (`packages/app/src/kernel/ports/narration-aliases.ts:30`) are leftmost, longest at a tie, non-overlapping, optionally whole-word and case-sensitive. An alias span replaces any overlapping glossary span (`packages/app/src/slices/narration/aliases.ts:30`); a multi-word alias puts its spoken form on the first word and empties the rest (`aliases.ts:13`). Glossary spans become `/ipa/` per word (`packages/app/src/slices/narration/pronunciation.ts:230`). Aliases apply to any provider; IPA applies only to Inworld `inworld-tts-2`/`inworld-tts-2-flash` (`rules.ts:631`).
7. **Request size.** `maxCharacters` is the enabled catalogue model's `tts.maxCharacters` (a deprecated model keeps its limit), else the logical text length plus IPA expansion (`recipe-audio-parts.ts:61`). `wholeRequest` is true for intro/outro and for `whole` body chunking (`recipe-audio-parts.ts:57`).
8. **Physical requests.** With preparation: step 9. With any alias/IPA span: `prepareRequests` with no cues (`recipe-audio-parts.ts:108`) splits on word boundaries, keeping each span atomic, and records `text` (sent) and `spokenText` (clean). Otherwise `planNarration` (`packages/app/src/slices/narration/plan.ts:55`) splits with `splitText` (`packages/app/src/kernel/ports/text.ts:3`): cut at the last sentence end past half the limit, else the last whitespace, never inside a surrogate pair. Parts are keyed `<logicalKey>:<n>`.
9. **Narration Preparation** (active when audio is Generate and the Narration Preparation prompt is non-blank, `rules.ts:432`). One LLM step `narration:prepare:<segment>:<logicalKey>` per logical group (`packages/app/src/slices/rebuild/recipe-preparation.ts:79-81`). The request carries the contract, the rendered narration prompt (plus the chunk's own `direction`, step 5) and the numbered source sentences with aliases already applied (`packages/app/src/slices/narration/preparation.ts:102`); a non-English run adds "Directions stay in English" (`preparation.ts:116`); a multi-voice turn adds the speaker's name and role (`preparation.ts:122`). The answer is validated (`preparation.ts:54`) and rendered into requests with bracketed tags by `prepareRequests` (`packages/app/src/slices/narration/steering.ts:101`).
10. **Submission.** Each `tts` part runs through the wrapped provider call (`runtime-provider.ts:94`) behind the app-wide queue: at most five calls, per-provider limit clamped to 1–5 (`packages/app/src/kernel/runner/queue.ts:12`). The registry refuses text over the model limit before submitting (`packages/app/src/catalog/registry.ts:185`). Streaming providers feed a live audio preview keyed by revision/work/piece (`packages/app/src/slices/narration/live.ts:8`). The bytes are stored as an asset with `logicalKey`, `logicalText`, `text`, `spokenText`, provider/model/voice and measured duration (`runtime-provider.ts:116`).
11. **Join.** Body, intro and outro each have a `concat-narration` local step (`recipe-audio.ts:175`, `:277`); a single part is copied, several are re-encoded with libmp3lame 128k via the concat demuxer (`packages/app/src/slices/narration/concat.ts:37`, `:83`). Duration is measured from a full decode of the written file (`concat.ts:107`). With pauses set, silence is inserted first (Branches). The step publishes `audio_body`/`audio_intro`/`audio_outro` (`packages/app/src/slices/rebuild/runtime-local.ts:240`).
12. **Level the volume** (on when `config.loudness` is set and audio is not Off, `packages/app/src/slices/loudness/model.ts:146`; a new run takes Settings → General's default, which is on). Beside every generated join a `level:<segment>` step repeats the join from the same pieces, each brought to −20 LUFS / −2 dBTP first (`packages/app/src/slices/rebuild/recipe-loudness.ts:29`, `packages/app/src/slices/loudness/level-pieces.ts:15`). It publishes `audio_levelled` with a `LoudnessReport` (pieces, skipped, spread before/after) (`runtime-local.ts:240`, `loudness/model.ts:188`). Word timing reads the plain join, so the levelled copy never re-times captions (`recipe-loudness.ts:16`). Uploaded narration is never levelled (`recipe-audio.ts:207`).
13. **Narration text files.** With preparation or the glossary in use, `narration:files:<segment>` (`packages/app/src/slices/rebuild/recipe-narration-text.ts:9`) publishes `<segment>-narration.txt` (clean words) and `<segment>-tts-script.txt` (exact request text with tags/IPA) (`packages/app/src/slices/rebuild/runtime-narration-text.ts:116`).

## Branches

- **Multiple voices** (`config.voices` set and audio Generate, `packages/app/src/slices/voices/model.ts:150`). Formats `audiobook`, `podcast`, `drama`, `interview`; roles `narrator`, `host`, `guest`, `character`; at most 10 speakers (`model.ts:7`, `:16`, `:25`). Source `script` asks the LLM for a script (`packages/app/src/slices/voices/script.ts:175`); `attribute` (audiobooks only) hands an existing text's passages to speakers and rejects an answer that keeps <90% of the source words in order or adds more than max(3, 10%) words (`packages/app/src/slices/voices/attribution.ts:36`). `parseScript` (`script.ts:44`) requires every non-blank line to be a heading, a rule, a `Name:` turn of a known speaker (case-insensitive, optional `**`), or a continuation line; headings become sections (chapters); bracketed stage directions are removed (`script.ts:128`).
  - Turns are grouped by `groupTurns` (`packages/app/src/slices/voices/grouping.ts:52`): with `nativeDialogue` on, consecutive turns on ElevenLabs `eleven_v3` (≤10 voices, ≤2,000 characters) or Gemini TTS preview models (≤2 voices, ≤3,000 characters) share one request as long as provider, model and pace match (`grouping.ts:21`, `:82`); otherwise one request per turn. Lengths are measured after aliases (`packages/app/src/slices/rebuild/recipe-voices.ts:152`).
  - Logical key per group `audio:body:turn:<first turn index>` (`recipe-voices.ts:233`). A native group sends `dialogue` lines with aliases applied per turn and no IPA or preparation (`recipe-voices.ts:251`); its request fingerprint is `narration-dialogue-v1` over each line's voice and text (`packages/app/src/slices/rebuild/recipe-model.ts:203`).
  - A per-turn group uses the speaker's own `pronunciations` (Glossary format) first, then the run glossary if on, only when the speaker's voice is Inworld TTS-2/TTS-2 Flash (`recipe-voices.ts:381`, `:415`). Preparation applies only to speakers on `inworld-tts-2` (`recipe-voices.ts:404`).
  - The join is `concat-turns-v1` (`recipe-voices.ts:188`, `packages/app/src/slices/rebuild/runtime-local.ts:357`): every part resampled to 44.1 kHz mono, `atempo` at the speaker's pace (0.8–1.2), `apad` of the turn gap (0–1.2 s, default 0.35) after a turn's last part, none after the last turn (`packages/app/src/slices/voices/join.ts:16`, `model.ts:27`). Pace and gap cost no provider call.
  - With the volume levelled, a multi-voice body is also levelled line by line at export time: each line's median momentary loudness is brought within 1 LU of the narrator's median, gains capped at ±10 dB and switched in the middle of the pause before the line (`packages/app/src/slices/loudness/line-level.ts:60`, `packages/app/src/slices/rebuild/runtime-lines.ts:16`). It waits for word timing and adds no fingerprint value (`packages/app/src/slices/rebuild/recipe-lines.ts:18`).
- **Pronunciation Glossary parsing** (`pronunciation.ts:78`): list/plain `Term: /ipa/` lines and Term|IPA tables (a bare table cell is treated as one `/…/`, `pronunciation.ts:56`). English (or no language) accepts only the standard-English IPA atom set; other languages accept full IPA (`pronunciation.ts:32`, `:37`). A row is skipped, not fatal, for a malformed pair, non-slash notation, invalid symbols, unequal word counts, or a conflicting earlier entry (`pronunciation.ts:97`–`:131`). Matching is whole-term, longest-first, Unicode case-insensitive, flexible inter-word whitespace, with hyphen/soft-hyphen/apostrophe boundaries (`pronunciation.ts:192`).
- **Shared glossary** (`packages/app/src/slices/narration/shared-glossary.ts:18`): the ready, selected `article:glossary` output of every other project's head revision, newest first; the first (newest) IPA for a term wins; unreadable files and unparseable glossaries contribute nothing. The project's own terms take precedence (`shared-glossary.ts:60`). Served at `GET /api/pronunciations/shared?except=` (`packages/app/src/edge/http/pronunciations.ts:21`).
- **Library → Aliases** (`packages/app/src/slices/narration/aliases-library.ts:40`): one ordered list saved whole via `PUT /api/pronunciations/aliases` (`pronunciations.ts:39`); each alias written 1–200 characters, spoken 1–500, at most 1,000 aliases, no two with the same written form under the same case rule (`packages/app/src/slices/narration/aliases-schema.ts:27`). Rows edited by hand into an invalid shape are dropped on read (`aliases-library.ts:24`).
- **Preparation cue rules** (`preparation.ts:25`–`:84`): JSON `{"cues":[...]}` only; kinds `instruction` (1–240 chars, no brackets/markup/control chars), `reset`, `sound` (`laugh`, `breathe`, `clear throat`, `sigh`, `cough`, `yawn`); sentence numbers in order and in range; at most one instruction/reset per sentence; no repeated sound at a sentence. `prepareRequests` carries the active instruction into each new physical request, never repeats a one-shot sound, and keeps tags, IPA spans and code points whole (`steering.ts:101`–`:184`).
- **Sentence pauses** (`packages/app/src/slices/narration/pauses-model.ts:19`): a sentence minimum (Play default 0.4 s) and a paragraph minimum (default 0), 0–2 s in 0.05 s steps (`pauses-model.ts:40`, `:69`). Neither set: the join's fingerprint is unchanged (`packages/app/src/slices/rebuild/recipe-pauses.ts:11`). When set, each piece is measured with silencedetect at min(−35 dBFS, piece loudness − 22 dB), ≥60 ms (`packages/app/src/slices/narration/pauses.ts:264`); sentence ends from the text (initials excluded, digits counted as spoken words, `pauses.ts:50`, `:61`) are matched in order to quiet stretches by dynamic programming within max(2 s, 20% of speech), stretches under 40% of the voice's usual pause are ignored (`pauses.ts:100`–`:207`); a matched stretch shorter than the minimum gets silence inserted at its middle; piece ends get what the gap to the next piece lacks, except before a turn or at the end (`pauses.ts:316`). Paragraph minimum = max(sentence, paragraph) (`pauses.ts:209`). Body pieces in `paragraph` chunking join across a paragraph boundary, other chunkings across a sentence (`recipe-audio.ts:187`). In a multi-voice join the inserted silence is multiplied by the speaker's pace (`runtime-local.ts:317`). Pauses are planned from the spoken pieces and applied to the levelled copies when levelling is on (`runtime-local.ts:201`).
- **Unknown text yet.** While the article, a description, an entry text or a preparation answer is pending, a deferred `audio:<segment>:future` recipe carries voice, chunking, preparation template, glossary and alias values so a change before the text lands still changes the plan (`recipe-audio.ts:145`, `:248`; `recipe-audio-parts.ts:196`, `:234`).
- **Reuse.** The request fingerprint is `narration-request-v1` over provider, model, voice, request text, segment and, for whole requests, the whole logical text (`plan.ts:36`). A regeneration token (`narrationRegenerationToken`, `plan.ts:86`, keyed per logical chunk or `audio:<segment>:future`) changes the work fingerprint; without one, any retained piece with the same request fingerprint and available bytes is reused (`packages/app/src/slices/rebuild/narration-reuse.ts:6`, `narration-history.ts:7`), including pieces from other revisions of the project (`runtime-narration-reuse.ts:13`).
- **Editor.** Edit project → Narration lists logical chunks in the server's spoken order, so "narration chunk N" matches a subtitle error's N (`packages/web/src/project/narration-editor.tsx:23`); `whole` chunking shows "Editing its text rebuilds the whole narration request." (`narration-editor.tsx:115`). The rebuild review repeats that notice and adds skipped glossary/speaker-pronunciation rows as warnings (`packages/app/src/slices/rebuild/recipe-work.ts:142`, `packages/app/src/slices/rebuild/preview-plan.ts:220`).
- **Inworld TTS-2 above 4,000 characters** switches to the asynchronous job API with a persisted continuation token; Flash above 4,000 is refused (`packages/app/src/adapters/tts/inworld.ts:95`, `packages/app/src/adapters/tts/inworld-async.ts:32`).
- **Providers**: `openai-tts`, `elevenlabs`, `cartesia`, `inworld` (streaming), `google-tts` (dialogue, non-streaming), and the keyless system voice that renders through the OS speech program and ffmpeg (`packages/app/src/adapters/tts/system.ts:16`); the registry's catalogue limit check skips the system voice (`registry.ts:176`).

## Unhappy paths

- **Invalid glossary rows**: skipped, term read as ordinary text; the notice names entry numbers and reasons, never contents, and points to Edit project → Article (`pronunciation.ts:140`). Speaker pronunciations likewise, pointing to Speakers (`pronunciation.ts:168`). A glossary that fails as a whole (`ok: false`) refuses every generated part with its reason (`recipe-audio-parts.ts:46`, `recipe-audio.ts:225`).
- **Alias save errors** return `400` with one "Alias N: …" message per row (`pronunciations.ts:49`, `aliases-schema.ts:41`).
- **Preparation**: an invalid answer fails the LLM check and goes through the attempt policy (`runtime-provider.ts:464`); a saved answer that no longer validates or fits refuses the group (`recipe-preparation.ts:130`–`:155`); empty text refuses with "Narration Preparation needs non-empty narration text." (`recipe-preparation.ts:103`). TTS never falls back to unprepared text. Admission refuses preparation with a non-TTS-2 single voice (`rules.ts:438`) or with no TTS-2 speaker in a multi-voice run (`rules.ts:468`).
- **Steering cannot fit** (tags, an indivisible IPA token or whitespace exceed the limit): the group is refused with the `cannotFit` reason (`steering.ts:11`).
- **Script errors**: a line that is not a turn, an unknown speaker, or no spoken turns refuses `audio:body:turn:1` with the line number and "Fix it in Edit project → Article" (`script.ts:84`, `recipe-voices.ts:138`); the article step already rejects such a script before it is kept (`runtime-provider.ts:362`). Attribution that drops or adds too many words fails the attempt (`attribution.ts:46`).
- **Provider failures**: four in-call attempts (backoff 2 s, 8 s, 30 s; 120 s timeout for TTS) (`packages/app/src/kernel/runner/attempt.ts:14`, `:19`); refusal/unsupported/auth/missing key/unavailable stop at once (`attempt.ts:29`); rate limit, timeout and dropped connection then wait up to four persisted times (~2, 4, 8, 16 min ±25%), and a Retry-After above one hour is reported instead (`packages/app/src/kernel/runner/retry-policy.ts:13`–`:52`). Completed pieces stay for reuse.
- **Over-limit saved request** after a catalogue limit drop: readiness refuses "This saved physical request exceeds the current model limit. Regenerate this narration group to plan new parts." (`service-readiness.ts:129`).
- **Missing piece at join**: "One narration chunk has no saved audio, so the narration can't be joined together. Regenerate the missing chunk in Edit project → Narration, then Try again." (`runtime-local.ts:179`).
- **Automatic chunk retry**: when caption alignment finds audio that does not match a chunk made by a voice (not uploaded, not hand-edited captions, not a `:turn:` key), the chunk is recorded again through Redo with a new regeneration token, at most `narrationRetryLimit` = 2 times per chunk (`packages/app/src/slices/rebuild/narration-retry.ts:13`, `:29`, `:120`; `runtime-subtitles.ts:406`). A deterministic idempotency key per try prevents a second recording after a restart (`narration-retry.ts:169`). When the Redo is refused because another step of the project is still running (its PDF, say), the retry is left `pending` and only logged; the next finished work kicks it again (`narration-retry.ts:143-151`). Retries are kicked after each finished work and at boot (`packages/app/src/main.ts:365`, `:490`). After the second try the message asks the person to reword the sentence at the given time.
- **Levelling**: a piece too short or quiet to measure keeps its level and is counted as skipped (`level-pieces.ts:30`). Line levelling throws if the word timing is missing (`runtime-lines.ts:32`).
- **Empty narration**: an empty body leaves the join unresolved (`recipe-audio.ts:200`); an empty preparation source is refused (above). Concurrency of two edits: an old completion publishes only to its originating revision (scenario 12).

## State transitions

Preparation, description and TTS parts are revision work pieces moving pending → running → done, or held for a retry wait, or failed; a pause or revision invalidation stops further dispatch while done pieces stay reusable (`packages/app/src/slices/rebuild/runtime-provider.ts:94`, `packages/app/src/kernel/runner/retry-policy.ts:4`). `narration_retries` rows move `pending` → `started` or `failed` (a Redo refused as `running` leaves the row `pending`), with `tries` 1–2 (`narration-retry.ts:39`, `:65`; `packages/app/src/kernel/db/migrations/0042-narration-retries.sql:4`). Library aliases are replaced as a whole list (`aliases-library.ts:48`); a project's copy changes only on Edit project refresh.

## Invariants

- The article Markdown, readable downloads, transcript and captions keep the written form; aliases, IPA and tags reach only the request text (`narration-aliases.ts:1`, `recipe-audio-parts.ts:84`, `recipe-voices.ts:253`). The caption aligner uses the same alias matcher (`packages/app/src/adapters/alignment/text.ts:25`).
- Prepared text preserves the source sentences exactly; a sentence number refers to `Intl.Segmenter("en")` sentences of the clean text even when aliases change the words (`preparation.ts:47`, `aliases.ts:44`).
- Pause insertion only adds silence: no existing pause is shortened and no word is cut (`pauses.ts:21`).
- The plain join, which word timing reads, is identical whether levelling is on or off (`recipe-loudness.ts:16`). Changing the volume target re-masters exports only; the piece level is fixed at −20 LUFS (`loudness/model.ts:50`).
- Projects saved before aliases, pauses, loudness, descriptions or voices keep their fingerprints: each adds a fingerprint value only when set (`recipe-audio-parts.ts:232`, `recipe-pauses.ts:4`, `recipe-loudness.ts:55`, `recipe-describe.ts:19`, `voices/model.ts:3`).
- Reuse requires the exact request fingerprint and bytes present on disk (`narration-reuse.ts:13`).

## Outcomes & side effects

Success writes one asset per physical request, joined `audio_body`/`audio_intro`/`audio_outro` with measured durations, an `audio_levelled` copy per segment with a loudness report when levelling is on, and `narration_txt`/`tts_script` downloads when preparation or the glossary applies (`runtime-local.ts:240`, `runtime-narration-text.ts:116`). The body's media fingerprint also covers the silence gap and edge silence (`recipe-audio.ts:317`). A multi-voice run exposes its script sections as chapters to the MP3/M4B export (`recipe-audio.ts:330`, `packages/app/src/slices/rebuild/runtime-voices.ts:25`). Joining clears the live audio previews of the pieces it consumed (`runtime-local.ts:289`). Reading downloads or previews makes no provider request.

## Dimensions not in play

No voice cloning in narration; no transcription of supplied audio into text; no translation of the article (the project language only selects IPA rules, list connectives and preparation wording, `pronunciation.ts:76`, `blocks.ts:54`, `preparation.ts:96`). Sentence segmentation is fixed to `Intl.Segmenter("en")` for every language (`chunk.ts:86`). Automatic chunk retry does not cover multi-voice turns (`runtime-subtitles.ts:406`). Service readiness checks only `config.audio`'s saved voice, not each speaker's (`service-readiness.ts:114`).
