---
scenario: article-writing
mockup_row: S5
screens: [08-project]
depends_on: [01-pipeline-lifecycle, 02-provider-credentials, 03-placeholder-substitution, 05-provided-outputs, 06-research]
implements: [Q56, Q57, Q58, Q59, Q60, Q61, Q62, Q96, Q97, Q98]
generated_date: 2026-09-02
capstone_version: 5.2.0
source: logic-interview.md
---

# 07 Article writing

The article stage: one streamed LLM call from the rendered prompt and the research notes, stored as markdown plus a plain-text narration source. Rules cite `logic-interview.md §Q<n>`.

## Trigger & preconditions

- Trigger: scenario 01 step 3 starts the article stage when research is `done` or `skipped` and the article source is Generate.
- Preconditions: LLM provider keyed and model chosen (scenarios 02, 04); rendered article prompt on the project (scenario 03); research notes present when research ran (scenario 06).
- Actor: none beyond the pipeline (D1 not in play, §Q62).

## Steps

1. Compose one user message: with research, a fixed "Research notes" header followed by the notes, then the rendered article prompt; without research, the rendered prompt alone (§Q56). Provider default parameters; the app sets none (§Q61).
2. Stream the response into the project page as it arrives (scenario 01 §Q6).
3. Truncation: when the model stops at its output limit before the article ends, send a continuation call that appends the rest; at most 3 continuations; still unfinished after the third is a failed attempt (§Q59).
4. Store on the project: the markdown text exactly as the model produced it plus continuations, a plain-text copy with markdown syntax stripped as the narration source, and the exact messages sent (§Q57, §Q61). Sections the prompt requests ("Sources Consulted", "Pronunciation Glossary") stay in the text; scenario 08 decides what is narrated.
5. Intro and outro text: for each picked entry in LLM mode, one call with the filled entry as instruction plus the title, keyword values, and the plain-text article; the response is stored as that segment's text (§Q97, §Q98). Text-mode entries are stored as rendered per scenario 03 with no call. A failed call fails the article stage under the same retry rules (§Q96).
6. Mark the stage `done`; audio, images, and thumbnail start (scenario 01 step 4).

## Branches

- Research ran → notes included (§Q56); research Off or skipped → prompt alone.
- Output within the requested word range or not → accepted as written either way; the app does not count words (§Q58).
- Model finished naturally → no continuation; stopped at its limit → continuation loop of step 3 (§Q59).

## Unhappy paths

- Call fails → scenario 01's retry policy; for streaming calls the 120 s timeout is an idle timeout between chunks (§Q62).
- Empty response → failed attempt (§Q61).
- Failure mid-stream → partial text discarded; the retry regenerates the whole article (§Q60).
- Fourth truncation → failed attempt; retry regenerates the whole article (§Q59).
- Interrupted process → stage failed "interrupted" (scenario 01).
- Cancel → scenario 13.

## State transitions

- Stage: per scenario 01 (`pending` → `running` → `done` | `failed`; `failed` → `running` on retry; `done` → `running` only via scenario 12).

## Invariants

- Audio, images, and thumbnail never start before the article is `done` or `provided` (scenario 01 step 4).
- The narration source is always plain text (§Q57; scenario 05 §Q37).
- The stored article is the model's final text plus its continuations, never edited by the app (§Q57, §Q62). User edits are scenario 12's.

## Outcomes & side effects

- Success: markdown article, plain-text narration source, and sent messages on the project; downstream fan-out starts.
- Failure: stage `failed` with the provider's error text (scenario 01).
- Tokens used, continuations included, are counted by scenario 16 telemetry.

## Dimensions not in play

- D1 authority: no actor beyond the pipeline (§Q62).
- D4 computation: nothing computed; word counts are not verified (§Q58, §Q62).
- D5 money: nothing charged in-app (§Q62).
- D6 limits: none beyond the 3-continuation cap of step 3 (§Q62).
- D8 concurrency: one call at a time within the stage (§Q62).
- D13 notification: no channel (§Q62).
