---
scenario: narration
mockup_row: S6
screens: [06-play, 08-project]
depends_on: [01-pipeline-lifecycle, 02-provider-credentials, 05-provided-outputs, 07-article-writing]
generated_date: 2026-09-02
capstone_version: 5.2.0
---

# 08 Narration

The audio stage: end matter split out, the body chunked per the user's choice, synthesized in parallel, concatenated into one file.

## Trigger & preconditions

- Trigger: scenario 01 step 4 starts the audio stage when the article is `done` or `provided` and the audio source is Generate.
- Preconditions: TTS provider keyed, voice chosen from the settings list, chunking mode chosen (scenarios 02, 04); plain-text narration source on the project (scenario 05, scenario 07).
- Actor: none beyond the pipeline.

## Steps

1. End-matter split, run once when the article becomes `done` or `provided`: find the first section whose heading is "Sources Consulted" or "Pronunciation Glossary" (case-insensitive); that section and everything after it are removed from the narration source and written as two separate files on the project, sources and glossary, each shown and downloadable beside the article. Chapter headings stay and are spoken. The glossary is a file only; its IPA is never sent to the TTS.
2. Chunk the narration source per the run's chunking choice: Whole text = one request; Per paragraph = one request per paragraph; Every ~N words = consecutive chunks, each ending at the last sentence boundary at or before N words, default N = 500.
3. Synthesize every chunk in parallel with the chosen provider and voice; stream into the page when the provider streams (scenario 01).
4. Concatenate the chunk audio in chunk order with no added silence; provider default sample rate; one output file whose container is `stack`'s (drawn as mp3 in the mockup).
5. Intro and outro: each picked segment's text is one TTS request with the same provider and voice, stored as its own audio file with its duration; body chunking does not apply to them. A failed request fails the audio stage under the same rules.
6. Store on the project: the text sent per chunk and per segment, provider, voice, chunking choice, and every audio duration. Durations feed scenario 11 (video timing) and scenario 16 (audio hours).
7. Mark the stage `done`.

## Branches

- Article has the end-matter headings → files written and body trimmed; no such headings → nothing split, no files.
- Chunking mode → step 2's three cases.

## Unhappy paths

- Chunk call fails → scenario 01's retry policy per chunk, idle timeout when streamed.
- One chunk exhausts its retries → the whole stage fails; manual retry keeps completed chunks and re-runs only failed or not-started ones, then concatenates.
- Voice ID rejected by the provider → the error names the voice ID (scenario 02).
- Whole text longer than the provider's per-request limit → the provider's error surfaces as the stage failure; no pre-check.
- Narration source empty after the split → immediate stage failure "nothing to narrate", no retries.
- Interrupted process → stage failed "interrupted" (scenario 01); completed chunks kept for the retry.
- Cancel → scenario 13.

## State transitions

- Stage: per scenario 01.
- Per chunk, persisted for resume: `pending` → `running` → `done` | `failed`.

## Invariants

- Narration never contains end matter.
- Chunk order is preserved in the output file.
- Audio duration is recorded before the video stage starts (scenario 01 step 5).
- The concatenated body file plus the picked intro and outro files are the project's only audio outputs.

## Outcomes & side effects

- Success: one audio file, its duration, the per-chunk record, the sources and glossary files on the project; video may start once images and thumbnail are also ready.
- Failure: stage `failed` with the provider's error text (scenario 01).
- Audio hours counted by scenario 16 telemetry.

## Dimensions not in play

- D1 authority: no actor beyond the pipeline.
- D5 money: nothing charged in-app.
- D6 limits: no cap on text length or chunk count; the provider's own limits surface as errors.
- D13 notification: no channel.
