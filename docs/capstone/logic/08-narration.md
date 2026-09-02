---
scenario: narration
mockup_row: S6
screens: [06-play, 08-project]
depends_on: [01-pipeline-lifecycle, 02-provider-credentials, 05-provided-outputs, 07-article-writing]
implements: [Q63, Q64, Q65, Q66, Q67, Q68, Q69, Q93, Q96]
generated_date: 2026-09-02
capstone_version: 5.2.0
source: logic-interview.md
---

# 08 Narration

The audio stage: end matter split out, the body chunked per the user's choice, synthesized in parallel, concatenated into one file. Rules cite `logic-interview.md §Q<n>`.

## Trigger & preconditions

- Trigger: scenario 01 step 4 starts the audio stage when the article is `done` or `provided` and the audio source is Generate.
- Preconditions: TTS provider keyed, voice chosen from the settings list, chunking mode chosen (scenarios 02, 04); plain-text narration source on the project (scenario 05 §Q37, scenario 07 §Q57).
- Actor: none beyond the pipeline (D1 not in play, §Q69).

## Steps

1. End-matter split, run once when the article becomes `done` or `provided`: find the first section whose heading is "Sources Consulted" or "Pronunciation Glossary" (case-insensitive); that section and everything after it are removed from the narration source and written as two separate files on the project, sources and glossary, each shown and downloadable beside the article (§Q63, §Q64). Chapter headings stay and are spoken (§Q63). The glossary is a file only; its IPA is never sent to the TTS (§Q69).
2. Chunk the narration source per the run's chunking choice (§Q65): Whole text = one request; Per paragraph = one request per paragraph; Every ~N words = consecutive chunks, each ending at the last sentence boundary at or before N words, default N = 500 (§Q69).
3. Synthesize every chunk in parallel with the chosen provider and voice; stream into the page when the provider streams (scenario 01 §Q6).
4. Concatenate the chunk audio in chunk order with no added silence; provider default sample rate; one output file whose container is `stack`'s (drawn as mp3 in the mockup) (§Q65).
5. Intro and outro: each picked segment's text is one TTS request with the same provider and voice, stored as its own audio file with its duration; body chunking does not apply to them (§Q93). A failed request fails the audio stage under the same rules (§Q96).
6. Store on the project: the text sent per chunk and per segment, provider, voice, chunking choice, and every audio duration (§Q68, §Q93). Durations feed scenario 11 (video timing) and scenario 16 (audio hours).
7. Mark the stage `done`.

## Branches

- Article has the end-matter headings → files written and body trimmed; no such headings → nothing split, no files (§Q63).
- Chunking mode → step 2's three cases (§Q65).

## Unhappy paths

- Chunk call fails → scenario 01's retry policy per chunk, idle timeout when streamed (§Q66).
- One chunk exhausts its retries → the whole stage fails; manual retry keeps completed chunks and re-runs only failed or not-started ones, then concatenates (§Q66).
- Voice ID rejected by the provider → the error names the voice ID (scenario 02 §Q14).
- Whole text longer than the provider's per-request limit → the provider's error surfaces as the stage failure; no pre-check (§Q69).
- Narration source empty after the split → immediate stage failure "nothing to narrate", no retries (§Q67).
- Interrupted process → stage failed "interrupted" (scenario 01); completed chunks kept for the retry.
- Cancel → scenario 13.

## State transitions

- Stage: per scenario 01.
- Per chunk, persisted for resume: `pending` → `running` → `done` | `failed` (§Q66).

## Invariants

- Narration never contains end matter (§Q63).
- Chunk order is preserved in the output file (§Q65).
- Audio duration is recorded before the video stage starts (§Q68; scenario 01 step 5).
- The concatenated body file plus the picked intro and outro files are the project's only audio outputs (§Q65, §Q93).

## Outcomes & side effects

- Success: one audio file, its duration, the per-chunk record, the sources and glossary files on the project; video may start once images and thumbnail are also ready.
- Failure: stage `failed` with the provider's error text (scenario 01).
- Audio hours counted by scenario 16 telemetry.

## Dimensions not in play

- D1 authority: no actor beyond the pipeline (§Q69).
- D5 money: nothing charged in-app (§Q69).
- D6 limits: no cap on text length or chunk count; the provider's own limits surface as errors (§Q69).
- D13 notification: no channel (§Q69).
